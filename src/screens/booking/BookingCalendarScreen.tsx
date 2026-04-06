import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingStackParamList } from '../../types/navigation';
import type { TreatmentMenu, AppBooking } from '../../types/database';

type Props = NativeStackScreenProps<BookingStackParamList, 'BookingCalendar'>;

const BUFFER_MINUTES = 15;
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

export function BookingCalendarScreen({ route, navigation }: Props) {
  const { selectedStore } = useStoreSelection();
  const { profile } = useAuthStore();
  const [menus, setMenus] = useState<TreatmentMenu[]>([]);
  const [selectedMenu, setSelectedMenu] = useState<string>(route.params?.menuId ?? '');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [existingBookings, setExistingBookings] = useState<AppBooking[]>([]);
  const [tagPrices, setTagPrices] = useState<Map<string, TagPrice>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchMenus(); }, []);
  useEffect(() => { fetchBookings(); }, [selectedDate, selectedStore]);

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
          // Find the first matching tag price for this menu (tag order matters)
          for (const userTag of profile.tags) {
            const match = tpData.find((tp: any) => tp.treatment_menu_id === menu.id && tp.tag === userTag);
            if (match) {
              priceMap.set(menu.id, { menuId: menu.id, price: match.price, tag: match.tag });
              break;
            }
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
      .eq('store_id', selectedStore)
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

    return true;
  }

  const isNewCustomer = route.params?.isNewCustomer ?? false;

  function handleSelectSlot(timeStr: string) {
    const [h, m] = timeStr.split(':').map(Number);
    const dt = new Date(selectedDate);
    dt.setHours(h, m, 0, 0);
    navigation.navigate('BookingConfirm', {
      menuId: selectedMenu,
      dateTime: dt.toISOString(),
      isNewCustomer,
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

      {/* Time slots */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          時間を選択
        </Text>
        {/* Legend */}
        <View style={styles.slotLegend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.legendText}>空き</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: COLORS.textLight }]} />
            <Text style={styles.legendText}>予約済</Text>
          </View>
        </View>
        <View style={styles.slotsGrid}>
          {TIME_SLOTS.map((slot) => {
            const available = isSlotAvailable(slot);
            return (
              <TouchableOpacity
                key={slot}
                style={[styles.slotButton, available ? styles.slotAvailable : styles.slotUnavailable]}
                disabled={!available}
                onPress={() => handleSelectSlot(slot)}
              >
                <Text style={[styles.slotText, available ? styles.slotTextAvailable : styles.slotTextUnavailable]}>
                  {slot}
                </Text>
                <Text style={[styles.slotStatus, available ? styles.slotStatusAvailable : styles.slotStatusUnavailable]}>
                  {available ? '空き' : '---'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  slotLegend: {
    flexDirection: 'row', gap: 16, marginBottom: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: COLORS.textSecondary },
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
