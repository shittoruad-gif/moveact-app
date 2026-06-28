// 離脱顧客リスト
// 最終来店から一定期間が経過した顧客をリストアップ
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

type Threshold = 60 | 90 | 180;

export function InactiveCustomersScreen() {
  const navigation = useNavigation<any>();
  const [threshold, setThreshold] = useState<Threshold>(90);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('v_customer_last_visit')
      .select('*')
      .order('last_booking_at', { ascending: true, nullsFirst: false });
    setRows(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const filtered = useMemo(() => {
    const cutoff = Date.now() - threshold * 86400000;
    return rows.filter((r) => {
      if (!r.last_booking_at) return false; // No booking ever -> separate category
      const lb = new Date(r.last_booking_at).getTime();
      return lb < cutoff && r.total_completed_bookings > 0;
    });
  }, [rows, threshold]);

  const neverVisited = useMemo(() => {
    return rows.filter((r) => !r.last_booking_at && r.total_completed_bookings === 0);
  }, [rows]);

  function daysAgo(iso: string | null): number {
    if (!iso) return 9999;
    return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {[60, 90, 180].map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.filterChip, threshold === d && styles.filterChipActive]}
            onPress={() => setThreshold(d as Threshold)}
          >
            <Text style={[styles.filterText, threshold === d && styles.filterTextActive]}>
              {d}日以上
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={COLORS.accent} />}
        contentContainerStyle={{ padding: 16 }}
      >
        <View style={styles.summaryCard}>
          <Ionicons name="alert-circle" size={18} color={COLORS.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.summaryTitle}>{threshold}日以上来店なしの既存顧客</Text>
            <Text style={styles.summaryCount}>{filtered.length}名</Text>
          </View>
        </View>

        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>該当する顧客はいません 👍</Text>
          </View>
        ) : (
          filtered.map((r) => (
            <View key={r.user_id} style={styles.row}>
              <TouchableOpacity
                style={{ flex: 1 }}
                onPress={() => navigation.navigate('CustomerDetail', { userId: r.user_id })}
              >
                <Text style={styles.name}>{r.full_name}</Text>
                <Text style={styles.meta}>
                  最終来店: {daysAgo(r.last_booking_at)}日前 ・ 来店{r.total_completed_bookings}回
                </Text>
                <Text style={styles.metaSmall}>
                  登録: {new Date(r.registered_at).toLocaleDateString('ja-JP')}
                </Text>
              </TouchableOpacity>
              {r.line_user_id ? (
                <TouchableOpacity
                  style={styles.lineBtn}
                  onPress={() => navigation.navigate('LineMessageCompose', { customerId: r.user_id })}
                >
                  <Ionicons name="chatbubble" size={14} color="#06C755" />
                  <Text style={styles.lineBtnText}>フォロー</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.noLineBadge}>
                  <Text style={styles.noLineText}>LINE未連携</Text>
                </View>
              )}
            </View>
          ))
        )}

        {neverVisited.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>登録のみで未来店（{neverVisited.length}名）</Text>
            {neverVisited.slice(0, 30).map((r) => (
              <TouchableOpacity
                key={r.user_id}
                style={[styles.row, { opacity: 0.9 }]}
                onPress={() => navigation.navigate('CustomerDetail', { userId: r.user_id })}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{r.full_name}</Text>
                  <Text style={styles.meta}>
                    登録: {new Date(r.registered_at).toLocaleDateString('ja-JP')}
                  </Text>
                </View>
                {r.line_user_id && (
                  <View style={styles.lineBadgeSmall}>
                    <Ionicons name="chatbubble" size={10} color="#06C755" />
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  filterRow: {
    flexDirection: 'row', gap: 6, padding: 16,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
    backgroundColor: COLORS.backgroundSoft, borderWidth: 1, borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  filterTextActive: { color: '#FFF' },
  summaryCard: {
    flexDirection: 'row', gap: 10, alignItems: 'center',
    backgroundColor: COLORS.warning + '12', borderRadius: 12, padding: 14,
    marginBottom: 12,
  },
  summaryTitle: { fontSize: 12, color: COLORS.textSecondary },
  summaryCount: { fontSize: 22, fontWeight: '700', color: COLORS.warning, marginTop: 2 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 12, marginBottom: 6,
  },
  name: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  meta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  metaSmall: { fontSize: 10, color: COLORS.textLight, marginTop: 2 },
  lineBtn: {
    flexDirection: 'row', gap: 4, alignItems: 'center',
    backgroundColor: '#06C75515',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
  },
  lineBtnText: { fontSize: 11, fontWeight: '700', color: '#06C755' },
  noLineBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    backgroundColor: COLORS.backgroundSoft,
  },
  noLineText: { fontSize: 10, color: COLORS.textLight, fontWeight: '600' },
  lineBadgeSmall: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#06C75515', alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 24, marginBottom: 10 },
  emptyCard: { alignItems: 'center', padding: 30 },
  emptyText: { fontSize: 13, color: COLORS.textLight },
});
