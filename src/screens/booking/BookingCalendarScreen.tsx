import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingStackParamList } from '../../types/navigation';
import type { TreatmentMenu, AppBooking } from '../../types/database';

type Props = NativeStackScreenProps<BookingStackParamList, 'BookingCalendar'>;

const BUFFER_MINUTES = 15;
// すきま時間ブロック: 既存予約とのギャップが 30分超〜75分未満（=中途半端な空き）の枠は非表示。
//   - 30分まで: 15+15分バッファ範囲内、OK
//   - 75分以上: 最短メニュー（45分）+ 両側バッファ（30分）が収まる、別予約が入る可能性あり OK
//   - 間: 別予約が入らない無駄な空き時間が発生するので非表示。
const MAX_OK_GAP_MINUTES = 30;
const MIN_FITTABLE_GAP_MINUTES = 75;
const TIME_SLOTS = Array.from({ length: 20 }, (_, i) => {
  const h = Math.floor(i / 2) + 9; // 9:00 ~ 18:30
  const m = (i % 2) * 30;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});

interface TagPrice {
  menuId: string;
  price: number;
  tag: string | null;
}

// サーバー(get-available-slots)が返す予約可能枠（◎○△× と空きスタッフ数つき）
interface AvailSlot {
  time: string;
  level: string;
  freeStaff: number;
}

