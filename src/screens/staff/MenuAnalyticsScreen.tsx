// メニュー別売上分析
// 施術メニューごとの予約数・売上・キャンセル率を可視化
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useStoreSelection } from '../../stores/storeSelectionStore';

type Period = '30d' | '90d' | '180d' | '365d';

const PERIOD_LABELS: Record<Period, string> = {
  '30d': '過去30日', '90d': '過去90日', '180d': '過去180日', '365d': '過去1年',
};

export function MenuAnalyticsScreen() {
  const { selectedStore } = useStoreSelection();
  const [period, setPeriod] = useState<Period>('90d');
  const [menus, setMenus] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const sinceISO = useMemo(() => {
    const days = period === '30d' ? 30 : period === '90d' ? 90 : period === '180d' ? 180 : 365;
    return new Date(Date.now() - days * 86400000).toISOString();
  }, [period]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [menuRes, bookingRes] = await Promise.all([
      supabase.from('treatment_menus').select('id, name, price, duration_minutes, is_active').order('sort_order'),
      supabase.from('app_bookings')
        .select('id, status, treatment_menu_id, starts_at')
        .eq('store_id', selectedStore)
        .gte('starts_at', sinceISO),
    ]);
    setMenus(menuRes.data ?? []);
    setBookings(bookingRes.data ?? []);
    setLoading(false);
  }, [sinceISO, selectedStore]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const stats = useMemo(() => {
    const byMenu = new Map<string, { completed: number; cancelled: number; noShow: number; confirmed: number }>();
    for (const b of bookings) {
      if (!b.treatment_menu_id) continue;
      const cur = byMenu.get(b.treatment_menu_id) ?? { completed: 0, cancelled: 0, noShow: 0, confirmed: 0 };
      if (b.status === 'completed') cur.completed++;
      else if (b.status === 'cancelled') cur.cancelled++;
      else if (b.status === 'no_show') cur.noShow++;
      else if (b.status === 'confirmed') cur.confirmed++;
      byMenu.set(b.treatment_menu_id, cur);
    }

    const rows = menus.map((m) => {
      const s = byMenu.get(m.id) ?? { completed: 0, cancelled: 0, noShow: 0, confirmed: 0 };
      const total = s.completed + s.cancelled + s.noShow + s.confirmed;
      const revenue = s.completed * m.price;
      const cancelRate = total > 0 ? ((s.cancelled + s.noShow) / total) * 100 : 0;
      return { ...m, ...s, total, revenue, cancelRate };
    });

    rows.sort((a, b) => b.revenue - a.revenue);

    const grandRevenue = rows.reduce((sum, r) => sum + r.revenue, 0);
    const grandCompleted = rows.reduce((sum, r) => sum + r.completed, 0);
    return { rows, grandRevenue, grandCompleted };
  }, [menus, bookings]);

  const maxRevenue = Math.max(1, ...stats.rows.map((r) => r.revenue));

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={COLORS.accent} />}
    >
      {/* Period */}
      <View style={styles.periodRow}>
        {(['30d','90d','180d','365d'] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodChip, period === p && styles.periodChipActive]}
            onPress={() => setPeriod(p)}
          >
            <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
              {PERIOD_LABELS[p]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary */}
      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryLabel}>期間売上（施術のみ）</Text>
          <Text style={styles.summaryValue}>¥{stats.grandRevenue.toLocaleString()}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.summaryLabel}>施術件数</Text>
          <Text style={[styles.summaryValue, { fontSize: 20 }]}>{stats.grandCompleted}件</Text>
        </View>
      </View>

      {/* Rows */}
      {stats.rows.map((r) => (
        <View key={r.id} style={styles.menuCard}>
          <View style={styles.menuHead}>
            <Text style={styles.menuName} numberOfLines={1}>{r.name}</Text>
            <Text style={styles.menuPrice}>¥{r.price.toLocaleString()} / {r.duration_minutes}分</Text>
          </View>

          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${(r.revenue / maxRevenue) * 100}%` }]} />
            <Text style={styles.barValue}>¥{r.revenue.toLocaleString()}</Text>
          </View>

          <View style={styles.statsRow}>
            <StatChip icon="checkmark-circle" color={COLORS.success} value={r.completed} label="完了" />
            <StatChip icon="calendar" color={COLORS.accent} value={r.confirmed} label="予約中" />
            <StatChip icon="close-circle" color={COLORS.warning} value={r.cancelled} label="キャンセル" />
            <StatChip icon="alert" color={COLORS.error} value={r.noShow} label="無断" />
          </View>

          {r.total > 0 && (
            <Text style={styles.cancelRate}>
              キャンセル+無断率: <Text style={{
                color: r.cancelRate > 15 ? COLORS.error : r.cancelRate > 5 ? COLORS.warning : COLORS.success,
                fontWeight: '700',
              }}>{r.cancelRate.toFixed(1)}%</Text>
            </Text>
          )}
        </View>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function StatChip({ icon, color, value, label }: { icon: string; color: string; value: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Ionicons name={icon as any} size={14} color={color} />
      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.text }}>{value}</Text>
      <Text style={{ fontSize: 9, color: COLORS.textLight }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  periodRow: { flexDirection: 'row', gap: 6, padding: 12, flexWrap: 'wrap' },
  periodChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  periodChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  periodText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  periodTextActive: { color: '#FFF' },
  summaryCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.accent + '10', marginHorizontal: 16,
    padding: 16, borderRadius: 12,
  },
  summaryLabel: { fontSize: 10, color: COLORS.textSecondary },
  summaryValue: { fontSize: 26, fontWeight: '700', color: COLORS.accent, marginTop: 2 },
  menuCard: {
    backgroundColor: COLORS.surface, marginHorizontal: 16, marginTop: 10,
    padding: 14, borderRadius: 12,
  },
  menuHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  menuName: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text },
  menuPrice: { fontSize: 11, color: COLORS.textSecondary },
  barTrack: {
    height: 24, backgroundColor: COLORS.borderLight, borderRadius: 6,
    overflow: 'hidden', marginBottom: 10, justifyContent: 'center',
  },
  barFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: COLORS.accent + 'AA', borderRadius: 6,
  },
  barValue: { fontSize: 11, color: COLORS.text, fontWeight: '700', paddingHorizontal: 8 },
  statsRow: { flexDirection: 'row', gap: 4, paddingVertical: 6 },
  cancelRate: { fontSize: 11, color: COLORS.textSecondary, marginTop: 6, textAlign: 'right' },
});
