// 空き枠ブロック管理
// スタッフ休憩・外出・通院などの不在時間を登録。
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList,
  Modal, TextInput, Alert, RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { useAuthStore } from '../../stores/authStore';

const TIME_SLOTS: string[] = (() => {
  const out: string[] = [];
  for (let h = 8; h <= 21; h++) {
    out.push(`${String(h).padStart(2, '0')}:00`);
    out.push(`${String(h).padStart(2, '0')}:30`);
  }
  return out;
})();

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ブロック種別（ホットペッパー式）。いずれも当該スタッフのみブロック（他スタッフの予約とは並行可）。
const BLOCK_TYPES: { value: string; label: string; desc: string; color: string }[] = [
  { value: 'changeover', label: '入れ替え時間', desc: '施術の前後・片付け', color: COLORS.accent },
  { value: 'busy', label: '予定あり', desc: '会議・接客など', color: COLORS.warning },
  { value: 'off', label: '休み', desc: '休憩・外出・通院', color: COLORS.error },
];
function blockMeta(t?: string) {
  return BLOCK_TYPES.find((b) => b.value === t) ?? BLOCK_TYPES[1];
}

export function StaffUnavailabilityScreen() {
  const { selectedStore } = useStoreSelection();
  const profile = useAuthStore((s) => s.profile);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('staff_unavailability')
      .select('*, staff:profiles!staff_unavailability_staff_id_fkey(full_name)')
      .or(`store_id.eq.${selectedStore},store_id.is.null`)
      .gte('ends_at', cutoff)
      .order('starts_at');
    setRows(data ?? []);
    setLoading(false);
  }, [selectedStore]);

  useFocusEffect(useCallback(() => { fetchRows(); }, [fetchRows]));

  async function handleDelete(id: string) {
    Alert.alert('削除', 'この不在時間を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          await supabase.from('staff_unavailability').delete().eq('id', id);
          fetchRows();
        },
      },
    ]);
  }

  function renderItem({ item }: { item: any }) {
    const s = new Date(item.starts_at);
    const e = new Date(item.ends_at);
    const sDate = s.toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit', weekday: 'short' });
    const sTime = s.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    const eTime = e.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

    const meta = blockMeta(item.block_type);
    return (
      <View style={[styles.row, { borderLeftColor: meta.color }]}>
        <View style={{ flex: 1 }}>
          <View style={styles.rowTopRow}>
            <Text style={styles.rowDate}>{sDate}</Text>
            <View style={[styles.typeBadge, { backgroundColor: meta.color + '20' }]}>
              <Text style={[styles.typeBadgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          </View>
          <Text style={[styles.rowTime, { color: meta.color }]}>{sTime} - {eTime}</Text>
          {item.reason && <Text style={styles.rowReason}>{item.reason}</Text>}
          <Text style={styles.rowStaff}>
            {item.staff?.full_name ? `担当: ${item.staff.full_name}` : '全スタッフ'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={16} color={COLORS.error} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.subtitle}>入れ替え時間・予定あり・休みを登録</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={styles.addBtnText}>追加</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchRows} tintColor={COLORS.accent} />}
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <Ionicons name="calendar-outline" size={32} color={COLORS.textLight} />
            <Text style={styles.emptyText}>登録された不在時間はありません</Text>
          </View>
        ) : null}
      />
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <UnavailabilityForm
          storeId={selectedStore}
          createdBy={profile?.id}
          onSaved={() => { setShowForm(false); fetchRows(); }}
          onClose={() => setShowForm(false)}
        />
      </Modal>
    </View>
  );
}