export function BookingCalendarScreen({ route, navigation }: Props) {
  const { selectedStore } = useStoreSelection();
  // 予約フローでは「最初に選んだ店舗」を最優先で使う（誤店舗予約を防ぐ）
  const storeId = route.params?.storeId ?? selectedStore;
  const couponId = route.params?.couponId;
  const { profile } = useAuthStore();
  const [menus, setMenus] = useState<TreatmentMenu[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<string>(route.params?.menuId ?? '');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [existingBookings, setExistingBookings] = useState<AppBooking[]>([]);
  const [tagPrices, setTagPrices] = useState<Map<string, TagPrice>>(new Map());
  const [loading, setLoading] = useState(true);
  // サーバー(get-available-slots)が計算した予約可能枠（◎○△×・空きスタッフ数つき）
  const [availableSlots, setAvailableSlots] = useState<AvailSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [isClosedDay, setIsClosedDay] = useState(false);
  // スタッフ指名（null = 指名なし）
  const [staffRoster, setStaffRoster] = useState<{ staff_id: string; full_name: string }[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [waitlistDone, setWaitlistDone] = useState(false);

  useEffect(() => { fetchMenus(); fetchRoster(); }, []);
  useEffect(() => { fetchRoster(); }, [storeId]);
  // 空き枠はサーバー(get-available-slots)で一元計算する。
  useEffect(() => { fetchSlots(); }, [selectedMenu, selectedDate, storeId, selectedStaff]);

  async function fetchRoster() {
    const { data } = await supabase
      .from('public_staff_roster')
      .select('staff_id, full_name')
      .eq('store_id', storeId);
    setStaffRoster((data as any[]) ?? []);
  }

  // 営業時間・定休日・既存予約・バッファ・すきま時間ブロックを統合した
  // 予約可能枠をサーバーから取得する。
  async function fetchSlots() {
    if (!selectedMenu) { setAvailableSlots([]); return; }
    setSlotsLoading(true);
    setIsClosedDay(false);
    setWaitlistDone(false);
    try {
      const dateStr = formatDate(selectedDate);
      const { data, error } = await supabase.functions.invoke('get-available-slots', {
        body: { storeId, menuId: selectedMenu, date: dateStr, staffId: selectedStaff ?? undefined },
      });
      if (error) throw error;
      if (data?.isClosed) {
        setIsClosedDay(true);
        setAvailableSlots([]);
      } else {
        setAvailableSlots((data?.slots as AvailSlot[]) ?? []);
      }
    } catch {
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }

  async function fetchMenus() {
    const { data } = await supabase
      .from('treatment_menus')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    const menuList = (data as TreatmentMenu[]) ?? [];
    setMenus(menuList);
    if (!selectedMenu && menuList.length > 0) {
      setSelectedMenu(menuList[0].id);
    }

    // Fetch tag-based prices for this user
    if (profile?.tags && profile.tags.length > 0) {
      const { data: tpData } = await supabase
        .from('menu_tag_prices')
        .select('treatment_menu_id, tag, price')
        .in('tag', profile.tags);
      if (tpData && tpData.length > 0) {
        const priceMap = new Map<string, TagPrice>();
        for (const menu of menuList) {
          // このメニューに該当する全タグ価格のうち最安値を採用（顧客に有利）
          const matches = tpData.filter((tp: any) => tp.treatment_menu_id === menu.id);
          if (matches.length > 0) {
            const cheapest = matches.reduce((a: any, b: any) => (b.price < a.price ? b : a));
            priceMap.set(menu.id, { menuId: menu.id, price: cheapest.price, tag: cheapest.tag });
          }
        }
        setTagPrices(priceMap);
      }
    }

    setLoading(false);
  }

  async function fetchBookings() {
    const dateStr = formatDate(selectedDate);
    const { data } = await supabase
      .from('app_bookings')
      .select('*')
      .eq('store_id', storeId)
      .gte('starts_at', `${dateStr}T00:00:00`)
      .lte('starts_at', `${dateStr}T23:59:59`)
      .neq('status', 'cancelled');
    setExistingBookings((data as AppBooking[]) ?? []);
  }

  const currentMenu = menus.find((m) => m.id === selectedMenu);

  // Generate dates for next 14 days
  const dates = useMemo(() => {
    const result: Date[] = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      result.push(d);
    }
    return result;
  }, []);

  // Check if a time slot conflicts with existing bookings (including buffer)
  function isSlotAvailable(timeStr: string): boolean {
    if (!currentMenu) return false;
    const [h, m] = timeStr.split(':').map(Number);
    const slotStart = new Date(selectedDate);
    slotStart.setHours(h, m, 0, 0);
    const slotEnd = new Date(slotStart.getTime() + currentMenu.duration_minutes * 60000);

    // Buffer: 15min before and after
    const bufferStart = new Date(slotStart.getTime() - BUFFER_MINUTES * 60000);
    const bufferEnd = new Date(slotEnd.getTime() + BUFFER_MINUTES * 60000);

    for (const booking of existingBookings) {
      const bStart = new Date(new Date(booking.starts_at).getTime() - (booking.buffer_before ?? BUFFER_MINUTES) * 60000);
      const bEnd = new Date(new Date(booking.ends_at).getTime() + (booking.buffer_after ?? BUFFER_MINUTES) * 60000);

      if (bufferStart < bEnd && bufferEnd > bStart) {
        return false;
      }
    }

    // Don't show past times for today
    if (formatDate(selectedDate) === formatDate(new Date()) && slotStart <= new Date()) {
      return false;
    }

    // すきま時間ブロック: 隣接予約とのギャップが中途半端（30分超〜75分未満）なら非表示
    if (hasAwkwardGap(slotStart, slotEnd, existingBookings)) {
      return false;
    }

    return true;
  }

  const isNewCustomer = route.params?.isNewCustomer ?? false;

  // キャンセル待ちに登録（満席の日に空きが出たら通知）
  async function registerWaitlist() {
    if (!profile?.id || !selectedMenu) return;
    const { error } = await supabase.from('booking_waitlist').insert({
      user_id: profile.id,
      store_id: storeId,
      treatment_menu_id: selectedMenu,
      staff_id: selectedStaff ?? null,
      desired_date: formatDate(selectedDate),
    });
    if (error) { Alert.alert('エラー', '登録に失敗しました。時間をおいてお試しください。'); return; }
    setWaitlistDone(true);
    Alert.alert('登録しました', 'この日に空きが出ましたら、通知でお知らせします。');
  }

  function handleSelectSlot(timeStr: string) {
    const [h, m] = timeStr.split(':').map(Number);
    const dt = new Date(selectedDate);
    dt.setHours(h, m, 0, 0);
    navigation.navigate('BookingConfirm', {
      menuId: selectedMenu,
      dateTime: dt.toISOString(),
      isNewCustomer,
      staffId: selectedStaff ?? undefined,
      storeId,
      couponId,
    });
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
      {/* 選択中の店舗を常に明示（誤店舗予約の防止）。タップで店舗選択に戻れる */}
      <View style={styles.storeBanner}>
        <Ionicons name="storefront" size={18} color={COLORS.accent} />
        <View style={{ flex: 1 }}>
          <Text style={styles.storeBannerLabel}>ご予約の店舗</Text>
          <Text style={styles.storeBannerName}>Moveact {STORES[storeId as keyof typeof STORES]?.name ?? ''}</Text>
        </View>
        <TouchableOpacity style={styles.storeChangeBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.storeChangeText}>変更</Text>
        </TouchableOpacity>
      </View>

      {/* クーポンを最初に選んでいる場合の表示（割引は確認画面で適用） */}
      {couponId && (
        <View style={styles.couponBanner}>
          <Ionicons name="ticket" size={15} color={COLORS.success} />
          <Text style={styles.couponBannerText}>クーポン適用中（確認画面で割引が反映されます）</Text>
        </View>
      )}

      {/* Menu selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>メニューを選択</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuScroll}>
          {menus.map((menu) => {
            const tp = tagPrices.get(menu.id);
            const effectivePrice = tp ? tp.price : menu.price;
            const isSelected = selectedMenu === menu.id;
            return (
              <TouchableOpacity
                key={menu.id}
                style={[styles.menuChip, isSelected && styles.menuChipSelected]}
                onPress={() => setSelectedMenu(menu.id)}
              >
                {tp && (
                  <View style={[styles.tagBadge, isSelected && styles.tagBadgeSelected]}>
                    <Text style={[styles.tagBadgeText, isSelected && styles.tagBadgeTextSelected]}>{tp.tag}</Text>
                  </View>
                )}
                <Text style={[styles.menuChipText, isSelected && styles.menuChipTextSelected]}>
                  {menu.name}
                </Text>
                <Text style={[styles.menuDuration, isSelected && styles.menuDurationSelected]}>
                  {menu.duration_minutes}分
                </Text>
                <Text style={[styles.menuPrice, isSelected && styles.menuPriceSelected]}>
                  ¥{effectivePrice.toLocaleString()}
                </Text>
                {tp && (
                  <Text style={[styles.menuOriginalPrice, isSelected && styles.menuOriginalPriceSelected]}>
                    (通常 ¥{menu.price.toLocaleString()})
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Date selection */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>日にちを選択</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateScroll}>
          {dates.map((d) => {
            const isSelected = formatDate(d) === formatDate(selectedDate);
            const isToday = formatDate(d) === formatDate(new Date());
            const isSunday = d.getDay() === 0;
            return (
              <TouchableOpacity
                key={d.toISOString()}
                style={[styles.dateChip, isSelected && styles.dateChipSelected]}
                onPress={() => setSelectedDate(d)}
              >
                <Text style={[styles.dayName, isSelected && styles.dateTextSelected, isSunday && styles.sundayText]}>
                  {dayNames[d.getDay()]}
                </Text>
                <Text style={[styles.dayNumber, isSelected && styles.dateTextSelected]}>
                  {d.getDate()}
                </Text>
                {isToday && <View style={styles.todayDot} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* スタッフ指名（任意）。指名なしの場合は空きスタッフを自動割当 */}
      {staffRoster.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>スタッフ指名（任意）</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuScroll}>
            <TouchableOpacity
              style={[styles.staffChip, selectedStaff === null && styles.staffChipSelected]}
              onPress={() => setSelectedStaff(null)}
            >
              <Text style={[styles.staffChipText, selectedStaff === null && styles.staffChipTextSelected]}>指名なし</Text>
            </TouchableOpacity>
            {staffRoster.map((s) => {
              const isSel = selectedStaff === s.staff_id;
              return (
                <TouchableOpacity
                  key={s.staff_id}
                  style={[styles.staffChip, isSel && styles.staffChipSelected]}
                  onPress={() => setSelectedStaff(s.staff_id)}
                >
                  <Text style={[styles.staffChipText, isSel && styles.staffChipTextSelected]}>{s.full_name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Time slots（サーバーの空き枠計算を使用：営業時間・定休日・既存予約・スタッフ不在・すきま時間ブロックを反映）*/}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>時間を選択</Text>
        {slotsLoading ? (
          <View style={styles.slotsLoading}>
            <ActivityIndicator color={COLORS.accent} />
          </View>
        ) : isClosedDay ? (
          <View style={styles.slotsNotice}>
            <Ionicons name="moon-outline" size={18} color={COLORS.textLight} />
            <Text style={styles.slotsNoticeText}>この日は定休日・お休みです</Text>
          </View>
        ) : availableSlots.length === 0 ? (
          <View>
            <View style={styles.slotsNotice}>
              <Ionicons name="sad-outline" size={18} color={COLORS.textLight} />
              <Text style={styles.slotsNoticeText}>空き枠がありません。別の日をお選びください</Text>
            </View>
            {/* キャンセル待ち登録（満席の日に空きが出たら通知） */}
            <TouchableOpacity style={styles.waitlistBtn} onPress={registerWaitlist} disabled={waitlistDone}>
              <Ionicons name={waitlistDone ? 'checkmark-circle' : 'notifications-outline'} size={18} color={waitlistDone ? COLORS.success : COLORS.accent} />
              <Text style={[styles.waitlistText, waitlistDone && { color: COLORS.success }]}>
                {waitlistDone ? 'キャンセル待ちに登録しました' : 'この日のキャンセル待ちに登録する'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ◎○△× の凡例（ホットペッパー式） */}
            <View style={styles.slotLegend}>
              <View style={styles.legendItem}><Text style={styles.legendMark}>◎</Text><Text style={styles.legendText}>空きあり</Text></View>
              <View style={styles.legendItem}><Text style={styles.legendMark}>○</Text><Text style={styles.legendText}>残りわずか</Text></View>
              <View style={styles.legendItem}><Text style={styles.legendMark}>△</Text><Text style={styles.legendText}>わずか</Text></View>
            </View>
            <View style={styles.slotsGrid}>
              {availableSlots.map((slot) => (
                <TouchableOpacity
                  key={slot.time}
                  style={[styles.slotButton, styles.slotAvailable]}
                  onPress={() => handleSelectSlot(slot.time)}
                >
                  <Text style={[styles.slotText, styles.slotTextAvailable]}>{slot.time}</Text>
                  <Text style={[styles.slotStatus, styles.slotStatusAvailable]}>{slot.level}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// すきま時間ブロック判定
// 候補スロット [slotStart, slotEnd] と既存予約から「中途半端な空き」が発生するか判定する。
// - 候補スロットの直前/直後の既存予約を見つける
// - そのギャップが MAX_OK_GAP_MINUTES 超〜 MIN_FITTABLE_GAP_MINUTES 未満なら awkward
// - スロットの片側に予約がない場合（朝一・夜遅く）は片側だけチェック
function hasAwkwardGap(
  slotStart: Date,
  slotEnd: Date,
  bookings: AppBooking[],
): boolean {
  const slotStartMs = slotStart.getTime();
  const slotEndMs = slotEnd.getTime();

  let closestBeforeEndMs = -Infinity;
  let closestAfterStartMs = Infinity;

  for (const booking of bookings) {
    const bStartMs = new Date(booking.starts_at).getTime();
    const bEndMs = new Date(booking.ends_at).getTime();

    if (bEndMs <= slotStartMs && bEndMs > closestBeforeEndMs) {
      closestBeforeEndMs = bEndMs;
    }
    if (bStartMs >= slotEndMs && bStartMs < closestAfterStartMs) {
      closestAfterStartMs = bStartMs;
    }
  }

  if (closestBeforeEndMs !== -Infinity) {
    const gapMin = (slotStartMs - closestBeforeEndMs) / 60000;
    if (gapMin > MAX_OK_GAP_MINUTES && gapMin < MIN_FITTABLE_GAP_MINUTES) {
      return true;
    }
  }

  if (closestAfterStartMs !== Infinity) {
    const gapMin = (closestAfterStartMs - slotEndMs) / 60000;
    if (gapMin > MAX_OK_GAP_MINUTES && gapMin < MIN_FITTABLE_GAP_MINUTES) {
      return true;
    }
  }

  return false;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  storeBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFF8F0', marginHorizontal: 16, marginTop: 16,
    paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.accentLight,
  },
  storeBannerLabel: { fontSize: 10, color: COLORS.textSecondary },
  storeBannerName: { fontSize: 15, fontWeight: '700', color: COLORS.accent, marginTop: 1 },
  storeChangeBtn: {
    borderWidth: 1, borderColor: COLORS.accent, borderRadius: 16,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  storeChangeText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
  couponBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 16, marginTop: 10, paddingVertical: 9, paddingHorizontal: 14,
    backgroundColor: '#EEF6F0', borderRadius: 10,
  },
  couponBannerText: { fontSize: 12, color: COLORS.success, fontWeight: '600' },
  section: { paddingHorizontal: 16, marginTop: 20 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 10 },
  bufferNote: { fontSize: 11, fontWeight: '400', color: COLORS.textLight },
  menuScroll: { gap: 8 },
  menuChip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  menuChipSelected: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  menuChipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  menuChipTextSelected: { color: '#FFF' },
  menuDuration: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  menuDurationSelected: { color: 'rgba(255,255,255,0.8)' },
  menuPrice: { fontSize: 13, fontWeight: '700', color: COLORS.accent, marginTop: 4 },
  menuPriceSelected: { color: '#FFF' },
  menuOriginalPrice: { fontSize: 10, color: COLORS.textLight, textDecorationLine: 'line-through', marginTop: 1 },
  menuOriginalPriceSelected: { color: 'rgba(255,255,255,0.6)' },
  tagBadge: {
    backgroundColor: COLORS.accentPink + '30', paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6, marginBottom: 4,
  },
  tagBadgeSelected: { backgroundColor: 'rgba(255,255,255,0.25)' },
  tagBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.accentPink },
  tagBadgeTextSelected: { color: '#FFF' },
  dateScroll: { gap: 8, paddingBottom: 4 },
  dateChip: {
    width: 52,
    height: 72,
    borderRadius: 14,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  dateChipSelected: { backgroundColor: COLORS.accent },
  dayName: { fontSize: 11, fontWeight: '500', color: COLORS.textSecondary },
  dayNumber: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  dateTextSelected: { color: '#FFF' },
  sundayText: { color: COLORS.error },
  todayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.accent,
  },
  slotsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotsLoading: { paddingVertical: 24, alignItems: 'center' },
  slotsNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, padding: 16, borderRadius: 10,
  },
  slotsNoticeText: { fontSize: 13, color: COLORS.textSecondary, flex: 1 },
  waitlistBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 10, paddingVertical: 13, borderRadius: 10,
    borderWidth: 1.5, borderColor: COLORS.accent, backgroundColor: '#FFF8F0',
  },
  waitlistText: { fontSize: 13, fontWeight: '700', color: COLORS.accent },
  slotLegend: {
    flexDirection: 'row', gap: 16, marginBottom: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendMark: { fontSize: 13, fontWeight: '700', color: COLORS.success },
  legendText: { fontSize: 11, color: COLORS.textSecondary },
  staffChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
  },
  staffChipSelected: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  staffChipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  staffChipTextSelected: { color: '#FFF' },
  slotButton: {
    width: '23%',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    gap: 2,
  },
  slotAvailable: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.success,
  },
  slotUnavailable: {
    backgroundColor: COLORS.backgroundSoft,
    borderColor: COLORS.borderLight,
  },
  slotText: { fontSize: 14, fontWeight: '600' },
  slotTextAvailable: { color: COLORS.text },
  slotTextUnavailable: { color: COLORS.textLight },
  slotStatus: { fontSize: 9, fontWeight: '600' },
  slotStatusAvailable: { color: COLORS.success },
  slotStatusUnavailable: { color: COLORS.textLight },
});
