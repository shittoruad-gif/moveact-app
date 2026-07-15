// キャンセル・無断欠席分析画面
// 月別キャンセル率、No-Show率、常習者リスト
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useStoreSelection } from '../../stores/storeSelectionStore';

type Period = '30d' | '90d' | '180d';

const PERIOD_LABELS: Record<Period, string> = {
  '30d': '過去30日', '90d': '過去90日', '180d': '過去180日',
};

export function CancellationReportScreen() {
  const navigation = useNavigation<any>();
  const { selectedStore } = useStoreSelection();
  const [period, setPeriod] = useState<Period>('90d');
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const sinceISO = useMemo(() => {
    const days = period === '30d' ? 30 : period === '90d' ? 90 : 180;
    return new Date(Date.now() - days * 86400000).toISOString();
  }, [period]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('app_bookings')
      .select('id, user_id, status, starts_at, treatment_menu:treatment_menus(name), profile:user_id(full_name, phone, line_user_id)')
      .eq('store_id', selectedStore)
      .gte('starts_at', sinceISO);
    setBookings(data ?? []);
    setLoading(false);
  }, [sinceISO, selectedStore]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const stats = useMemo(() => {
    const total = bookings.length;
    const cancelled = bookings.filter((b) => b.status === 'cancelled').length;
    const noShow = bookings.filter((b) => b.status === 'no_show').length;
    const completed = bookings.filter((b) => b.status === 'completed').length;
    const confirmed = bookings.filter((b) => b.status === 'confirmed').length;

    // Repeat offenders
    const repeatMap = new Map<string, { profile: any; cancelled: number; no_show: number; total: number }>();
    for (const b of bookings) {
      if (!b.user_id) continue;
      const cur = repeatMap.get(b.user_id) ?? { profile: b.profile, cancelled: 0, no_show: 0, total: 0 };
      cur.total += 1;
      if (b.status === 'cancelled') cur.cancelled += 1;
      if (b.status === 'no_show') cur.no_show += 1;
      repeatMap.set(b.user_id, cur);
    }
    const offenders = Array.from(repeatMap.entries())
      .map(([user_id, v]) => ({ user_id, ...v, bad: v.cancelled + v.no_show }))
      .filter((r) => r.bad >= 2)
      .sort((a, b) => b.bad - a.bad)
      .slice(0, 20);

    // By-day heatmap (7 weekdays)
    const byDay = [0, 0, 0, 0, 0, 0, 0];
    const byDayTotal = [0, 0, 0, 0, 0, 0, 0];
    for (const b of bookings) {
      const d = new Date(b.starts_at).getDay();
      byDayTotal[d]++;
      if (b.status === 'cancelled' || b.status === 'no_show') byDay[d]++;
    }

    return {
      total, cancelled, noShow, completed, confirmed,
      cancelRate: total > 0 ? (cancelled / total) * 100 : 0,
      noShowRate: total > 0 ? (noShow / total) * 100 : 0,
      offenders,
      byDay: byDay.map((v, i) => ({
        day: ['日','月','火','水','木','金','土'][i],
        rate: byDayTotal[i] > 0 ? (v / byDayTotal[i]) * 100 : 0,
        count: v,
      })),
    };
  }, [bookings]);

  const maxDayRate = Math.max(1, ...stats.byDay.map((d) => d.rate));

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={COLORS.accent} />}
    >
      {/* Period selector */}
      <View style={styles.periodRow}>
        {(['30d','90d','180d'] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodChip, period === p && styles.periodChipActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodChipText, period === p && styles.periodChipTextActive]}>
              {PERIOD_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Stats cards */}
      <View style={styles.kpiGrid}>
        <KpiCard label="総予約数" value={stats.total.toString()} color={COLORS.accent} />
        <KpiCard label="完了" value={stats.completed.toString()} color={COLORS.success} />
        <KpiCard
          label="キャンセル率"
          value={`${stats.cancelRate.toFixed(1)}%`}
          sub={`${stats.cancelled}件`}
          color={stats.cancelRate > 10 ? COLORS.error : COLORS.warning}
        />
        <KpiCard
          label="無断欠席率"
          value={`${stats.noShowRate.toFixed(1)}%`}
          sub={`${stats.noShow}件`}
          color={stats.noShowRate > 3 ? COLORS.error : COLORS.textSecondary}
        />
      </View>

      {/* Weekday chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>曜日別 キャンセル+無断率</Text>
        <View style={styles.chartCard}>
          {stats.byDay.map((d) => (
            <View key={d.day} style={styles.barRow}>
              <Text style={styles.barDay}>{d.day}</Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${(d.rate / maxDayRate) * 100}%` }]} />
              </View>
              <Text style={styles.barValue}>{d.rate.toFixed(1)}%</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Repeat offenders */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>要注意顧客（キャンセル+無断 2回以上）</Text>
        {stats.offenders.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>該当する顧客はいません 👍</Text>
          </View>
        ) : (
          stats.offenders.map((o) => (
            <TouchableOpacity
              key={o.user_id}
              style={styles.offenderRow}
              onPress={() => navigation.navigate('CustomerDetail', { userId: o.user_id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.offenderName}>{o.profile?.full_name ?? '---'}</Text>
                <Text style={styles.offenderDetail}>
                  キャンセル {o.cancelled} / 無断 {o.no_show} / 計 {o.total}回
                </Text>
              </View>
              <View style={[styles.badCountBadge, o.bad >= 3 && { backgroundColor: COLORS.error + '20' }]}>
                <Text style={[styles.badCountText, o.bad >= 3 && { color: COLORS.error }]}>
                  {o.bad}回
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <View style={[styles.kpiCard, { borderLeftColor: color }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      {sub && <Text style={styles.kpiSub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  periodRow: { flexDirection: 'row', gap: 6, padding: 16 },
  periodChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  periodChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  periodChipText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  periodChipTextActive: { color: '#FFF' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8, marginBottom: 4 },
  kpiCard: {
    width: '47%', backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 14, gap: 4, borderLeftWidth: 3,
  },
  kpiLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  kpiValue: { fontSize: 22, fontWeight: '700' },
  kpiSub: { fontSize: 11, color: COLORS.textLight },
  section: { padding: 16, gap: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  chartCard: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, gap: 6 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  barDay: { fontSize: 12, fontWeight: '700', color: COLORS.text, width: 18 },
  barTrack: { flex: 1, height: 12, backgroundColor: COLORS.borderLight, borderRadius: 6, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: COLORS.error + 'AA', borderRadius: 6 },
  barValue: { fontSize: 11, color: COLORS.textSecondary, width: 44, textAlign: 'right' },
  offenderRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 12, gap: 10,
    marginBottom: 6,
  },
  offenderName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  offenderDetail: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  badCountBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: COLORS.warning + '20',
  },
  badCountText: { fontSize: 12, fontWeight: '700', color: COLORS.warning },
  emptyCard: {
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 24, alignItems: 'center',
  },
  emptyText: { fontSize: 13, color: COLORS.textLight },
});
