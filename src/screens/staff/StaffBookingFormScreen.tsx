import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { supabase } from '../../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { StaffStackParamList } from '../../types/navigation';
import type { TreatmentMenu, AppBooking, Profile } from '../../types/database';

type Props = NativeStackScreenProps<StaffStackParamList, 'StaffBookingForm'>;

const BUFFER_MINUTES = 15;
const TIME_SLOTS = Array.from({ length: 20 }, (_, i) => {
  const h = Math.floor(i / 2) + 9; // 9:00 ~ 18:30
  const m = (i % 2) * 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

// 繰り返し間隔（週単位）。0 = 繰り返しなし（単発）。サロンボード式。
const RECUR_OPTIONS: { weeks: number; label: string }[] = [
  { weeks: 0, label: '繰り返しなし' },
  { weeks: 1, label: '毎週' },
  { weeks: 2, label: '隔週（2週ごと）' },
  { weeks: 3, label: '3週ごと' },
  { weeks: 4, label: '4週ごと' },
];
// 作成する回数（初回を含む）
const RECUR_COUNTS = [2, 4, 6, 8, 12, 24];

// UUID v4（同一シリーズの予約で共有する識別子）
function uuidv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function StaffBookingFormScreen({ route, navigation }: Props) {
  const { customerId, presetMenuId } = route.params;
  const { selectedStore } = useStoreSelection();

  const [customer, setCustomer] = useState<Profile | null>(null);
  const [menus, setMenus] = useState<TreatmentMenu[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<string>(presetMenuId ?? '');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [existingBookings, setExistingBookings] = useState<AppBooking[]>([]);
  const [note, setNote] = useState<string>('');
  const [sendLine, setSendLine] = useState<boolean>(true);
  const [recurWeeks, setRecurWeeks] = useState<number>(0); // 0=単発
  const [recurCount, setRecurCount] = useState<number>(4);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { fetchInitial(); }, []);
  useEffect(() => { fetchBookings(); }, [selectedDate, selectedStore]);

  async function fetchInitial() {
    const [custRes, menuRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', customerId).single(),
      supabase.from('treatment_menus').select('*').eq('is_active', true).order('sort_order'),
    ]);
    setCustomer(custRes.data as Profile);
    const menuList = (menuRes.data as TreatmentMenu[]) ?? [];
    setMenus(menuList);
    if (!selectedMenu && menuList.length > 0) setSelectedMenu(menuList[0].id);
    setLoading(false);
  }

  async function fetchBookings() {
    const dateStr = formatDate(selectedDate);
    const { data } = await supabase
      .from('app_bookings')
      .select('*')
      .eq('store_id', selectedStore)
      .gte('starts_at', `${dateStr}T00:00:00`)
      .lte('starts_at', `${dateStr}T23:59:59`)
      .neq('status', 'cancelled');
    setExistingBookings((data as AppBooking[]) ?? []);
  }

  const currentMenu = menus.find((m) => m.id === selectedMenu);

  const dates = useMemo(() => {
    const result: Date[] = [];
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      result.push(d);
    }
    return result;
  }, []);

  function isSlotAvailable(timeStr: string): boolean {
    if (!currentMenu) return false;
    const [h, m] = timeStr.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(h, m, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + currentMenu.duration_minutes * 60000);
    const bufStart = new Date(slotStart.getTime() - BUFFER_MINUTES * 60000);
    const bufEnd = new Date(slotEnd.getTime() + BUFFER_MINUTES * 60000);

    for (const b of existingBookings) {
      const bStart = new Date(new Date(b.starts_at).getTime() - (b.buffer_before ?? BUFFER_MINUTES) * 60000);
      const bEnd = new Date(new Date(b.ends_at).getTime() + (b.buffer_after ?? BUFFER_MINUTES) * 60000);
      if (bufStart < bEnd && bufEnd > bStart) return false;
    }
    return true;
  }

  // 繰り返し設定から予約日時の一覧を作る（初回=selectedDate, 以降 recurWeeks週ごと）
  function buildOccurrences(): { start: Date; end: Date }[] {
    const [h, m] = selectedTime.split(':').map(Number);
    const count = recurWeeks === 0 ? 1 : recurCount;
    const out: { start: Date; end: Date }[] = [];
    for (let i = 0; i < count; i++) {
      const start = new Date(selectedDate);
      start.setDate(selectedDate.getDate() + i * recurWeeks * 7);
      start.setHours(h, m, 0, 0);
      const end = new Date(start.getTime() + (currentMenu!.duration_minutes) * 60000);
      out.push({ start, end });
    }
    return out;
  }

  async function handleConfirm() {
    if (!customer || !currentMenu || !selectedTime) {
      Alert.alert('入力不足', 'メニューと時間を選択してください');
      return;
    }

    const occurrences = buildOccurrences();

    // 単発はそのまま作成。定期は全候補日の重複をまとめてチェック。
    if (recurWeeks === 0) {
      await createSeries(occurrences, null);
      return;
    }

    setSubmitting(true);
    try {
      // 全候補日にまたがる既存予約を取得し、各回の重複を判定
      const first = occurrences[0].start;
      const last = occurrences[occurrences.length - 1].end;
      const rangeStart = new Date(first); rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(last); rangeEnd.setHours(23, 59, 59, 999);
      const { data: existing } = await supabase
        .from('app_bookings')
        .select('starts_at, ends_at, buffer_before, buffer_after')
        .eq('store_id', selectedStore)
        .neq('status', 'cancelled')
        .gte('starts_at', rangeStart.toISOString())
        .lte('starts_at', rangeEnd.toISOString());

      const conflicts: { start: Date; end: Date }[] = [];
      const oks: { start: Date; end: Date }[] = [];
      for (const o of occurrences) {
        const bufS = o.start.getTime() - BUFFER_MINUTES * 60000;
        const bufE = o.end.getTime() + BUFFER_MINUTES * 60000;
        const clash = (existing ?? []).some((b: any) => {
          const bS = new Date(b.starts_at).getTime() - (b.buffer_before ?? BUFFER_MINUTES) * 60000;
          const bE = new Date(b.ends_at).getTime() + (b.buffer_after ?? BUFFER_MINUTES) * 60000;
          return bufS < bE && bufE > bS;
        });
        (clash ? conflicts : oks).push(o);
      }

      setSubmitting(false);

      if (oks.length === 0) {
        Alert.alert('作成できません', 'すべての候補日が既存予約と重複しています。日時を見直してください。');
        return;
      }

      const summary = oks.map((o) => fmtJp(o.start)).join('\n');
      const conflictMsg = conflicts.length > 0
        ? `\n\n⚠️ 重複のため除外する回（${conflicts.length}件）:\n${conflicts.map((o) => fmtJp(o.start)).join('\n')}`
        : '';

      Alert.alert(
        `定期予約を${oks.length}件作成しますか？`,
        `${customer.full_name}様 / ${currentMenu.name}\n\n作成する日時:\n${summary}${conflictMsg}`,
        [
          { text: 'やめる', style: 'cancel' },
          { text: `${oks.length}件を作成`, onPress: () => createSeries(oks, uuidv4()) },
        ],
      );
    } catch (e: any) {
      setSubmitting(false);
      Alert.alert('エラー', e?.message ?? '予約の確認に失敗しました');
    }
  }

  // 予約をまとめて作成（groupId があれば定期予約シリーズ）
  async function createSeries(items: { start: Date; end: Date }[], groupId: string | null) {
    if (!customer || !currentMenu) return;
    setSubmitting(true);
    try {
      const rows = items.map((o) => ({
        user_id: customer.id,
        store_id: selectedStore,
        treatment_menu_id: currentMenu.id,
        starts_at: o.start.toISOString(),
        ends_at: o.end.toISOString(),
        buffer_before: BUFFER_MINUTES,
        buffer_after: BUFFER_MINUTES,
        status: 'confirmed',
        note: note.trim() || null,
        created_by: 'staff' as const,
        recurrence_group_id: groupId,
      }));
      const { data: inserted, error } = await supabase.from('app_bookings').insert(rows).select('id');
      if (error) throw error;

      // スタッフのグループLINEへ予約通知（定期は初回分＋件数を付記・非ブロッキング）
      const firstBookingId = inserted?.[0]?.id;
      if (firstBookingId) {
        supabase.functions.invoke('notify-staff-group', {
          body: { bookingId: firstBookingId, seriesCount: rows.length > 1 ? rows.length : undefined },
        }).catch(() => {});
      }

      // LINE通知は初回分のみ送信（定期は連続送信を避ける）
      const firstId = inserted?.[0]?.id;
      if (sendLine && customer.line_user_id && firstId) {
        try {
          await supabase.functions.invoke('send-line-message', {
            body: { booking_id: firstId, message_type: 'booking_created' },
          });
        } catch (lineErr) {
          console.warn('LINE notification failed (booking still created):', lineErr);
        }
      }

      const n = rows.length;
      Alert.alert(
        n > 1 ? `定期予約を${n}件作成しました` : '予約を作成しました',
        sendLine && customer.line_user_id
          ? `${customer.full_name}様のLINEに${n > 1 ? '初回分の' : ''}予約日時を送信しました。`
          : `${customer.full_name}様の予約を登録しました。`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '予約作成に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Customer header */}
      <View style={styles.customerCard}>
        <View style={styles.customerAvatar}>
          <Text style={styles.customerAvatarText}>{customer?.full_name?.charAt(0) ?? '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.customerName}>{customer?.full_name}様</Text>
          <View style={styles.customerMeta}>
            {customer?.line_user_id ? (
              <View style={styles.lineBadge}>
                <Ionicons name="chatbubble" size={11} color="#06C755" />
                <Text style={styles.lineBadgeText}>LINE連携済</Text>
              </View>
            ) : (
              <View style={styles.noLineBadge}>
                <Ionicons name="chatbubble-outline" size={11} color={COLORS.textLight} />
                <Text style={styles.noLineBadgeText}>LINE未連携</Text>
              </View>
            )}
            <Text style={styles.customerStore}>{STORES[selectedStore].name}</Text>
          </View>
        </View>
      </View>

      {/* Menu */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>メニュー</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuScroll}>
          {menus.map((m) => {
            const isSelected = selectedMenu === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.menuChip, isSelected && styles.menuChipSelected]}
                onPress={() => setSelectedMenu(m.id)}
              >
                <Text style={[styles.menuChipText, isSelected && styles.menuChipTextSelected]}>{m.name}</Text>
                <Text style={[styles.menuDuration, isSelected && styles.menuDurationSelected]}>
                  {m.duration_minutes}分 · ¥{m.price.toLocaleString()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Date */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>日にち</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
          {dates.map((d) => {
            const isSelected = formatDate(d) === formatDate(selectedDate);
            const isSunday = d.getDay() === 0;
            return (
              <TouchableOpacity
                key={d.toISOString()}
                style={[styles.dateChip, isSelected && styles.dateChipSelected]}
                onPress={() => { setSelectedDate(d); setSelectedTime(''); }}
              >
                <Text style={[styles.dayName, isSelected && styles.dateTextSelected, isSunday && styles.sundayText]}>
                  {dayNames[d.getDay()]}
                </Text>
                <Text style={[styles.dayNumber, isSelected && styles.dateTextSelected]}>{d.getDate()}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Time */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>時間</Text>
        <View style={styles.slotsGrid}>
          {TIME_SLOTS.map((slot) => {
            const available = isSlotAvailable(slot);
            const isSelected = selectedTime === slot;
            return (
              <TouchableOpacity
                key={slot}
                style={[
                  styles.slotButton,
                  available ? styles.slotAvailable : styles.slotUnavailable,
                  isSelected && styles.slotSelected,
                ]}
                disabled={!available}
                onPress={() => setSelectedTime(slot)}
              >
                <Text
                  style={[
                    styles.slotText,
                    available ? styles.slotTextAvailable : styles.slotTextUnavailable,
                    isSelected && styles.slotTextSelected,
                  ]}
                >
                  {slot}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* 繰り返し（定期予約・サロンボード式） */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>繰り返し（定期予約）</Text>
        <View style={styles.recurGrid}>
          {RECUR_OPTIONS.map((opt) => {
            const sel = recurWeeks === opt.weeks;
            return (
              <TouchableOpacity
                key={opt.weeks}
                style={[styles.recurChip, sel && styles.recurChipSelected]}
                onPress={() => setRecurWeeks(opt.weeks)}
              >
                <Text style={[styles.recurChipText, sel && styles.recurChipTextSelected]}>{opt.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {recurWeeks > 0 && (
          <>
            <Text style={[styles.sectionTitle, { marginTop: 14 }]}>回数（初回を含む）</Text>
            <View style={styles.recurGrid}>
              {RECUR_COUNTS.map((c) => {
                const sel = recurCount === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[styles.countChip, sel && styles.recurChipSelected]}
                    onPress={() => setRecurCount(c)}
                  >
                    <Text style={[styles.recurChipText, sel && styles.recurChipTextSelected]}>{c}回</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {selectedTime !== '' && (
              <View style={styles.recurPreview}>
                <Ionicons name="repeat-outline" size={14} color={COLORS.accent} />
                <Text style={styles.recurPreviewText}>
                  {fmtJp(buildOccurrences()[0].start)} から {RECUR_OPTIONS.find((o) => o.weeks === recurWeeks)?.label}・
                  全{recurCount}回（最終 {fmtJp(buildOccurrences()[buildOccurrences().length - 1].start)}）
                </Text>
              </View>
            )}
          </>
        )}
      </View>

      {/* Note */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>メモ（任意）</Text>
        <TextInput
          style={styles.noteInput}
          placeholder="施術時の注意事項など"
          placeholderTextColor={COLORS.textLight}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={300}
        />
      </View>

      {/* LINE toggle */}
      {customer?.line_user_id && (
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.lineToggle}
            onPress={() => setSendLine(!sendLine)}
            activeOpacity={0.7}
          >
            <View style={styles.lineToggleLeft}>
              <Ionicons name="chatbubble-ellipses" size={18} color="#06C755" />
              <View>
                <Text style={styles.lineToggleTitle}>LINEに予約日時を送信</Text>
                <Text style={styles.lineToggleSub}>公式LINEから予約確認メッセージをお送りします</Text>
              </View>
            </View>
            <View style={[styles.switchTrack, sendLine && styles.switchTrackOn]}>
              <View style={[styles.switchThumb, sendLine && styles.switchThumbOn]} />
            </View>
          </TouchableOpacity>
        </View>
      )}

      {!customer?.line_user_id && (
        <View style={styles.warnCard}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.warning} />
          <Text style={styles.warnText}>
            このお客様はまだLINE連携されていません。予約は作成されますが、LINE通知は送信されません。
          </Text>
        </View>
      )}

      {/* Submit */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.submitBtn,
            (!selectedTime || submitting) && styles.submitBtnDisabled,
          ]}
          onPress={handleConfirm}
          disabled={!selectedTime || submitting}
        >
          <Text style={styles.submitBtnText}>
            {submitting ? '処理中...' : recurWeeks > 0 ? `定期予約を作成する（全${recurCount}回）` : '予約を作成する'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 「6/25(水) 14:00」形式
function fmtJp(d: Date): string {
  const dow = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()}(${dow}) ${hh}:${mm}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  customerCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, margin: 16, padding: 16, borderRadius: 14,
  },
  customerAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.accentLight, justifyContent: 'center', alignItems: 'center',
  },
  customerAvatarText: { fontSize: 20, fontWeight: '600', color: COLORS.accent },
  customerName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  customerMeta: { flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 },
  lineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#06C75515', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  lineBadgeText: { fontSize: 10, fontWeight: '700', color: '#06C755' },
  noLineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.backgroundSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  noLineBadgeText: { fontSize: 10, fontWeight: '600', color: COLORS.textLight },
  customerStore: { fontSize: 11, color: COLORS.textSecondary },
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 10 },
  menuScroll: { gap: 8 },
  menuChip: {
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12,
    backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center',
  },
  menuChipSelected: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  menuChipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  menuChipTextSelected: { color: '#FFF' },
  menuDuration: { fontSize: 11, color: COLORS.textSecondary, marginTop: 3 },
  menuDurationSelected: { color: 'rgba(255,255,255,0.85)' },
  dateScroll: { gap: 8 },
  dateChip: {
    width: 48, height: 64, borderRadius: 12,
    backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', gap: 3,
  },
  dateChipSelected: { backgroundColor: COLORS.accent },
  dayName: { fontSize: 11, fontWeight: '500', color: COLORS.textSecondary },
  dayNumber: { fontSize: 17, fontWeight: '600', color: COLORS.text },
  dateTextSelected: { color: '#FFF' },
  sundayText: { color: COLORS.error },
  slotsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotButton: {
    width: '23%', paddingVertical: 10, borderRadius: 10,
    alignItems: 'center', borderWidth: 1.5,
  },
  slotAvailable: { backgroundColor: COLORS.surface, borderColor: COLORS.success },
  slotUnavailable: { backgroundColor: COLORS.backgroundSoft, borderColor: COLORS.borderLight },
  slotSelected: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  slotText: { fontSize: 14, fontWeight: '600' },
  slotTextAvailable: { color: COLORS.text },
  slotTextUnavailable: { color: COLORS.textLight },
  slotTextSelected: { color: '#FFF' },
  noteInput: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14,
    fontSize: 13, color: COLORS.text, minHeight: 70, textAlignVertical: 'top',
  },
  recurGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recurChip: {
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
  },
  countChip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
  },
  recurChipSelected: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  recurChipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  recurChipTextSelected: { color: '#FFF' },
  recurPreview: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 12,
    backgroundColor: '#FFF8F0', borderRadius: 10, padding: 10,
  },
  recurPreviewText: { flex: 1, fontSize: 12, color: COLORS.text, lineHeight: 18 },
  lineToggle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.surface, padding: 14, borderRadius: 12,
  },
  lineToggleLeft: { flexDirection: 'row', gap: 10, alignItems: 'center', flex: 1 },
  lineToggleTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  lineToggleSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  switchTrack: {
    width: 42, height: 24, borderRadius: 12, backgroundColor: COLORS.borderLight,
    padding: 2, justifyContent: 'center',
  },
  switchTrackOn: { backgroundColor: '#06C755' },
  switchThumb: {
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFF',
  },
  switchThumbOn: { alignSelf: 'flex-end' },
  warnCard: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: COLORS.warning + '15', marginHorizontal: 16, marginTop: 16,
    padding: 12, borderRadius: 10,
  },
  warnText: { flex: 1, fontSize: 12, color: COLORS.warning, lineHeight: 18 },
  footer: { paddingHorizontal: 16, marginTop: 24 },
  submitBtn: {
    backgroundColor: COLORS.accent, paddingVertical: 16, borderRadius: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: { backgroundColor: COLORS.textLight },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
