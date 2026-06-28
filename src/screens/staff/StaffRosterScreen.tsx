// スタッフの店舗配属（ロスター）管理
// =====================================================
// どのスタッフがどの店舗で稼働するか（staff_stores）を切り替える。
// ここで「稼働ON」にしたスタッフだけが、その店舗の予約のスタッフ指名候補・
// おまかせの自動割当対象になる（get-available-slots / 予約確定が参照）。
// =====================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, Switch, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import type { StoreId } from '../../types/database';

const STORE_IDS: StoreId[] = ['tamashima', 'kanamitsu'];

interface StaffRow {
  id: string;
  full_name: string;
  role: string;
  stores: Record<string, boolean>; // store_id -> 稼働中か
}

export function StaffRosterScreen() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: staff }, { data: roster }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role').in('role', ['staff', 'admin']).order('full_name'),
      supabase.from('staff_stores').select('staff_id, store_id, is_active'),
    ]);
    const active = new Set(
      (roster ?? []).filter((r: any) => r.is_active).map((r: any) => `${r.staff_id}:${r.store_id}`),
    );
    const list: StaffRow[] = (staff ?? []).map((s: any) => ({
      id: s.id,
      full_name: s.full_name ?? '（名称未設定）',
      role: s.role,
      stores: Object.fromEntries(STORE_IDS.map((sid) => [sid, active.has(`${s.id}:${sid}`)])),
    }));
    setRows(list);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  async function toggle(staffId: string, storeId: StoreId, next: boolean) {
    // 楽観的更新
    setRows((prev) => prev.map((r) => (r.id === staffId ? { ...r, stores: { ...r.stores, [storeId]: next } } : r)));
    const { error } = await supabase.from('staff_stores').upsert(
      { staff_id: staffId, store_id: storeId, is_active: next },
      { onConflict: 'staff_id,store_id' },
    );
    if (error) fetchAll(); // 失敗時は再取得で巻き戻し
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.accent} /></View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.help}>
        <Ionicons name="information-circle-outline" size={16} color={COLORS.accent} />
        <Text style={styles.helpText}>
          稼働ONのスタッフが、その店舗の「指名候補」と「おまかせ予約の自動割当」の対象になります。
        </Text>
      </View>

      <View style={styles.headerRow}>
        <Text style={[styles.headCell, { flex: 1 }]}>スタッフ</Text>
        {STORE_IDS.map((sid) => (
          <Text key={sid} style={styles.headStore}>{STORES[sid].name}</Text>
        ))}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor={COLORS.accent} />}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.full_name}</Text>
              {item.role === 'admin' && <Text style={styles.roleTag}>管理者</Text>}
            </View>
            {STORE_IDS.map((sid) => (
              <View key={sid} style={styles.switchCell}>
                <Switch
                  value={item.stores[sid]}
                  onValueChange={(v) => toggle(item.id, sid, v)}
                  trackColor={{ true: COLORS.accent }}
                />
              </View>
            ))}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 40 }}
      />
    </View>
  );
}

const STORE_COL = 84;
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  help: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFF8F0', margin: 16, padding: 12, borderRadius: 10,
  },
  helpText: { flex: 1, fontSize: 12, color: COLORS.text, lineHeight: 18 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headCell: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  headStore: { width: STORE_COL, textAlign: 'center', fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.borderLight, backgroundColor: COLORS.surface,
  },
  name: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  roleTag: { fontSize: 10, color: COLORS.accent, fontWeight: '700', marginTop: 2 },
  switchCell: { width: STORE_COL, alignItems: 'center' },
});
