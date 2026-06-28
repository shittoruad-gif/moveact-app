// 本日の予約準備画面
// 来店前に必要な情報(前回カルテ、回数券残、LINE状況、最終来店、禁忌・アレルギー)を1画面に集約
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useStoreSelection } from '../../stores/storeSelectionStore';

interface PrepItem {
  booking: any;
  customer: any;
  lastKarte: any | null;
  activeTickets: any[];
  lastCompletedVisit: string | null;
  completedCount: number;
}

export function BookingPrepScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { selectedStore } = useStoreSelection();
  const initialDate = route.params?.date ?? new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState<string>(initialDate);
  const [items, setItems] = useState<PrepItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const { data: bookings } = await supabase
      .from('app_bookings')
      .select(`
        *,
        treatment_menu:treatment_menus(name, duration_minutes),
        customer:profiles!app_bookings_user_id_fkey(
          id, full_name, full_name_kana, phone, date_of_birth, line_user_id
        )
      `)
      .eq('store_id', selectedStore)
      .gte('starts_at', `${date}T00:00:00`)
      .lte('starts_at', `${date}T23:59:59`)
      .neq('status', 'cancelled')
      .order('starts_at');

    const list: PrepItem[] = [];
    for (const b of bookings ?? []) {
      const userId = b.user_id;

      // Last karte
      const { data: kartes } = await supabase
        .from('kartes')
        .select('*, staff:profiles!kartes_staff_id_fkey(full_name)')
        .eq('customer_id', userId)
        .order('treatment_date', { ascending: false })
        .limit(1);

      // Active tickets
      const { data: tickets } = await supabase
        .from('user_tickets')
        .select('*, plan:ticket_plans(name)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('remaining_sessions', 0);

      // Last completed visit
      const { data: lastCompleted } = await supabase
        .from('app_bookings')
        .select('starts_at')
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('starts_at', { ascending: false })
        .limit(1);

      const { count } = await supabase
        .from('app_bookings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'completed');

      list.push({
        booking: b,
        customer: b.customer,
        lastKarte: kartes?.[0] ?? null,
        activeTickets: tickets ?? [],
        lastCompletedVisit: lastCompleted?.[0]?.starts_at ?? null,
        completedCount: count ?? 0,
      });
    }
    setItems(list);
    setLoading(false);
  }, [date, selectedStore]);

  useFocusEffect(
    useCallback(() => {
      fetchAll();
    }, [fetchAll])
  );

  function shiftDate(delta: number) {
    const d = new Date(date + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setDate(d.toISOString().slice(0, 10));
  }

  const dateObj = new Date(date + 'T00:00:00');
  const dateLabel = dateObj.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchAll} tintColor={COLORS.accent} />}
    >
      <View style={styles.dateBar}>
        <TouchableOpacity onPress={() => shiftDate(-1)} style={styles.dateBtn}>
          <Ionicons name="chevron-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.dateLabel}>{dateLabel}</Text>
        <TouchableOpacity onPress={() => shiftDate(1)} style={styles.dateBtn}>
          <Ionicons name="chevron-forward" size={20} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <Text style={styles.summary}>
        {items.length === 0 ? 'この日の予約はありません' : `${items.length}件の予約`}
      </Text>

      {items.map((it) => (
        <PrepCard
          key={it.booking.id}
          item={it}
          onOpenCustomer={() => navigation.navigate('CustomerDetail', { userId: it.customer.id })}
          onOpenKarte={() => it.lastKarte && navigation.navigate('KarteDetail', { karteId: it.lastKarte.id })}
          onCreateKarte={() => navigation.navigate('KarteForm', {
            customerId: it.customer.id, bookingId: it.booking.id,
          })}
        />
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function PrepCard({
  item, onOpenCustomer, onOpenKarte, onCreateKarte,
}: {
  item: PrepItem;
  onOpenCustomer: () => void;
  onOpenKarte: () => void;
  onCreateKarte: () => void;
}) {
  const start = new Date(item.booking.starts_at);
  const timeStr = start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const daysSince = item.lastCompletedVisit
    ? Math.floor((start.getTime() - new Date(item.lastCompletedVisit).getTime()) / 86400000)
    : null;
  const isNewCustomer = item.completedCount === 0;

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.timeBox}>
          <Text style={styles.timeText}>{timeStr}</Text>
          <Text style={styles.durationText}>
            {item.booking.treatment_menu?.duration_minutes ?? 0}分
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <TouchableOpacity onPress={onOpenCustomer}>
            <View style={styles.nameRow}>
              <Text style={styles.customerName}>{item.customer?.full_name ?? '---'}</Text>
              {item.customer?.line_user_id && (
                <View style={styles.lineBadge}>
                  <Ionicons name="chatbubble" size={9} color="#06C755" />
                  <Text style={styles.lineBadgeText}>LINE</Text>
                </View>
              )}
              {isNewCustomer && (
                <View style={styles.newBadge}>
                  <Text style={styles.newBadgeText}>NEW</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          {item.customer?.full_name_kana && (
            <Text style={styles.kana}>{item.customer.full_name_kana}</Text>
          )}
          <Text style={styles.menu}>
            {item.booking.treatment_menu?.name ?? ''}
          </Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatBox
          icon="calendar-outline"
          label="来店回数"
          value={`${item.completedCount}回`}
        />
        <StatBox
          icon="time-outline"
          label="最終来店"
          value={
            item.lastCompletedVisit
              ? `${daysSince}日前`
              : '初回'
          }
          danger={daysSince !== null && daysSince > 90}
        />
        <StatBox
          icon="ticket-outline"
          label="回数券"
          value={
            item.activeTickets.length > 0
              ? `${item.activeTickets.reduce((a, t) => a + t.remaining_sessions, 0)}回`
              : 'なし'
          }
        />
      </View>

      {/* Last karte */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="document-text-outline" size={14} color={COLORS.textSecondary} />
          <Text style={styles.sectionTitle}>前回カルテ</Text>
          {item.lastKarte && (
            <TouchableOpacity onPress={onOpenKarte}>
              <Text style={styles.openLink}>開く</Text>
            </TouchableOpacity>
          )}
        </View>
        {item.lastKarte ? (
          <View style={styles.karteBox}>
            <Text style={styles.karteDate}>
              {new Date(item.lastKarte.treatment_date).toLocaleDateString('ja-JP')}
              {item.lastKarte.staff?.full_name ? ` / ${item.lastKarte.staff.full_name}` : ''}
            </Text>
            {item.lastKarte.chief_complaint && (
              <KartePreview label="主訴" text={item.lastKarte.chief_complaint} />
            )}
            {item.lastKarte.treatment_content && (
              <KartePreview label="施術内容" text={item.lastKarte.treatment_content} />
            )}
            {item.lastKarte.treatment_plan && (
              <KartePreview label="今後の方針" text={item.lastKarte.treatment_plan} />
            )}
            {item.lastKarte.next_appointment_note && (
              <KartePreview label="次回メモ" text={item.lastKarte.next_appointment_note} highlight />
            )}
            {item.lastKarte.internal_memo && (
              <KartePreview label="内部メモ" text={item.lastKarte.internal_memo} warning />
            )}
          </View>
        ) : (
          <Text style={styles.noKarte}>カルテ未作成</Text>
        )}
      </View>

      {/* Note from staff booking */}
      {item.booking.note && (
        <View style={[styles.section, styles.noteSection]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="alert-circle-outline" size={14} color={COLORS.warning} />
            <Text style={[styles.sectionTitle, { color: COLORS.warning }]}>予約メモ</Text>
          </View>
          <Text style={styles.noteText}>{item.booking.note}</Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.actionBtn} onPress={onCreateKarte}>
          <Ionicons name="add-circle-outline" size={16} color={COLORS.accent} />
          <Text style={styles.actionBtnText}>カルテ作成</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={onOpenCustomer}>
          <Ionicons name="person-outline" size={16} color={COLORS.accent} />
          <Text style={styles.actionBtnText}>顧客詳細</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function StatBox({
  icon, label, value, danger,
}: { icon: any; label: string; value: string; danger?: boolean }) {
  return (
    <View style={styles.statBox}>
      <Ionicons name={icon} size={14} color={danger ? COLORS.error : COLORS.textSecondary} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, danger && { color: COLORS.error }]}>{value}</Text>
    </View>
  );
}

function KartePreview({
  label, text, highlight, warning,
}: { label: string; text: string; highlight?: boolean; warning?: boolean }) {
  return (
    <View style={styles.kartePreview}>
      <Text
        style={[
          styles.kartePreviewLabel,
          highlight && { color: COLORS.accent },
          warning && { color: COLORS.warning },
        ]}
      >
        {label}
      </Text>
      <Text style={styles.kartePreviewText} numberOfLines={3}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  dateBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  dateBtn: { padding: 6 },
  dateLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  summary: { fontSize: 12, color: COLORS.textSecondary, paddingHorizontal: 20, paddingVertical: 12 },
  card: {
    backgroundColor: COLORS.surface, marginHorizontal: 16, marginBottom: 12,
    borderRadius: 14, padding: 14, gap: 12,
  },
  cardHeader: { flexDirection: 'row', gap: 12 },
  timeBox: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accentLight, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 8, minWidth: 60,
  },
  timeText: { fontSize: 17, fontWeight: '700', color: COLORS.accent },
  durationText: { fontSize: 10, color: COLORS.accent, marginTop: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  customerName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  lineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: '#06C75515', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
  },
  lineBadgeText: { fontSize: 8, fontWeight: '700', color: '#06C755' },
  newBadge: {
    backgroundColor: COLORS.accent, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
  },
  newBadgeText: { fontSize: 8, fontWeight: '700', color: '#FFF' },
  kana: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  menu: { fontSize: 13, color: COLORS.textSecondary, marginTop: 4 },
  statsRow: { flexDirection: 'row', gap: 6 },
  statBox: {
    flex: 1, backgroundColor: COLORS.backgroundSoft, borderRadius: 10,
    paddingVertical: 8, alignItems: 'center', gap: 2,
  },
  statLabel: { fontSize: 10, color: COLORS.textSecondary },
  statValue: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  section: { gap: 6 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, flex: 1 },
  openLink: { fontSize: 11, color: COLORS.accent, fontWeight: '600' },
  karteBox: { gap: 8 },
  karteDate: { fontSize: 11, color: COLORS.textLight },
  noKarte: { fontSize: 12, color: COLORS.textLight, fontStyle: 'italic' },
  kartePreview: { },
  kartePreviewLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 2 },
  kartePreviewText: { fontSize: 12, color: COLORS.text, lineHeight: 17 },
  noteSection: {
    backgroundColor: COLORS.warning + '10', padding: 10, borderRadius: 8,
  },
  noteText: { fontSize: 12, color: COLORS.text, lineHeight: 17 },
  actionRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.accentLight,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
});
