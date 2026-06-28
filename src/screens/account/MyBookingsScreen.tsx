// 顧客の予約履歴・キャンセル画面
// =====================================================
// 自分の施術予約（app_bookings）を「これから」「過去」に分けて表示。
// 未来の予約はキャンセル可能（前日まで等の制限はサロン運用に合わせ後で調整可）。
// =====================================================
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
  ActivityIndicator, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS, STORES, CANCELLATION_POLICY, isSameDayAppointment } from '../../lib/constants';
import { CancellationPolicyNotice } from '../../components/CancellationPolicyNotice';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';

interface BookingRow {
  id: string;
  store_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  treatment_menu?: { name: string } | null;
}

export function MyBookingsScreen() {
  const { profile } = useAuthStore();
  const navigation = useNavigation<any>();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchBookings = useCallback(async () => {
    if (!profile?.id) { setLoading(false); return; }
    const { data } = await supabase
      .from('app_bookings')
      .select('id, store_id, starts_at, ends_at, status, treatment_menu:treatment_menus(name)')
      .eq('user_id', profile.id)
      .order('starts_at', { ascending: false });
    setBookings((data as unknown as BookingRow[]) ?? []);
    setLoading(false);
    setRefreshing(false);
  }, [profile?.id]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  function confirmCancel(b: BookingRow) {
    const dt = new Date(b.starts_at).toLocaleString('ja-JP', {
      month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
    });
    // 当日予約のキャンセルはキャンセル料の対象。明確に警告する。
    const sameDay = isSameDayAppointment(b.starts_at);
    const warn = sameDay
      ? `\n\n⚠️ 本日のご予約です。\n${CANCELLATION_POLICY.headline}`
      : `\n\n${CANCELLATION_POLICY.headline}`;
    Alert.alert(
      sameDay ? '当日キャンセルのご確認' : '予約をキャンセル',
      `${b.treatment_menu?.name ?? 'ご予約'}\n${dt}${warn}\n\nこの予約をキャンセルしますか？`,
      [
        { text: 'やめる', style: 'cancel' },
        {
          text: sameDay ? '了承してキャンセル' : 'キャンセルする',
          style: 'destructive',
          onPress: () => doCancel(b.id),
        },
      ],
    );
  }

  async function doCancel(id: string) {
    const target = bookings.find((b) => b.id === id);
    const { error } = await supabase
      .from('app_bookings')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', profile!.id); // 自分の予約のみ（RLSでも保護）
    if (error) {
      Alert.alert('エラー', 'キャンセルに失敗しました。時間をおいてお試しください。');
      return;
    }
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: 'cancelled' } : b)));
    // 空きが出たのでキャンセル待ちに通知（非ブロッキング）
    if (target) {
      const date = target.starts_at.slice(0, 10);
      supabase.functions.invoke('notify-waitlist', { body: { storeId: target.store_id, date } }).catch(() => {});
    }
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.accent} /></View>;
  }

  const nowIso = new Date().toISOString();
  const upcoming = bookings.filter((b) => b.starts_at >= nowIso && b.status !== 'cancelled');
  const past = bookings.filter((b) => b.starts_at < nowIso || b.status === 'cancelled');

  const sections = [
    { title: 'これからのご予約', data: upcoming.slice().reverse(), upcoming: true },
    { title: '過去・キャンセル', data: past, upcoming: false },
  ];

  return (
    <FlatList
      style={styles.container}
      data={sections}
      keyExtractor={(s) => s.title}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchBookings(); }} tintColor={COLORS.accent} />}
      ListEmptyComponent={null}
      renderItem={({ item: section }) => (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.data.length === 0 ? (
            <Text style={styles.empty}>
              {section.upcoming ? 'ご予約はありません' : '履歴はありません'}
            </Text>
          ) : (
            section.data.map((b) => (
              <BookingCard
                key={b.id}
                b={b}
                canCancel={section.upcoming}
                onCancel={() => confirmCancel(b)}
                onReschedule={() => navigation.navigate('Reschedule', { bookingId: b.id })}
              />
            ))
          )}
        </View>
      )}
      ListFooterComponent={
        <View style={styles.policyFooter}>
          <CancellationPolicyNotice variant="detail" />
        </View>
      }
      contentContainerStyle={{ paddingBottom: 32 }}
    />
  );
}

function BookingCard({ b, canCancel, onCancel, onReschedule }: { b: BookingRow; canCancel: boolean; onCancel: () => void; onReschedule: () => void }) {
  const cancelled = b.status === 'cancelled';
  const start = new Date(b.starts_at);
  const dateStr = start.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
  const timeStr = start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const store = STORES[b.store_id as keyof typeof STORES]?.name ?? '';

  return (
    <View style={[styles.card, cancelled && styles.cardCancelled]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.menuName, cancelled && styles.strike]}>{b.treatment_menu?.name ?? 'ご予約'}</Text>
        <View style={styles.metaRow}>
          <Ionicons name="time-outline" size={13} color={COLORS.textSecondary} />
          <Text style={styles.metaText}>{dateStr} {timeStr}</Text>
        </View>
        <View style={styles.metaRow}>
          <Ionicons name="location-outline" size={13} color={COLORS.textSecondary} />
          <Text style={styles.metaText}>{store}</Text>
        </View>
        {cancelled && <Text style={styles.cancelledBadge}>キャンセル済み</Text>}
      </View>
      {canCancel && !cancelled && (
        <View style={styles.actionCol}>
          <TouchableOpacity style={styles.rescheduleBtn} onPress={onReschedule}>
            <Text style={styles.rescheduleBtnText}>日時変更</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>キャンセル</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  policyFooter: { paddingHorizontal: 16, marginTop: 20 },
  section: { paddingHorizontal: 16, marginTop: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 10 },
  empty: { fontSize: 13, color: COLORS.textLight, paddingVertical: 8 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  cardCancelled: { opacity: 0.6 },
  menuName: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  strike: { textDecorationLine: 'line-through' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  metaText: { fontSize: 12, color: COLORS.textSecondary },
  cancelledBadge: { fontSize: 11, color: COLORS.error, marginTop: 6, fontWeight: '600' },
  actionCol: { gap: 6, alignItems: 'stretch' },
  rescheduleBtn: {
    borderWidth: 1, borderColor: COLORS.accent, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, alignItems: 'center',
  },
  rescheduleBtnText: { fontSize: 12, color: COLORS.accent, fontWeight: '700' },
  cancelBtn: {
    borderWidth: 1, borderColor: COLORS.error, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  cancelBtnText: { fontSize: 12, color: COLORS.error, fontWeight: '700' },
});
