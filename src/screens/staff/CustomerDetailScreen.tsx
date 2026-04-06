import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Linking, Alert, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { StaffStackParamList } from '../../types/navigation';
import type { Profile, AppBooking, CounselingSheet, Order } from '../../types/database';

type Props = NativeStackScreenProps<StaffStackParamList, 'CustomerDetail'>;

export function CustomerDetailScreen({ route }: Props) {
  const { userId } = route.params;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bookings, setBookings] = useState<AppBooking[]>([]);
  const [counselingSheets, setCounselingSheets] = useState<CounselingSheet[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setRefreshing(true);
    const [profileRes, bookingsRes, counselingRes, ordersRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('app_bookings').select('*, treatment_menu:treatment_menus(name)')
        .eq('user_id', userId).order('starts_at', { ascending: false }).limit(20),
      supabase.from('counseling_sheets').select('*')
        .eq('user_id', userId).order('created_at', { ascending: false }),
      supabase.from('orders').select('*, items:order_items(*, product:products(name))')
        .eq('user_id', userId).order('created_at', { ascending: false }).limit(10),
    ]);
    setProfile(profileRes.data as Profile);
    setBookings((bookingsRes.data as AppBooking[]) ?? []);
    setCounselingSheets((counselingRes.data as CounselingSheet[]) ?? []);
    setOrders((ordersRes.data as Order[]) ?? []);
    setRefreshing(false);
  }

  if (!profile) {
    return <View style={styles.loading}><Text style={styles.loadingText}>...</Text></View>;
  }

  const dob = profile.date_of_birth
    ? new Date(profile.date_of_birth).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    : '未登録';

  const totalVisits = bookings.filter((b) => b.status === 'completed').length;
  const latestSheet = counselingSheets[0];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchAll} tintColor={COLORS.accent} />}
    >
      {/* Profile header */}
      <View style={styles.profileHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{profile.full_name?.charAt(0) ?? '?'}</Text>
        </View>
        <Text style={styles.profileName}>{profile.full_name}</Text>
        {profile.full_name_kana && <Text style={styles.profileKana}>{profile.full_name_kana}</Text>}

        <View style={styles.profileActions}>
          {profile.phone && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`tel:${profile.phone}`)}>
              <Ionicons name="call-outline" size={18} color={COLORS.accent} />
              <Text style={styles.actionBtnText}>電話</Text>
            </TouchableOpacity>
          )}
          {profile.email && (
            <TouchableOpacity style={styles.actionBtn} onPress={() => Linking.openURL(`mailto:${profile.email}`)}>
              <Ionicons name="mail-outline" size={18} color={COLORS.accent} />
              <Text style={styles.actionBtnText}>メール</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Basic info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>基本情報</Text>
        <View style={styles.infoCard}>
          <InfoRow label="電話番号" value={profile.phone ?? '未登録'} />
          <InfoRow label="メール" value={profile.email ?? '未登録'} />
          <InfoRow label="生年月日" value={dob} />
          <InfoRow label="来店店舗" value={profile.preferred_store} />
          <InfoRow label="登録日" value={new Date(profile.created_at).toLocaleDateString('ja-JP')} />
          <InfoRow label="来店回数" value={`${totalVisits}回`} last />
        </View>
      </View>

      {/* Tags */}
      <TagSection userId={userId} tags={profile.tags ?? []} onUpdate={fetchAll} />

      {/* Counseling sheet / Karte */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>カルテ（カウンセリングシート）</Text>
        {counselingSheets.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="document-text-outline" size={24} color={COLORS.borderLight} />
            <Text style={styles.emptyCardText}>カウンセリングシート未記入</Text>
          </View>
        ) : (
          counselingSheets.map((sheet) => (
            <View key={sheet.id} style={styles.sheetCard}>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetDate}>
                  {new Date(sheet.created_at).toLocaleDateString('ja-JP')}
                </Text>
                <View style={[styles.sheetBadge, { backgroundColor: sheet.status === 'completed' ? COLORS.success + '20' : COLORS.warning + '20' }]}>
                  <Text style={[styles.sheetBadgeText, { color: sheet.status === 'completed' ? COLORS.success : COLORS.warning }]}>
                    {sheet.status === 'completed' ? '記入済' : '未記入'}
                  </Text>
                </View>
              </View>
              {sheet.status === 'completed' && sheet.responses && (
                <View style={styles.sheetResponses}>
                  {Object.entries(sheet.responses as Record<string, string>).map(([key, val]) => {
                    if (!val || typeof val !== 'string' || !val.trim()) return null;
                    return (
                      <View key={key} style={styles.responseItem}>
                        <Text style={styles.responseKey}>{formatKey(key)}</Text>
                        <Text style={styles.responseValue}>{val}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          ))
        )}
      </View>

      {/* Booking history */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>予約履歴</Text>
        {bookings.length === 0 ? (
          <Text style={styles.emptyText}>予約履歴なし</Text>
        ) : (
          bookings.map((b) => (
            <View key={b.id} style={styles.historyItem}>
              <View style={styles.historyDate}>
                <Text style={styles.historyDateText}>
                  {new Date(b.starts_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                </Text>
                <Text style={styles.historyTimeText}>
                  {new Date(b.starts_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={styles.historyInfo}>
                <Text style={styles.historyMenu}>{b.treatment_menu?.name ?? ''}</Text>
                <Text style={[styles.historyStatus, statusColor(b.status)]}>{statusLabel(b.status)}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      {/* Order history */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>注文履歴</Text>
        {orders.length === 0 ? (
          <Text style={styles.emptyText}>注文履歴なし</Text>
        ) : (
          orders.map((o) => (
            <View key={o.id} style={styles.historyItem}>
              <View style={styles.historyDate}>
                <Text style={styles.historyDateText}>
                  {new Date(o.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              <View style={styles.historyInfo}>
                <Text style={styles.historyMenu}>
                  {(o.items ?? []).map((i: any) => i.product?.name).filter(Boolean).join(', ') || '商品'}
                </Text>
                <Text style={styles.historyPrice}>¥{o.total.toLocaleString()}</Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[infoStyles.row, !last && infoStyles.rowBorder]}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={infoStyles.value}>{value}</Text>
    </View>
  );
}

const PRESET_TAGS = ['VIP', '旧料金', '回数券優待', 'スタッフ', '紹介済'];

function TagSection({ userId, tags, onUpdate }: { userId: string; tags: string[]; onUpdate: () => void }) {
  const [newTag, setNewTag] = useState('');

  async function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    const updated = [...tags, trimmed];
    const { error } = await supabase.from('profiles').update({ tags: updated }).eq('id', userId);
    if (error) { Alert.alert('エラー', 'タグの追加に失敗しました'); return; }
    setNewTag('');
    onUpdate();
  }

  async function removeTag(tag: string) {
    const updated = tags.filter((t) => t !== tag);
    const { error } = await supabase.from('profiles').update({ tags: updated }).eq('id', userId);
    if (error) { Alert.alert('エラー', 'タグの削除に失敗しました'); return; }
    onUpdate();
  }

  return (
    <View style={tagStyles.section}>
      <Text style={styles.sectionTitle}>タグ</Text>
      <View style={tagStyles.card}>
        {/* Current tags */}
        <View style={tagStyles.tagList}>
          {tags.length === 0 && <Text style={tagStyles.emptyText}>タグなし</Text>}
          {tags.map((tag) => (
            <View key={tag} style={tagStyles.tag}>
              <Text style={tagStyles.tagText}>{tag}</Text>
              <TouchableOpacity onPress={() => removeTag(tag)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="close-circle" size={16} color={COLORS.textLight} />
              </TouchableOpacity>
            </View>
          ))}
        </View>

        {/* Preset tags */}
        <View style={tagStyles.presetRow}>
          {PRESET_TAGS.filter((t) => !tags.includes(t)).map((tag) => (
            <TouchableOpacity key={tag} style={tagStyles.presetChip} onPress={() => addTag(tag)}>
              <Ionicons name="add" size={12} color={COLORS.accent} />
              <Text style={tagStyles.presetText}>{tag}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Custom tag input */}
        <View style={tagStyles.inputRow}>
          <TextInput
            style={tagStyles.input}
            placeholder="カスタムタグを追加"
            placeholderTextColor={COLORS.textLight}
            value={newTag}
            onChangeText={setNewTag}
            onSubmitEditing={() => addTag(newTag)}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[tagStyles.addBtn, !newTag.trim() && { opacity: 0.4 }]}
            onPress={() => addTag(newTag)}
            disabled={!newTag.trim()}
          >
            <Text style={tagStyles.addBtnText}>追加</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const tagStyles = StyleSheet.create({
  section: { paddingHorizontal: 20, marginTop: 20 },
  card: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, gap: 12 },
  tagList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  emptyText: { fontSize: 13, color: COLORS.textLight },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.accentPink + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
  },
  tagText: { fontSize: 13, fontWeight: '600', color: COLORS.accentPink },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  presetChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: COLORS.backgroundSoft, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.borderLight, borderStyle: 'dashed',
  },
  presetText: { fontSize: 11, color: COLORS.accent, fontWeight: '500' },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1, backgroundColor: COLORS.backgroundSoft, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: COLORS.text,
  },
  addBtn: {
    backgroundColor: COLORS.accent, paddingHorizontal: 16, borderRadius: 10,
    justifyContent: 'center',
  },
  addBtnText: { fontSize: 13, fontWeight: '600', color: '#FFF' },
});

const RESPONSE_LABELS: Record<string, string> = {
  chief_complaint: '現在のお悩み・症状',
  duration: 'いつ頃から',
  medical_history: '病歴・手術歴',
  current_medication: '服用中のお薬',
  allergies: 'アレルギー',
  pregnancy: '妊娠',
  exercise_habits: '運動習慣',
  goals: '施術の目標',
  other: 'その他',
};

function formatKey(key: string): string {
  return RESPONSE_LABELS[key] ?? key;
}

function statusLabel(s: string): string {
  const map: Record<string, string> = { confirmed: '確定', completed: '完了', cancelled: 'キャンセル', no_show: '無断キャンセル' };
  return map[s] ?? s;
}

function statusColor(s: string) {
  const map: Record<string, any> = {
    confirmed: { color: COLORS.success },
    completed: { color: COLORS.textSecondary },
    cancelled: { color: COLORS.error },
    no_show: { color: COLORS.error },
  };
  return map[s] ?? { color: COLORS.textLight };
}

const infoStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, paddingHorizontal: 16 },
  rowBorder: { borderBottomWidth: 0.5, borderBottomColor: COLORS.borderLight },
  label: { fontSize: 13, color: COLORS.textSecondary },
  value: { fontSize: 13, fontWeight: '500', color: COLORS.text, maxWidth: '60%', textAlign: 'right' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textSecondary },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.accentLight,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  avatarText: { fontSize: 24, fontWeight: '500', color: COLORS.accent },
  profileName: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  profileKana: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  profileActions: { flexDirection: 'row', gap: 16, marginTop: 14 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.accentLight,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20,
  },
  actionBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.accent },
  section: { paddingHorizontal: 20, marginTop: 20 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 10 },
  infoCard: { backgroundColor: COLORS.surface, borderRadius: 14 },
  emptyCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 24,
    alignItems: 'center', gap: 8,
  },
  emptyCardText: { fontSize: 13, color: COLORS.textLight },
  emptyText: { fontSize: 13, color: COLORS.textLight, paddingVertical: 12 },
  sheetCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 10,
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sheetDate: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  sheetBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  sheetBadgeText: { fontSize: 10, fontWeight: '700' },
  sheetResponses: { gap: 10 },
  responseItem: { gap: 2 },
  responseKey: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  responseValue: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  historyItem: {
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 12,
    flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 12,
  },
  historyDate: { alignItems: 'center', minWidth: 50 },
  historyDateText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  historyTimeText: { fontSize: 11, color: COLORS.textSecondary },
  historyInfo: { flex: 1 },
  historyMenu: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  historyStatus: { fontSize: 11, marginTop: 2 },
  historyPrice: { fontSize: 13, fontWeight: '600', color: COLORS.accent, marginTop: 2 },
});
