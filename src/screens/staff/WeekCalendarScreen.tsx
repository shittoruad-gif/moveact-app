// 週間カレンダービュー
// app_bookings + airreserve_events + staff_unavailability をまとめて時間軸で可視化
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useStoreSelection } from '../../stores/storeSelectionStore';

const HOUR_START = 9;
const HOUR_END = 20;
const ROW_HEIGHT = 16; // px per 15 min
const COL_WIDTH = 110;

type EventKind = 'app' | 'air' | 'unavail';
interface CalEvent {
  id: string;
  kind: EventKind;
  starts_at: string;
  ends_at: string;
  title: string;
  subtitle?: string;
  store_id?: string;
  status?: string;
}

function startOfWeek(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  copy.setDate(copy.getDate() - day); // Sunday start
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function WeekCalendarScreen() {
  const navigation = useNavigation<any>();
  const { selectedStore } = useStoreSelection();
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const weekEnd = useMemo(() => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7);
    return d;
  }, [weekStart]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    const startISO = weekStart.toISOString();
    const endISO = weekEnd.toISOString();

    const [bookingsRes, airRes, unavailRes] = await Promise.all([
      supabase
        .from('app_bookings')
        .select('id, starts_at, ends_at, status, store_id, treatment_menu:treatment_menus(name), profile:profiles(full_name)')
        .eq('store_id', selectedStore)
        .gte('starts_at', startISO)
        .lt('starts_at', endISO)
        .neq('status', 'cancelled'),
      supabase
        .from('airreserve_events')
        .select('id, starts_at, ends_at, summary, store_id')
        .eq('store_id', selectedStore)
        .gte('starts_at', startISO)
        .lt('starts_at', endISO),
      supabase
        .from('staff_unavailability')
        .select('id, starts_at, ends_at, reason, store_id')
        .or(`store_id.eq.${selectedStore},store_id.is.null`)
        .gte('starts_at', startISO)
        .lt('starts_at', endISO),
    ]);

    const list: CalEvent[] = [
      ...(bookingsRes.data ?? []).map((b: any) => ({
        id: `b-${b.id}`,
        kind: 'app' as EventKind,
        starts_at: b.starts_at,
        ends_at: b.ends_at,
        title: b.profile?.full_name ?? '---',
        subtitle: b.treatment_menu?.name ?? '',
        status: b.status,
      })),
      ...(airRes.data ?? []).map((a: any) => ({
        id: `a-${a.id}`,
        kind: 'air' as EventKind,
        starts_at: a.starts_at,
        ends_at: a.ends_at,
        title: a.summary ?? 'Airリザーブ',
        subtitle: 'Airリザーブ',
      })),
      ...(unavailRes.data ?? []).map((u: any) => ({
        id: `u-${u.id}`,
        kind: 'unavail' as EventKind,
        starts_at: u.starts_at,
        ends_at: u.ends_at,
        title: u.reason || '不在',
        subtitle: '不在',
      })),
    ];
    setEvents(list);
    setLoading(false);
  }, [weekStart, weekEnd, selectedStore]);

  useFocusEffect(
    useCallback(() => {
      fetchEvents();
    }, [fetchEvents])
  );

  function shiftWeek(delta: number) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + 7 * delta);
    setWeekStart(startOfWeek(d));
  }

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const weekLabel = `${weekStart.getMonth() + 1}/${weekStart.getDate()} - ${(() => {
    const e = new Date(weekStart);
    e.setDate(e.getDate() + 6);
    return `${e.getMonth() + 1}/${e.getDate()}`;
  })()}`;

  const hours = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i);
  const totalHeight = hours.length * 4 * ROW_HEIGHT;

  function eventOffset(ev: CalEvent, dayStart: Date) {
    const s = new Date(ev.starts_at).getTime();
    const e = new Date(ev.ends_at).getTime();
    const dayStartMs = dayStart.getTime() + HOUR_START * 60 * 60 * 1000;
    const top = ((s - dayStartMs) / (15 * 60 * 1000)) * ROW_HEIGHT;
    const height = Math.max(ROW_HEIGHT, ((e - s) / (15 * 60 * 1000)) * ROW_HEIGHT);
    return { top, height };
  }

  return (
    <View style={styles.container}>
      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity onPress={() => shiftWeek(-1)} style={styles.toolBtn}>
          <Ionicons name="chevron-back" size={18} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.weekLabel}>{weekLabel}</Text>
        <TouchableOpacity onPress={() => shiftWeek(1)} style={styles.toolBtn}>
          <Ionicons name="chevron-forward" size={18} color={COLORS.text} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setWeekStart(startOfWeek(new Date()))} style={styles.todayBtn}>
          <Text style={styles.todayBtnText}>今週</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('StaffUnavailability')}
          style={styles.toolBtn}
        >
          <Ionicons name="close-circle-outline" size={18} color={COLORS.warning} />
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <LegendDot color={COLORS.accent} label="アプリ予約" />
        <LegendDot color="#06C755" label="Airリザーブ" />
        <LegendDot color={COLORS.error} label="不在" />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        horizontal
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchEvents} tintColor={COLORS.accent} />}
      >
        <View>
          {/* Day headers */}
          <View style={styles.headerRow}>
            <View style={{ width: 44 }} />
            {days.map((d) => {
              const isToday = d.toDateString() === new Date().toDateString();
              return (
                <View key={d.toISOString()} style={[styles.dayHeader, { width: COL_WIDTH }, isToday && styles.dayHeaderToday]}>
                  <Text style={styles.dayWeek}>
                    {['日','月','火','水','木','金','土'][d.getDay()]}
                  </Text>
                  <Text style={[styles.dayNum, isToday && { color: COLORS.accent }]}>{d.getDate()}</Text>
                </View>
              );
            })}
          </View>

          {/* Grid body */}
          <ScrollView style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row' }}>
              {/* Hour labels column */}
              <View style={{ width: 44 }}>
                {hours.map((h) => (
                  <View key={h} style={{ height: 4 * ROW_HEIGHT, borderTopWidth: 1, borderTopColor: COLORS.borderLight }}>
                    <Text style={styles.hourLabel}>{h}:00</Text>
                  </View>
                ))}
              </View>

              {/* Day columns */}
              {days.map((d) => {
                const dayStart = new Date(d);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(dayStart);
                dayEnd.setDate(dayEnd.getDate() + 1);
                const dayEvents = events.filter(
                  (ev) =>
                    new Date(ev.starts_at) >= dayStart &&
                    new Date(ev.starts_at) < dayEnd
                );
                return (
                  <View key={d.toISOString()} style={{ width: COL_WIDTH, height: totalHeight, borderLeftWidth: 1, borderLeftColor: COLORS.borderLight }}>
                    {/* Hour gridlines */}
                    {hours.map((h) => (
                      <View key={h} style={{ height: 4 * ROW_HEIGHT, borderTopWidth: 1, borderTopColor: COLORS.borderLight }} />
                    ))}
                    {/* Events */}
                    {dayEvents.map((ev) => {
                      const { top, height } = eventOffset(ev, dayStart);
                      return (
                        <EventBlock
                          key={ev.id}
                          ev={ev}
                          top={top}
                          height={height}
                          onPress={() => {
                            if (ev.kind === 'app') {
                              navigation.navigate('StaffBookingList');
                            }
                          }}
                        />
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

function EventBlock({
  ev, top, height, onPress,
}: { ev: CalEvent; top: number; height: number; onPress: () => void }) {
  const color = ev.kind === 'app' ? COLORS.accent
    : ev.kind === 'air' ? '#06C755' : COLORS.error;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        position: 'absolute', left: 2, right: 2, top, height,
        backgroundColor: color + '25',
        borderLeftWidth: 3, borderLeftColor: color,
        borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2,
        overflow: 'hidden',
      }}
    >
      <Text style={{ fontSize: 10, fontWeight: '700', color: COLORS.text }} numberOfLines={1}>
        {ev.title}
      </Text>
      {height > 24 && ev.subtitle && (
        <Text style={{ fontSize: 9, color: COLORS.textSecondary }} numberOfLines={1}>
          {ev.subtitle}
        </Text>
      )}
    </TouchableOpacity>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 10, color: COLORS.textSecondary }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  toolBtn: { padding: 6 },
  todayBtn: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: COLORS.accentLight,
  },
  todayBtnText: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  weekLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  legend: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 8,
    backgroundColor: COLORS.backgroundSoft,
  },
  headerRow: { flexDirection: 'row', backgroundColor: COLORS.surface },
  dayHeader: {
    alignItems: 'center', paddingVertical: 8,
    borderLeftWidth: 1, borderLeftColor: COLORS.borderLight,
  },
  dayHeaderToday: { backgroundColor: COLORS.accentLight + '50' },
  dayWeek: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '500' },
  dayNum: { fontSize: 15, color: COLORS.text, fontWeight: '700' },
  hourLabel: { fontSize: 9, color: COLORS.textLight, textAlign: 'right', paddingRight: 4, marginTop: -4 },
});
