// 予約の日時変更（リスケジュール）
// =====================================================
// 既存予約の店舗・メニュー・担当スタッフはそのままに、日時だけを変更する。
// 空き枠はサーバー(get-available-slots)で再計算（◎○△×）。顧客・スタッフ共通。
// 「キャンセル→取り直し」を避けることで当日キャンセル扱いを減らす狙い。
// =====================================================
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

interface AvailSlot { time: string; level: string; freeStaff: number }

export function RescheduleScreen({ route, navigation }: any) {
  const { bookingId } = route.params as { bookingId: string };
  const [booking, setBooking] = useState<any | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [slots, setSlots] = useState<AvailSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [isClosed, setIsClosed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchBooking(); }, []);
  useEffect(() => { if (booking) fetchSlots(); }, [booking, selectedDate]);

  async function fetchBooking() {
    const { data } = await supabase
      .from('app_bookings')
      .select('*, treatment_menu:treatment_menus(name, duration_minutes), profile:profiles(full_name)')
      .eq('id', bookingId)
      .single();
    setBooking(data);
    if (data?.starts_at) setSelectedDate(new Date(data.starts_at));
    setLoading(false);
  }

  async function fetchSlots() {
    setSlotsLoading(true);
    setIsClosed(false);
    try {
      const { data, error } = await supabase.functions.invoke('get-available-slots', {
        body: {
          storeId: booking.store_id,
          menuId: booking.treatment_menu_id,
          date: ymd(selectedDate),
          staffId: booking.staff_id ?? undefined, // 同じ担当で空きを探す
        },
      });
      if (error) throw error;
      if (data?.isClosed) { setIsClosed(true); setSlots([]); }
      else setSlots((data?.slots as AvailSlot[]) ?? []);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }

  function pick(time: string) {
    const [h, m] = time.split(':').map(Number);
    const newStart = new Date(selectedDate);
    newStart.setHours(h, m, 0, 0);
    const dur = booking.treatment_menu?.duration_minutes ?? 60;
    const newEnd = new Date(newStart.getTime() + dur * 60000);
    const label = newStart.toLocaleString('ja-JP', {
      month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
    });
    Alert.alert(
      '日時を変更しますか？',
      `${booking.treatment_menu?.name ?? 'ご予約'}\n変更後: ${label}`,
      [
        { text: 'やめる', style: 'cancel' },
        { text: 'この日時に変更', onPress: () => save(newStart, newEnd) },
      ],
    );
  }

  async function save(start: Date, end: Date) {
    setSaving(true);
    const { error } = await supabase
      .from('app_bookings')
      .update({ starts_at: start.toISOString(), ends_at: end.toISOString(), updated_at: new Date().toISOString() })
      .eq('id', bookingId);
    setSaving(false);
    if (error) { Alert.alert('エラー', '変更に失敗しました。時間をおいてお試しください。'); return; }
    // LINE連携済みなら変更通知（非ブロッキング）
    try {
      await supabase.functions.invoke('send-line-message', {
        body: { booking_id: bookingId, message_type: 'booking_created' },
      });
    } catch (_e) { /* non-fatal */ }
    Alert.alert('変更しました', 'ご予約の日時を変更しました。', [{ text: 'OK', onPress: () => navigation.goBack() }]);
  }

  if (loading || !booking) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.accent} /></View>;
  }

  const dates = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d;
  });
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  const oldLabel = new Date(booking.starts_at).toLocaleString('ja-JP', {
    month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <ScrollView style={styles.container}>
      {/* 現在の予約 */}
      <View style={styles.currentCard}>
        <Text style={styles.currentLabel}>現在のご予約</Text>
        <Text style={styles.currentMenu}>{booking.treatment_menu?.name ?? 'ご予約'}</Text>
        <Text style={styles.currentDt}>{oldLabel}</Text>
        <Text style={styles.currentStore}>Moveact {STORES[booking.store_id as keyof typeof STORES]?.name ?? ''}</Text>
      </View>

      {/* 日にち */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>変更先の日にち</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {dates.map((d) => {
            const sel = ymd(d) === ymd(selectedDate);
            const isSun = d.getDay() === 0;
            return (
              <TouchableOpacity key={d.toISOString()} style={[styles.dateChip, sel && styles.dateChipOn]} onPress={() => setSelectedDate(d)}>
                <Text style={[styles.dayName, sel && styles.dateTextOn, isSun && styles.sun]}>{dayNames[d.getDay()]}</Text>
                <Text style={[styles.dayNum, sel && styles.dateTextOn]}>{d.getDate()}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* 時間 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>変更先の時間</Text>
        {slotsLoading ? (
          <View style={styles.slotsLoading}><ActivityIndicator color={COLORS.accent} /></View>
        ) : isClosed ? (
          <View style={styles.notice}><Ionicons name="moon-outline" size={18} color={COLORS.textLight} /><Text style={styles.noticeText}>この日は定休日・お休みです</Text></View>
        ) : slots.length === 0 ? (
          <View style={styles.notice}><Ionicons name="sad-outline" size={18} color={COLORS.textLight} /><Text style={styles.noticeText}>空き枠がありません。別の日をお選びください</Text></View>
        ) : (
          <View style={styles.slotsGrid}>
            {slots.map((s) => (
              <TouchableOpacity key={s.time} style={styles.slotBtn} disabled={saving} onPress={() => pick(s.time)}>
                <Text style={styles.slotTime}>{s.time}</Text>
                <Text style={styles.slotLevel}>{s.level}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  currentCard: { backgroundColor: COLORS.surface, margin: 16, padding: 16, borderRadius: 14 },
  currentLabel: { fontSize: 11, color: COLORS.textLight },
  currentMenu: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 4 },
  currentDt: { fontSize: 14, color: COLORS.accent, fontWeight: '600', marginTop: 2 },
  currentStore: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 10 },
  dateChip: { width: 48, height: 64, borderRadius: 12, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', gap: 3 },
  dateChipOn: { backgroundColor: COLORS.accent },
  dayName: { fontSize: 11, fontWeight: '500', color: COLORS.textSecondary },
  dayNum: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  dateTextOn: { color: '#FFF' },
  sun: { color: COLORS.error },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotBtn: {
    width: '23%', paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.success, backgroundColor: COLORS.surface, gap: 2,
  },
  slotTime: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  slotLevel: { fontSize: 11, fontWeight: '600', color: COLORS.success },
  slotsLoading: { paddingVertical: 24, alignItems: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surface, padding: 16, borderRadius: 10 },
  noticeText: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
});