function UnavailabilityForm({
  storeId, createdBy, onSaved, onClose,
}: { storeId: string; createdBy?: string; onSaved: () => void; onClose: () => void }) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [startTime, setStartTime] = useState<string>('10:00');
  const [endTime, setEndTime] = useState<string>('11:00');
  const [reason, setReason] = useState('');
  const [blockType, setBlockType] = useState<string>('busy');
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles')
        .select('id, full_name')
        .in('role', ['staff', 'admin']);
      setStaff(data ?? []);
    })();
  }, []);

  const dates = Array.from({ length: 30 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  async function handleSave() {
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    const s = new Date(selectedDate);
    s.setHours(sh, sm, 0, 0);
    const e = new Date(selectedDate);
    e.setHours(eh, em, 0, 0);
    if (e <= s) {
      Alert.alert('エラー', '終了は開始より後にしてください');
      return;
    }
    setSaving(true);
    const { error } = await supabase.from('staff_unavailability').insert({
      staff_id: staffId,
      store_id: storeId,
      starts_at: s.toISOString(),
      ends_at: e.toISOString(),
      block_type: blockType,
      reason: reason || null,
      created_by: createdBy ?? null,
    });
    setSaving(false);
    if (error) { Alert.alert('エラー', error.message); return; }
    onSaved();
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
        <Text style={styles.modalTitle}>予約ブロックを登録</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.fieldLabel}>種別</Text>
        <View style={styles.typeRow}>
          {BLOCK_TYPES.map((bt) => {
            const sel = blockType === bt.value;
            return (
              <TouchableOpacity
                key={bt.value}
                style={[styles.typeCard, sel && { borderColor: bt.color, backgroundColor: bt.color + '12' }]}
                onPress={() => setBlockType(bt.value)}
              >
                <Text style={[styles.typeCardLabel, sel && { color: bt.color }]}>{bt.label}</Text>
                <Text style={styles.typeCardDesc}>{bt.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>日付</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {dates.map((d) => {
            const sel = ymd(d) === ymd(selectedDate);
            return (
              <TouchableOpacity
                key={d.toISOString()}
                style={[styles.dateChip, sel && styles.dateChipActive]}
                onPress={() => setSelectedDate(d)}
              >
                <Text style={[styles.dateChipMonth, sel && { color: '#FFF' }]}>{d.getMonth() + 1}/{d.getDate()}</Text>
                <Text style={[styles.dateChipDay, sel && { color: '#FFF' }]}>
                  {['日','月','火','水','木','金','土'][d.getDay()]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.fieldLabel}>開始時間</Text>
        <View style={styles.timeGrid}>
          {TIME_SLOTS.map((t) => (
            <TouchableOpacity
              key={'s' + t}
              style={[styles.timeChip, startTime === t && styles.timeChipActive]}
              onPress={() => setStartTime(t)}
            >
              <Text style={[styles.timeChipText, startTime === t && styles.timeChipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>終了時間</Text>
        <View style={styles.timeGrid}>
          {TIME_SLOTS.map((t) => (
            <TouchableOpacity
              key={'e' + t}
              style={[styles.timeChip, endTime === t && styles.timeChipActive]}
              onPress={() => setEndTime(t)}
            >
              <Text style={[styles.timeChipText, endTime === t && styles.timeChipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.fieldLabel}>理由（任意）</Text>
        <TextInput
          style={styles.input}
          placeholder="休憩、通院、講習など"
          placeholderTextColor={COLORS.textLight}
          value={reason}
          onChangeText={setReason}
        />

        <Text style={styles.fieldLabel}>担当スタッフ（空欄なら全員）</Text>
        <View style={styles.staffRow}>
          <TouchableOpacity
            style={[styles.staffChip, staffId === null && styles.staffChipActive]}
            onPress={() => setStaffId(null)}
          >
            <Text style={[styles.staffChipText, staffId === null && styles.staffChipTextActive]}>全員</Text>
          </TouchableOpacity>
          {staff.map((s) => (
            <TouchableOpacity
              key={s.id}
              style={[styles.staffChip, staffId === s.id && styles.staffChipActive]}
              onPress={() => setStaffId(s.id)}
            >
              <Text style={[styles.staffChipText, staffId === s.id && styles.staffChipTextActive]}>
                {s.full_name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>保存</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  subtitle: { fontSize: 12, color: COLORS.textSecondary, flex: 1 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18,
  },
  addBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  list: { padding: 16, paddingBottom: 40 },
  row: {
    backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center',
    borderLeftWidth: 3, borderLeftColor: COLORS.error,
  },
  rowTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowDate: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeBadgeText: { fontSize: 10, fontWeight: '700' },
  rowTime: { fontSize: 15, fontWeight: '700', color: COLORS.error, marginTop: 2 },
  rowReason: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  rowStaff: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  deleteBtn: { padding: 8 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 13, color: COLORS.textLight },

  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  fieldLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600', marginTop: 14, marginBottom: 6 },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeCard: {
    flex: 1, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12,
    backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center',
  },
  typeCardLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  typeCardDesc: { fontSize: 9, color: COLORS.textLight, marginTop: 3, textAlign: 'center' },
  dateChip: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, minWidth: 50,
  },
  dateChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  dateChipMonth: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  dateChipDay: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  timeChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  timeChipText: { fontSize: 11, fontWeight: '600', color: COLORS.text },
  timeChipTextActive: { color: '#FFF' },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, fontSize: 14, color: COLORS.text,
  },
  staffRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  staffChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  staffChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  staffChipText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  staffChipTextActive: { color: '#FFF' },
  saveBtn: {
    backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: 12,
    alignItems: 'center', marginTop: 24,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
