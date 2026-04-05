import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { supabase } from '../../lib/supabase';

export function StaffBookingListScreen() {
  const navigation = useNavigation<any>();
  const { selectedStore } = useStoreSelection();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());

  useEffect(() => { fetchBookings(); }, [selectedDate, selectedStore]);

  async function fetchBookings() {
    setLoading(true);
    const dateStr = selectedDate.toISOString().slice(0, 10);
    const { data } = await supabase
      .from('app_bookings')
      .select('*, treatment_menu:treatment_menus(name, duration_minutes), profile:profiles(full_name, phone)')
      .eq('store_id', selectedStore)
      .gte('starts_at', `${dateStr}T00:00:00`)
      .lte('starts_at', `${dateStr}T23:59:59`)
      .order('starts_at');
    setBookings(data ?? []);
    setLoading(false);
  }

  async function updateStatus(bookingId: string, newStatus: string) {
    const { error } = await supabase.from('app_bookings').update({ status: newStatus }).eq('id', bookingId);
    if (error) { Alert.alert('エラー', '更新に失敗しました'); return; }
    fetchBookings();
  }

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  function renderBooking({ item }: { item: any }) {
    const time = new Date(item.starts_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const endTime = new Date(item.ends_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const isCancelled = item.status === 'cancelled';

    return (
      <View style={[styles.bookingCard, isCancelled && styles.cancelled]}>
        <View style={styles.timeBlock}>
          <Text style={styles.timeText}>{time}</Text>
          <Text style={styles.endTimeText}>{endTime}</Text>
        </View>
        <View style={styles.bookingContent}>
          <Text style={styles.customerName}>{item.profile?.full_name ?? '---'}</Text>
          <Text style={styles.menuName}>{item.treatment_menu?.name} ({item.treatment_menu?.duration_minutes}分)</Text>
          {item.profile?.phone && <Text style={styles.phone}>{item.profile.phone}</Text>}
        </View>
        <View style={styles.statusActions}>
          <Text style={[styles.statusText, statusStyle(item.status)]}>{statusLabel(item.status)}</Text>
          {item.status === 'confirmed' && (
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.completeBtn} onPress={() => updateStatus(item.id, 'completed')}>
                <Text style={styles.completeBtnText}>完了</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => {
                Alert.alert('キャンセル', 'この予約をキャンセルしますか？', [
                  { text: 'いいえ', style: 'cancel' },
                  { text: 'キャンセルする', style: 'destructive', onPress: () => updateStatus(item.id, 'cancelled') },
                ]);
              }}>
                <Ionicons name="close" size={16} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Date selector */}
      <View style={styles.dateRow}>
        {dates.map((d) => {
          const isSelected = d.toDateString() === selectedDate.toDateString();
          return (
            <TouchableOpacity
              key={d.toISOString()}
              style={[styles.dateChip, isSelected && styles.dateChipSelected]}
              onPress={() => setSelectedDate(d)}
            >
              <Text style={[styles.dayName, isSelected && styles.dateTextSelected]}>{dayNames[d.getDay()]}</Text>
              <Text style={[styles.dayNum, isSelected && styles.dateTextSelected]}>{d.getDate()}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.countText}>{bookings.length}件の予約</Text>

      <FlatList
        data={bookings}
        keyExtractor={(item) => item.id}
        renderItem={renderBooking}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchBookings} tintColor={COLORS.accent} />}
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>この日の予約はありません</Text>
          </View>
        ) : null}
      />
    </View>
  );
}

function statusLabel(s: string) {
  const map: Record<string, string> = { confirmed: '確定', completed: '完了', cancelled: 'キャンセル', no_show: '無断' };
  return map[s] ?? s;
}
function statusStyle(s: string) {
  const map: Record<string, any> = {
    confirmed: { color: COLORS.success }, completed: { color: COLORS.textSecondary },
    cancelled: { color: COLORS.error }, no_show: { color: COLORS.error },
  };
  return map[s] ?? {};
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  dateRow: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 12, gap: 6 },
  dateChip: {
    flex: 1, alignItems: 'center', paddingVertical: 10,
    borderRadius: 12, backgroundColor: COLORS.surface, gap: 2,
  },
  dateChipSelected: { backgroundColor: COLORS.accent },
  dayName: { fontSize: 10, fontWeight: '500', color: COLORS.textSecondary },
  dayNum: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  dateTextSelected: { color: '#FFF' },
  countText: { fontSize: 12, color: COLORS.textSecondary, paddingHorizontal: 20, marginBottom: 6 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  bookingCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 14,
    flexDirection: 'row', marginBottom: 8, gap: 12,
  },
  cancelled: { opacity: 0.5 },
  timeBlock: { alignItems: 'center', minWidth: 50, justifyContent: 'center' },
  timeText: { fontSize: 15, fontWeight: '700', color: COLORS.accent },
  endTimeText: { fontSize: 11, color: COLORS.textLight },
  bookingContent: { flex: 1 },
  customerName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  menuName: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  phone: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  statusActions: { alignItems: 'flex-end', justifyContent: 'space-between' },
  statusText: { fontSize: 11, fontWeight: '600' },
  actionButtons: { flexDirection: 'row', gap: 6, marginTop: 6 },
  completeBtn: {
    backgroundColor: COLORS.success, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
  },
  completeBtnText: { fontSize: 11, fontWeight: '700', color: '#FFF' },
  cancelBtn: {
    backgroundColor: COLORS.error + '15', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8,
  },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 13, color: COLORS.textLight },
});
