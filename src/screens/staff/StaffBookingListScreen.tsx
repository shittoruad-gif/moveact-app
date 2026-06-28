import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, CANCELLATION_POLICY, isSameDayAppointment } from '../../lib/constants';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { supabase } from '../../lib/supabase';

export function StaffBookingListScreen() {
  const navigation = useNavigation<any>();
  const { selectedStore } = useStoreSelection();
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date());
  // 当日キャンセルの処理選択モーダル対象
  const [chargeItem, setChargeItem] = useState<any | null>(null);
  const [processing, setProcessing] = useState(false);

  useEffect(() => { fetchBookings(); }, [selectedDate, selectedStore]);

  async function fetchBookings() {
    setLoading(true);
    const dateStr = selectedDate.toISOString().slice(0, 10);
    const { data } = await supabase
      .from('app_bookings')
      .select('*, treatment_menu:treatment_menus(name, duration_minutes, price), profile:profiles(full_name, phone, line_user_id)')
      .eq('store_id', selectedStore)
      .gte('starts_at', `${dateStr}T00:00:00`)
      .lte('starts_at', `${dateStr}T23:59:59`)
      .order('starts_at');
    const list = data ?? [];

    // 担当スタッフ名を解決（指名/おまかせ判定のため staff_id → 氏名 をまとめて引く）
    const staffIds = Array.from(new Set(list.map((b: any) => b.staff_id).filter(Boolean)));
    if (staffIds.length > 0) {
      const { data: staffRows } = await supabase
        .from('profiles').select('id, full_name').in('id', staffIds);
      const nameMap = new Map((staffRows ?? []).map((r: any) => [r.id, r.full_name]));
      for (const b of list as any[]) b.staff_name = b.staff_id ? nameMap.get(b.staff_id) ?? null : null;
    }
    setBookings(list);
    setLoading(false);
  }

  // 空きが出たのでキャンセル待ちに通知（非ブロッキング）
  function notifyWaitlist(startsAt: string) {
    const date = startsAt.slice(0, 10);
    supabase.functions.invoke('notify-waitlist', { body: { storeId: selectedStore, date } }).catch(() => {});
  }

  async function updateStatus(bookingId: string, newStatus: string) {
    const booking = bookings.find((b) => b.id === bookingId);
    const { error } = await supabase.from('app_bookings').update({ status: newStatus }).eq('id', bookingId);
    if (error) { Alert.alert('エラー', '更新に失敗しました'); return; }
    if (newStatus === 'cancelled' && booking?.starts_at) notifyWaitlist(booking.starts_at);

    // Send LINE cancellation notification if the customer is linked
    if (newStatus === 'cancelled' && booking?.profile?.line_user_id) {
      try {
        await supabase.functions.invoke('send-line-message', {
          body: { booking_id: bookingId, message_type: 'booking_cancelled' },
        });
      } catch (e) {
        // Non-fatal: log only. Cancellation itself already succeeded.
        console.warn('LINE cancellation notification failed:', e);
      }
    }

    fetchBookings();
  }

  // 定期予約のシリーズを一括キャンセル（まだ confirmed の回のみ＝過去の来店実績は触らない）
  async function cancelSeries(groupId: string, tappedId: string, lineUserId?: string) {
    const { error } = await supabase
      .from('app_bookings')
      .update({ status: 'cancelled' })
      .eq('recurrence_group_id', groupId)
      .eq('status', 'confirmed');
    if (error) { Alert.alert('エラー', '一括キャンセルに失敗しました'); return; }
    const tapped = bookings.find((b) => b.id === tappedId);
    if (tapped?.starts_at) notifyWaitlist(tapped.starts_at);
    // LINE通知は1通だけ（タップした回を代表として送信）
    if (lineUserId) {
      try {
        await supabase.functions.invoke('send-line-message', {
          body: { booking_id: tappedId, message_type: 'booking_cancelled' },
        });
      } catch (e) { console.warn('LINE cancellation notification failed:', e); }
    }
    fetchBookings();
  }

  // 当日キャンセルを規約に沿って処理（回数券消化 / 未収金 / 無料）
  async function processSameDay(chargeType: 'ticket' | 'unpaid' | 'waive') {
    if (!chargeItem) return;
    setProcessing(true);
    const amount = chargeType === 'unpaid' ? (chargeItem.treatment_menu?.price ?? null) : undefined;
    const { error } = await supabase.functions.invoke('cancel-treatment-booking', {
      body: { bookingId: chargeItem.id, chargeType, amount },
    });
    setProcessing(false);
    if (error) { setChargeItem(null); Alert.alert('エラー', 'キャンセル処理に失敗しました'); return; }
    if (chargeItem?.starts_at) notifyWaitlist(chargeItem.starts_at);
    setChargeItem(null);
    fetchBookings();
  }

  // キャンセルボタン押下時：当日は処理選択モーダル、定期は1件/シリーズ、それ以外は通常確認
  function confirmCancel(item: any) {
    if (isSameDayAppointment(item.starts_at)) {
      setChargeItem(item);
      return;
    }
    if (item.recurrence_group_id) {
      Alert.alert(
        '定期予約のキャンセル',
        'この予約は定期予約です。どのようにキャンセルしますか？',
        [
          { text: 'やめる', style: 'cancel' },
          { text: 'この1件のみ', onPress: () => updateStatus(item.id, 'cancelled') },
          {
            text: '今後すべて（シリーズ）', style: 'destructive',
            onPress: () => cancelSeries(item.recurrence_group_id, item.id, item.profile?.line_user_id),
          },
        ],
      );
    } else {
      Alert.alert('キャンセル', 'この予約をキャンセルしますか？', [
        { text: 'いいえ', style: 'cancel' },
        { text: 'キャンセルする', style: 'destructive', onPress: () => updateStatus(item.id, 'cancelled') },
      ]);
    }
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
          <View style={styles.nameRow}>
            <Text style={styles.customerName}>{item.profile?.full_name ?? '---'}</Text>
            {item.profile?.line_user_id && (
              <View style={styles.lineBadge}>
                <Ionicons name="chatbubble" size={9} color="#06C755" />
                <Text style={styles.lineBadgeText}>LINE</Text>
              </View>
            )}
            {item.recurrence_group_id && (
              <View style={styles.recurBadge}>
                <Ionicons name="repeat" size={9} color={COLORS.accent} />
                <Text style={styles.recurBadgeText}>定期</Text>
              </View>
            )}
          </View>
          <Text style={styles.menuName}>{item.treatment_menu?.name} ({item.treatment_menu?.duration_minutes}分)</Text>
          {/* 担当スタッフ（指名 or おまかせ）。誰が対応するか一目で分かるように */}
          <View style={styles.staffRow}>
            <Ionicons name="person-outline" size={12} color={COLORS.textSecondary} />
            <Text style={styles.staffText}>
              {item.staff_name ?? '担当未定'}
            </Text>
            {item.is_staff_nominated
              ? <View style={styles.shimeiBadge}><Text style={styles.shimeiText}>指名</Text></View>
              : <View style={styles.omakaseBadge}><Text style={styles.omakaseText}>おまかせ</Text></View>}
          </View>
          {item.profile?.phone && <Text style={styles.phone}>{item.profile.phone}</Text>}
          {/* お客様の要望・連絡事項 */}
          {item.customer_request ? (
            <View style={styles.requestBox}>
              <Ionicons name="chatbox-ellipses-outline" size={12} color={COLORS.accent} />
              <Text style={styles.requestText}>{item.customer_request}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.statusActions}>
          <Text style={[styles.statusText, statusStyle(item.status)]}>{statusLabel(item.status)}</Text>
          {item.status === 'confirmed' && (
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.completeBtn} onPress={() => updateStatus(item.id, 'completed')}>
                <Text style={styles.completeBtnText}>完了</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rescheduleBtn} onPress={() => navigation.navigate('Reschedule', { bookingId: item.id })}>
                <Ionicons name="calendar-outline" size={15} color={COLORS.accent} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => confirmCancel(item)}>
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

      {/* 当日キャンセルの処理選択（回数券 / 未収金 / 無料） */}
      <Modal visible={!!chargeItem} transparent animationType="fade" onRequestClose={() => !processing && setChargeItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Ionicons name="alert-circle" size={20} color={COLORS.error} />
              <Text style={styles.modalTitle}>当日キャンセルの処理</Text>
            </View>
            <Text style={styles.modalPolicy}>{CANCELLATION_POLICY.headline}</Text>
            {chargeItem && (
              <Text style={styles.modalCustomer}>
                {chargeItem.profile?.full_name ?? '---'}様 / {chargeItem.treatment_menu?.name ?? ''}
              </Text>
            )}

            <TouchableOpacity style={[styles.chargeBtn, styles.chargeTicket]} disabled={processing} onPress={() => processSameDay('ticket')}>
              <Ionicons name="ticket-outline" size={18} color={COLORS.success} />
              <Text style={styles.chargeBtnText}>回数券で1回分を消化</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.chargeBtn, styles.chargeUnpaid]} disabled={processing} onPress={() => processSameDay('unpaid')}>
              <Ionicons name="cash-outline" size={18} color={COLORS.warning} />
              <Text style={styles.chargeBtnText}>
                キャンセル料を未収金で記録{chargeItem?.treatment_menu?.price ? `（¥${chargeItem.treatment_menu.price.toLocaleString()}）` : ''}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.chargeBtn, styles.chargeWaive]} disabled={processing} onPress={() => processSameDay('waive')}>
              <Ionicons name="hand-left-outline" size={18} color={COLORS.textSecondary} />
              <Text style={styles.chargeBtnText}>無料でキャンセル（今回は頂かない）</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.chargeCancel} disabled={processing} onPress={() => setChargeItem(null)}>
              <Text style={styles.chargeCancelText}>{processing ? '処理中...' : 'やめる'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  customerName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  lineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: '#06C75515', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
  },
  lineBadgeText: { fontSize: 8, fontWeight: '700', color: '#06C755' },
  menuName: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  modalSheet: { backgroundColor: COLORS.background, borderRadius: 16, padding: 20 },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  modalPolicy: {
    fontSize: 12, fontWeight: '600', color: COLORS.error, lineHeight: 18,
    backgroundColor: '#FBEDED', borderRadius: 8, padding: 10, marginBottom: 8,
  },
  modalCustomer: { fontSize: 13, color: COLORS.text, fontWeight: '600', marginBottom: 14 },
  chargeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5, marginBottom: 10,
  },
  chargeTicket: { borderColor: COLORS.success, backgroundColor: '#EEF6F0' },
  chargeUnpaid: { borderColor: COLORS.warning, backgroundColor: '#FBF4E8' },
  chargeWaive: { borderColor: COLORS.border, backgroundColor: COLORS.surface },
  chargeBtnText: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  chargeCancel: { alignItems: 'center', paddingVertical: 12, marginTop: 2 },
  chargeCancelText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  recurBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: COLORS.accent + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  recurBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.accent },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  staffText: { fontSize: 12, color: COLORS.text, fontWeight: '600' },
  shimeiBadge: { backgroundColor: COLORS.accent, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  shimeiText: { fontSize: 9, fontWeight: '700', color: '#FFF' },
  omakaseBadge: { backgroundColor: COLORS.backgroundSoft, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  omakaseText: { fontSize: 9, fontWeight: '700', color: COLORS.textSecondary },
  requestBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5, marginTop: 5,
    backgroundColor: '#FFF8F0', borderRadius: 6, padding: 6,
  },
  requestText: { flex: 1, fontSize: 11, color: COLORS.text, lineHeight: 16 },
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
  rescheduleBtn: {
    backgroundColor: COLORS.accent + '15', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8,
  },
  empty: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 13, color: COLORS.textLight },
});
