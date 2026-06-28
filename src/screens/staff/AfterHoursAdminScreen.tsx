// スタッフ用：営業時間外リクエスト管理
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, TextInput, Modal, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

type Request = {
  id: string;
  status: 'pending' | 'confirmed' | 'declined' | 'cancelled';
  requested_date: string;
  requested_time: string;
  menu_name: string | null;
  message: string | null;
  staff_note: string | null;
  store_id: string;
  created_at: string;
  profiles: { full_name: string; phone: string | null } | null;
};

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  pending:   { label: '未対応', color: '#E67E22' },
  confirmed: { label: '確認済', color: '#27AE60' },
  declined:  { label: '対応不可', color: '#E74C3C' },
  cancelled: { label: 'キャンセル', color: '#95A5A6' },
};

export function AfterHoursAdminScreen() {
  const [requests, setRequests] = useState<Request[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [selected, setSelected] = useState<Request | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchRequests = useCallback(async () => {
    let q = supabase
      .from('after_hours_requests')
      .select('*, profiles(full_name, phone)')
      .order('requested_date', { ascending: true })
      .order('requested_time', { ascending: true });
    if (filter === 'pending') q = q.eq('status', 'pending');
    const { data } = await q;
    setRequests((data as Request[]) ?? []);
  }, [filter]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  const openDetail = (r: Request) => {
    setSelected(r);
    setNote(r.staff_note ?? '');
  };

  const updateStatus = async (status: string) => {
    if (!selected) return;
    setSaving(true);
    await supabase.from('after_hours_requests').update({ status, staff_note: note }).eq('id', selected.id);
    setSaving(false);
    setSelected(null);
    fetchRequests();
  };

  const renderItem = ({ item }: { item: Request }) => {
    const s = STATUS_LABEL[item.status] ?? STATUS_LABEL.pending;
    return (
      <TouchableOpacity style={styles.card} onPress={() => openDetail(item)}>
        <View style={styles.cardTop}>
          <Text style={styles.dateText}>{item.requested_date} {item.requested_time}</Text>
          <View style={[styles.statusBadge, { backgroundColor: s.color + '20' }]}>
            <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
          </View>
        </View>
        <Text style={styles.customerName}>{item.profiles?.full_name ?? '（不明）'}</Text>
        {item.menu_name ? <Text style={styles.menu}>{item.menu_name}</Text> : null}
        {item.message ? <Text style={styles.msg} numberOfLines={2}>{item.message}</Text> : null}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {(['pending', 'all'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'pending' ? '未対応のみ' : 'すべて'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={requests}
        keyExtractor={r => r.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="moon-outline" size={40} color="#ccc" />
            <Text style={styles.emptyText}>リクエストはありません</Text>
          </View>
        }
      />

      <Modal visible={!!selected} animationType="slide" presentationStyle="pageSheet">
        <ScrollView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>リクエスト詳細</Text>
            <TouchableOpacity onPress={() => setSelected(null)}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>
          {selected && (
            <View style={styles.modalBody}>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>顧客</Text><Text style={styles.infoVal}>{selected.profiles?.full_name ?? '不明'}</Text></View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>電話</Text><Text style={styles.infoVal}>{selected.profiles?.phone ?? '未登録'}</Text></View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>希望日時</Text><Text style={styles.infoVal}>{selected.requested_date} {selected.requested_time}</Text></View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>店舗</Text><Text style={styles.infoVal}>{selected.store_id === 'tamashima' ? '玉島店' : '金光店'}</Text></View>
              {selected.menu_name && <View style={styles.infoRow}><Text style={styles.infoLabel}>メニュー</Text><Text style={styles.infoVal}>{selected.menu_name}</Text></View>}
              {selected.message && (
                <View style={styles.infoBlock}>
                  <Text style={styles.infoLabel}>備考</Text>
                  <Text style={styles.infoBlockText}>{selected.message}</Text>
                </View>
              )}
              <Text style={[styles.infoLabel, { marginTop: 16 }]}>スタッフメモ</Text>
              <TextInput
                style={styles.noteInput}
                placeholder="対応内容や連絡事項を記入..."
                multiline
                numberOfLines={3}
                value={note}
                onChangeText={setNote}
              />
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#27AE6020' }]}
                  onPress={() => Alert.alert('確認', '「確認済み」に変更しますか？', [
                    { text: 'キャンセル', style: 'cancel' },
                    { text: '変更', onPress: () => updateStatus('confirmed') },
                  ])}
                  disabled={saving}
                >
                  <Text style={[styles.actionBtnText, { color: '#27AE60' }]}>確認済みにする</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#E74C3C20' }]}
                  onPress={() => Alert.alert('確認', '「対応不可」に変更しますか？', [
                    { text: 'キャンセル', style: 'cancel' },
                    { text: '変更', onPress: () => updateStatus('declined') },
                  ])}
                  disabled={saving}
                >
                  <Text style={[styles.actionBtnText, { color: '#E74C3C' }]}>対応不可にする</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  filterRow: { flexDirection: 'row', padding: 8, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  filterBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, backgroundColor: '#f0f0f0', alignItems: 'center' },
  filterBtnActive: { backgroundColor: COLORS.primary },
  filterText: { fontSize: 13, color: '#666' },
  filterTextActive: { color: '#fff', fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  dateText: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '600' },
  customerName: { fontSize: 14, color: COLORS.text, marginBottom: 2 },
  menu: { fontSize: 12, color: COLORS.primary, marginTop: 2 },
  msg: { fontSize: 12, color: '#888', marginTop: 4 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyText: { fontSize: 14, color: '#aaa' },
  modal: { flex: 1, backgroundColor: '#f8f8f8' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  modalBody: { padding: 16 },
  infoRow: { flexDirection: 'row', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  infoLabel: { fontSize: 13, color: '#888', width: 72 },
  infoVal: { flex: 1, fontSize: 13, color: COLORS.text },
  infoBlock: { paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f0f0f0' },
  infoBlockText: { fontSize: 13, color: COLORS.text, marginTop: 4, lineHeight: 18 },
  noteInput: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', padding: 10, marginTop: 6, fontSize: 13, textAlignVertical: 'top', minHeight: 70 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  actionBtnText: { fontSize: 14, fontWeight: '600' },
});
