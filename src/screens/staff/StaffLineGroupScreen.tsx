// スタッフのグループLINE通知 設定
// =====================================================
// 公式LINEボットをスタッフのグループに追加すると、Webhookで自動登録される。
// この画面では、登録済みグループの確認・通知ON/OFF・店舗の割り当て・削除ができる。
// =====================================================
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import type { StoreId } from '../../types/database';

// 公式LINEのWebhook設定に使うURL（LINE Developers Console に登録）
const WEBHOOK_URL = 'https://khsriogicdjdyivshplc.supabase.co/functions/v1/line-webhook';

interface Group {
  id: string;
  group_id: string;
  label: string | null;
  store_id: StoreId | null;
  notify_on_booking: boolean;
  is_active: boolean;
}

export function StaffLineGroupScreen() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('line_notify_groups').select('*').order('created_at', { ascending: false });
    setGroups((data as Group[]) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchGroups(); }, [fetchGroups]));

  async function patch(id: string, fields: Partial<Group>) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...fields } : g)));
    await supabase.from('line_notify_groups').update(fields).eq('id', id);
  }

  function setStore(g: Group, store: StoreId | null) {
    patch(g.id, { store_id: store });
  }

  function remove(id: string) {
    Alert.alert('削除', 'この通知先を削除しますか？（再登録はグループで「通知登録」と送信）', [
      { text: 'やめる', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => { await supabase.from('line_notify_groups').delete().eq('id', id); fetchGroups(); },
      },
    ]);
  }

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchGroups} tintColor={COLORS.accent} />}>
      {/* セットアップ手順 */}
      <View style={styles.guide}>
        <Text style={styles.guideTitle}>設定の手順（初回のみ）</Text>
        <Step n="1" text="LINE公式アカウントの「Webhook」をオンにし、Webhook URL に下記を設定" />
        <View style={styles.urlBox}><Text selectable style={styles.urlText}>{WEBHOOK_URL}</Text></View>
        <Step n="2" text="LINE Developers で「ボットをグループに参加させる」を許可する" />
        <Step n="3" text="スタッフのグループLINEに、当店の公式LINEを招待する" />
        <Step n="4" text="自動でこの画面に登録されます（うまくいかない時はグループで「通知登録」と送信）" />
      </View>

      <Text style={styles.sectionHead}>登録済みの通知先</Text>
      {loading ? (
        <View style={{ paddingVertical: 30 }}><ActivityIndicator color={COLORS.accent} /></View>
      ) : groups.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="chatbubbles-outline" size={28} color={COLORS.textLight} />
          <Text style={styles.emptyText}>まだ登録がありません。{'\n'}グループに公式LINEを招待してください。</Text>
        </View>
      ) : (
        groups.map((g) => (
          <View key={g.id} style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="people" size={18} color={COLORS.accent} />
              <Text style={styles.cardTitle}>{g.label ?? 'スタッフグループ'}</Text>
              <TouchableOpacity onPress={() => remove(g.id)}><Ionicons name="trash-outline" size={16} color={COLORS.error} /></TouchableOpacity>
            </View>
            <Text style={styles.groupId}>ID: …{g.group_id.slice(-8)}</Text>

            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>予約通知を送る</Text>
              <Switch value={g.notify_on_booking} onValueChange={(v) => patch(g.id, { notify_on_booking: v })} trackColor={{ true: COLORS.accent }} />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>有効</Text>
              <Switch value={g.is_active} onValueChange={(v) => patch(g.id, { is_active: v })} trackColor={{ true: COLORS.accent }} />
            </View>

            <Text style={styles.scopeLabel}>通知する店舗</Text>
            <View style={styles.scopeRow}>
              <Chip label="全店" active={g.store_id === null} onPress={() => setStore(g, null)} />
              <Chip label={STORES.tamashima.name} active={g.store_id === 'tamashima'} onPress={() => setStore(g, 'tamashima')} />
              <Chip label={STORES.kanamitsu.name} active={g.store_id === 'kanamitsu'} onPress={() => setStore(g, 'kanamitsu')} />
            </View>
          </View>
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}><Text style={styles.stepNumText}>{n}</Text></View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  guide: { backgroundColor: '#FFF8F0', margin: 16, padding: 16, borderRadius: 14 },
  guideTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  step: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  stepNumText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  stepText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 19 },
  urlBox: { backgroundColor: COLORS.surface, borderRadius: 8, padding: 10, marginBottom: 10, marginLeft: 32 },
  urlText: { fontSize: 11, color: COLORS.accent, fontWeight: '600' },
  sectionHead: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, paddingHorizontal: 20, marginTop: 8, marginBottom: 8 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 13, color: COLORS.textLight, textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: COLORS.surface, marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  groupId: { fontSize: 11, color: COLORS.textLight, marginTop: 4, marginBottom: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 },
  toggleLabel: { fontSize: 14, color: COLORS.text },
  scopeLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  scopeRow: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  chipOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  chipTextOn: { color: '#FFF' },
});
