// 店舗の営業時間・定休日 管理
// =====================================================
// ・曜日ごとの営業時間（store_business_hours）を編集
// ・特定日の臨時休業／時間変更（store_closed_days）を登録
// 空き枠計算（get-available-slots）が参照する設定をここで運用調整する。
// =====================================================
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList,
  Modal, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useStoreSelection } from '../../stores/storeSelectionStore';

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
// 30分刻みの時刻候補（08:00〜21:30）
const TIMES: string[] = (() => {
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
function hhmm(t?: string | null) {
  return t ? t.slice(0, 5) : '';
}

interface Hours {
  day_of_week: number;
  open_time: string | null;
  close_time: string | null;
  is_closed: boolean;
}
interface ClosedDay {
  id: string;
  date: string;
  is_closed: boolean;
  open_time: string | null;
  close_time: string | null;
}

export function StoreHoursScreen() {
  const { selectedStore } = useStoreSelection();
  const [hours, setHours] = useState<Hours[]>([]);
  const [closedDays, setClosedDays] = useState<ClosedDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDow, setEditDow] = useState<number | null>(null);
  const [showAddClosed, setShowAddClosed] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const today = ymd(new Date());
    const [{ data: bh }, { data: cd }] = await Promise.all([
      supabase.from('store_business_hours').select('*').eq('store_id', selectedStore).order('day_of_week'),
      supabase.from('store_closed_days').select('*').eq('store_id', selectedStore).gte('date', today).order('date'),
    ]);
    // 7曜日分を必ず埋める（未登録曜日はデフォルト休業扱いで表示）
    const map = new Map<number, Hours>();
    for (const r of (bh ?? []) as Hours[]) map.set(r.day_of_week, r);
    const full: Hours[] = [];
    for (let d = 0; d < 7; d++) {
      full.push(map.get(d) ?? { day_of_week: d, open_time: '09:00', close_time: '19:00', is_closed: d === 0 });
    }
    setHours(full);
    setClosedDays((cd as ClosedDay[]) ?? []);
    setLoading(false);
  }, [selectedStore]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  async function saveHours(h: Hours) {
    const { error } = await supabase.from('store_business_hours').upsert({
      store_id: selectedStore,
      day_of_week: h.day_of_week,
      open_time: h.is_closed ? null : h.open_time,
      close_time: h.is_closed ? null : h.close_time,
      is_closed: h.is_closed,
    }, { onConflict: 'store_id,day_of_week' });
    if (error) { Alert.alert('エラー', error.message); return; }
    setEditDow(null);
    fetchAll();
  }

  async function deleteClosed(id: string) {
    await supabase.from('store_closed_days').delete().eq('id', id);
    fetchAll();
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={COLORS.accent} /></View>;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* 曜日ごとの営業時間 */}
      <Text style={styles.sectionHead}>曜日ごとの営業時間</Text>
      <View style={styles.card}>
        {hours.map((h) => (
          <TouchableOpacity key={h.day_of_week} style={styles.hourRow} onPress={() => setEditDow(h.day_of_week)}>
            <Text style={[styles.dowLabel, h.day_of_week === 0 && { color: COLORS.error }]}>{DOW[h.day_of_week]}曜</Text>
            {h.is_closed ? (
              <Text style={styles.closedLabel}>定休日</Text>
            ) : (
              <Text style={styles.hourLabel}>{hhmm(h.open_time)} 〜 {hhmm(h.close_time)}</Text>
            )}
            <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
          </TouchableOpacity>
        ))}
      </View>

      {/* 臨時休業・時間変更 */}
      <View style={styles.sectionHeadRow}>
        <Text style={styles.sectionHead}>臨時休業・時間変更</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddClosed(true)}>
          <Ionicons name="add" size={16} color="#FFF" />
          <Text style={styles.addBtnText}>追加</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        {closedDays.length === 0 ? (
          <Text style={styles.empty}>登録された臨時休業・変更はありません</Text>
        ) : (
          closedDays.map((c) => {
            const d = new Date(`${c.date}T00:00:00+09:00`);
            const label = d.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
            return (
              <View key={c.id} style={styles.closedRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.closedDate}>{label}</Text>
                  <Text style={c.is_closed ? styles.closedTag : styles.hourLabel}>
                    {c.is_closed ? '臨時休業' : `${hhmm(c.open_time)} 〜 ${hhmm(c.close_time)}`}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => deleteClosed(c.id)} style={styles.delBtn}>
                  <Ionicons name="trash-outline" size={16} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </View>

      {/* 曜日編集モーダル */}
      <Modal visible={editDow !== null} transparent animationType="fade" onRequestClose={() => setEditDow(null)}>
        {editDow !== null && (
          <HoursEditor
            initial={hours[editDow]}
            onSave={saveHours}
            onClose={() => setEditDow(null)}
          />
        )}
      </Modal>

      {/* 臨時休業追加モーダル */}
      <Modal visible={showAddClosed} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowAddClosed(false)}>
        <ClosedDayForm
          storeId={selectedStore}
          onSaved={() => { setShowAddClosed(false); fetchAll(); }}
          onClose={() => setShowAddClosed(false)}
        />
      </Modal>
    </ScrollView>
  );
}

function HoursEditor({ initial, onSave, onClose }: { initial: Hours; onSave: (h: Hours) => void; onClose: () => void }) {
  const [isClosed, setIsClosed] = useState(initial.is_closed);
  const [open, setOpen] = useState(hhmm(initial.open_time) || '09:00');
  const [close, setClose] = useState(hhmm(initial.close_time) || '19:00');

  return (
    <View style={styles.modalBackdrop}>
      <View style={styles.modalSheet}>
        <Text style={styles.modalTitle}>{DOW[initial.day_of_week]}曜日の営業時間</Text>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>定休日にする</Text>
          <Switch value={isClosed} onValueChange={setIsClosed} trackColor={{ true: COLORS.accent }} />
        </View>

        {!isClosed && (
          <>
            <Text style={styles.fieldLabel}>開店</Text>
            <View style={styles.timeGrid}>
              {TIMES.map((t) => (
                <TouchableOpacity key={'o' + t} style={[styles.timeChip, open === t && styles.timeChipOn]} onPress={() => setOpen(t)}>
                  <Text style={[styles.timeChipText, open === t && styles.timeChipTextOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>閉店</Text>
            <View style={styles.timeGrid}>
              {TIMES.map((t) => (
                <TouchableOpacity key={'c' + t} style={[styles.timeChip, close === t && styles.timeChipOn]} onPress={() => setClose(t)}>
                  <Text style={[styles.timeChipText, close === t && styles.timeChipTextOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <View style={styles.modalBtns}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>キャンセル</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => {
              if (!isClosed && close <= open) { Alert.alert('エラー', '閉店は開店より後にしてください'); return; }
              onSave({ day_of_week: initial.day_of_week, is_closed: isClosed, open_time: open, close_time: close });
            }}
          >
            <Text style={styles.saveBtnText}>保存</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function ClosedDayForm({ storeId, onSaved, onClose }: { storeId: string; onSaved: () => void; onClose: () => void }) {
  const [date, setDate] = useState<Date>(new Date());
  const [isClosed, setIsClosed] = useState(true);
  const [open, setOpen] = useState('09:00');
  const [close, setClose] = useState('19:00');
  const [saving, setSaving] = useState(false);

  const dates = Array.from({ length: 60 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d;
  });

  async function save() {
    if (!isClosed && close <= open) { Alert.alert('エラー', '閉店は開店より後にしてください'); return; }
    setSaving(true);
    const { error } = await supabase.from('store_closed_days').upsert({
      store_id: storeId,
      date: ymd(date),
      is_closed: isClosed,
      open_time: isClosed ? null : open,
      close_time: isClosed ? null : close,
    }, { onConflict: 'store_id,date' });
    setSaving(false);
    if (error) { Alert.alert('エラー', error.message); return; }
    onSaved();
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={styles.formHeader}>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={24} color={COLORS.text} /></TouchableOpacity>
        <Text style={styles.modalTitle}>臨時休業・時間変更</Text>
        <View style={{ width: 24 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Text style={styles.fieldLabel}>日付</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {dates.map((d) => {
            const sel = ymd(d) === ymd(date);
            return (
              <TouchableOpacity key={d.toISOString()} style={[styles.dateChip, sel && styles.dateChipOn]} onPress={() => setDate(d)}>
                <Text style={[styles.dateChipM, sel && { color: '#FFF' }]}>{d.getMonth() + 1}/{d.getDate()}</Text>
                <Text style={[styles.dateChipD, sel && { color: '#FFF' }]}>{DOW[d.getDay()]}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>終日休業にする</Text>
          <Switch value={isClosed} onValueChange={setIsClosed} trackColor={{ true: COLORS.accent }} />
        </View>

        {!isClosed && (
          <>
            <Text style={styles.fieldLabel}>開店</Text>
            <View style={styles.timeGrid}>
              {TIMES.map((t) => (
                <TouchableOpacity key={'fo' + t} style={[styles.timeChip, open === t && styles.timeChipOn]} onPress={() => setOpen(t)}>
                  <Text style={[styles.timeChipText, open === t && styles.timeChipTextOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.fieldLabel}>閉店</Text>
            <View style={styles.timeGrid}>
              {TIMES.map((t) => (
                <TouchableOpacity key={'fc' + t} style={[styles.timeChip, close === t && styles.timeChipOn]} onPress={() => setClose(t)}>
                  <Text style={[styles.timeChipText, close === t && styles.timeChipTextOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity style={[styles.saveBtn, { marginTop: 24 }, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
          <Text style={styles.saveBtnText}>保存</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionHead: { fontSize: 13, fontWeight: '700', color: COLORS.textSecondary, paddingHorizontal: 20, marginTop: 20, marginBottom: 10 },
  sectionHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12,
    backgroundColor: COLORS.accent, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
  },
  addBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  card: { backgroundColor: COLORS.surface, marginHorizontal: 16, borderRadius: 14, overflow: 'hidden' },
  hourRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.borderLight,
  },
  dowLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text, width: 44 },
  hourLabel: { flex: 1, fontSize: 14, color: COLORS.text },
  closedLabel: { flex: 1, fontSize: 14, color: COLORS.error, fontWeight: '600' },
  empty: { fontSize: 13, color: COLORS.textLight, padding: 16 },
  closedRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.borderLight,
  },
  closedDate: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  closedTag: { fontSize: 13, color: COLORS.error, fontWeight: '600', marginTop: 2 },
  noteText: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  delBtn: { padding: 8 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalSheet: { backgroundColor: COLORS.background, borderRadius: 16, padding: 20, maxHeight: '80%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  formHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  switchLabel: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  fieldLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600', marginTop: 16, marginBottom: 6 },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  timeChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  timeChipOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  timeChipText: { fontSize: 11, fontWeight: '600', color: COLORS.text },
  timeChipTextOn: { color: '#FFF' },
  dateChip: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, minWidth: 50,
  },
  dateChipOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  dateChipM: { fontSize: 12, fontWeight: '700', color: COLORS.text },
  dateChipD: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.textSecondary },
  saveBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.accent },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
