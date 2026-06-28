// 日次業務レポート
// 日付ごとに自動集計（売上/予約件数/キャンセル/無断欠席）+ チェックリスト + メモ
import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useStoreSelection } from '../../stores/storeSelectionStore';

const DEFAULT_CHECKLIST = [
  { key: 'morning_clean', label: '開店清掃', checked: false },
  { key: 'equipment_check', label: '機材点検', checked: false },
  { key: 'towel_stock', label: 'タオル補充', checked: false },
  { key: 'cash_register', label: 'レジ締め・金額確認', checked: false },
  { key: 'closing_clean', label: '閉店清掃', checked: false },
  { key: 'next_day_prep', label: '翌日予約の確認', checked: false },
  { key: 'door_lock', label: '戸締り', checked: false },
];

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
function shiftDate(s: string, delta: number): string {
  const d = new Date(s + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function DailyReportScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const profile = useAuthStore((s) => s.profile);
  const { selectedStore } = useStoreSelection();
  const [date, setDate] = useState<string>(route.params?.date ?? todayStr());
  const [reportId, setReportId] = useState<string | null>(null);
  const [checklist, setChecklist] = useState(DEFAULT_CHECKLIST);
  const [notes, setNotes] = useState('');
  const [closedAt, setClosedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [autoStats, setAutoStats] = useState({
    revenue: 0, bookings: 0, walkIns: 0, cancelled: 0, noShow: 0,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Load (or create blank) daily report
      const { data: report } = await supabase
        .from('daily_reports')
        .select('*')
        .eq('store_id', selectedStore)
        .eq('report_date', date)
        .maybeSingle();

      if (report) {
        setReportId(report.id);
        setChecklist(report.checklist ?? DEFAULT_CHECKLIST);
        setNotes(report.notes ?? '');
        setClosedAt(report.closed_at);
      } else {
        setReportId(null);
        setChecklist(DEFAULT_CHECKLIST);
        setNotes('');
        setClosedAt(null);
      }

      // Auto stats: fetch completed bookings + walk_in_sales + cancellations for this date
      const startISO = `${date}T00:00:00+09:00`;
      const endISO = `${date}T23:59:59+09:00`;
      const [bookingsRes, salesRes] = await Promise.all([
        supabase
          .from('app_bookings')
          .select('id, status, treatment_menu:treatment_menus(price)')
          .eq('store_id', selectedStore)
          .gte('starts_at', startISO)
          .lte('starts_at', endISO),
        supabase
          .from('walk_in_sales')
          .select('id, total')
          .eq('store_id', selectedStore)
          .gte('sold_at', startISO)
          .lte('sold_at', endISO),
      ]);
      const bks = bookingsRes.data ?? [];
      const sales = salesRes.data ?? [];
      let revenue = 0;
      let bookingsCompleted = 0;
      let cancelled = 0;
      let noShow = 0;
      for (const b of bks) {
        if (b.status === 'completed') {
          bookingsCompleted++;
          revenue += (b.treatment_menu as any)?.price ?? 0;
        }
        if (b.status === 'cancelled') cancelled++;
        if (b.status === 'no_show') noShow++;
      }
      for (const s of sales) revenue += s.total ?? 0;
      setAutoStats({
        revenue,
        bookings: bookingsCompleted,
        walkIns: sales.length,
        cancelled,
        noShow,
      });
      setLoading(false);
    })();
  }, [date, selectedStore]);

  function toggleCheck(key: string) {
    setChecklist((prev) => prev.map((c) => c.key === key ? { ...c, checked: !c.checked } : c));
  }

  async function handleSave(close: boolean) {
    setSaving(true);
    try {
      const payload: any = {
        report_date: date,
        store_id: selectedStore,
        author_id: profile?.id,
        revenue_total: autoStats.revenue,
        booking_count: autoStats.bookings,
        walk_in_count: autoStats.walkIns,
        cancellation_count: autoStats.cancelled,
        no_show_count: autoStats.noShow,
        checklist,
        notes: notes.trim() || null,
        closed_at: close ? new Date().toISOString() : closedAt,
        updated_at: new Date().toISOString(),
      };
      if (reportId) {
        const { error } = await supabase
          .from('daily_reports').update(payload).eq('id', reportId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('daily_reports').insert(payload).select('id').single();
        if (error) throw error;
        setReportId(data.id);
      }
      if (close) setClosedAt(new Date().toISOString());
      Alert.alert('保存完了', close ? '日報を締めました' : '下書きを保存しました');
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Date navigator */}
      <View style={styles.dateNav}>
        <TouchableOpacity onPress={() => setDate(shiftDate(date, -1))}>
          <Ionicons name="chevron-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.dateText}>
          {new Date(date).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
        </Text>
        <TouchableOpacity onPress={() => setDate(shiftDate(date, 1))}>
          <Ionicons name="chevron-forward" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.todayBtn} onPress={() => setDate(todayStr())}>
          <Text style={styles.todayBtnText}>今日</Text>
        </TouchableOpacity>
      </View>

      {closedAt && (
        <View style={styles.closedBanner}>
          <Ionicons name="lock-closed" size={14} color={COLORS.success} />
          <Text style={styles.closedText}>
            締め済み ({new Date(closedAt).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})
          </Text>
        </View>
      )}

      {/* Auto stats */}
      <View style={styles.statsGrid}>
        <Stat label="売上" value={`¥${autoStats.revenue.toLocaleString()}`} color={COLORS.accent} />
        <Stat label="施術数" value={`${autoStats.bookings}件`} color={COLORS.success} />
        <Stat label="手売り" value={`${autoStats.walkIns}件`} color={COLORS.accentPink} />
        <Stat label="キャンセル" value={`${autoStats.cancelled}件`} color={COLORS.warning} />
        <Stat label="無断" value={`${autoStats.noShow}件`} color={COLORS.error} />
      </View>

      {/* Checklist */}
      <Text style={styles.section}>業務チェックリスト</Text>
      <View style={styles.checklistCard}>
        {checklist.map((c) => (
          <TouchableOpacity
            key={c.key}
            style={styles.checkRow}
            onPress={() => toggleCheck(c.key)}
          >
            <Ionicons
              name={c.checked ? 'checkbox' : 'square-outline'}
              size={22}
              color={c.checked ? COLORS.accent : COLORS.textLight}
            />
            <Text style={[styles.checkLabel, c.checked && { textDecorationLine: 'line-through', color: COLORS.textLight }]}>
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Notes */}
      <Text style={styles.section}>メモ</Text>
      <TextInput
        style={styles.notesInput}
        multiline
        placeholder="特記事項（クレーム・設備トラブル・引継ぎ事項など）"
        placeholderTextColor={COLORS.textLight}
        value={notes}
        onChangeText={setNotes}
        textAlignVertical="top"
      />

      <View style={{ flexDirection: 'row', gap: 8, padding: 16 }}>
        <TouchableOpacity
          style={[styles.saveBtn, styles.draftBtn, saving && { opacity: 0.5 }]}
          onPress={() => handleSave(false)}
          disabled={saving}
        >
          <Ionicons name="save-outline" size={16} color={COLORS.text} />
          <Text style={[styles.saveBtnText, { color: COLORS.text }]}>保存</Text>
        </TouchableOpacity>
        {!closedAt && (
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: COLORS.accent, flex: 1 }, saving && { opacity: 0.5 }]}
            onPress={() => handleSave(true)}
            disabled={saving}
          >
            <Ionicons name="lock-closed" size={16} color="#FFF" />
            <Text style={styles.saveBtnText}>締める</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  dateNav: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 16, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  dateText: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: COLORS.text },
  todayBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: COLORS.accentLight,
  },
  todayBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  closedBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.success + '15',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  closedText: { fontSize: 11, color: COLORS.success, fontWeight: '700' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, paddingTop: 12, gap: 6 },
  statCard: {
    width: '48%', backgroundColor: COLORS.surface, borderRadius: 10,
    padding: 12, borderLeftWidth: 3,
  },
  statLabel: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '500' },
  statValue: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  section: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 20, paddingHorizontal: 16, marginBottom: 8 },
  checklistCard: {
    backgroundColor: COLORS.surface, marginHorizontal: 16, borderRadius: 12,
    padding: 4,
  },
  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  checkLabel: { fontSize: 14, color: COLORS.text, flex: 1 },
  notesInput: {
    backgroundColor: COLORS.surface, marginHorizontal: 16, borderRadius: 12,
    padding: 14, minHeight: 100, fontSize: 13, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.border,
  },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 14, borderRadius: 12,
  },
  draftBtn: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
