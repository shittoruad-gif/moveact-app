import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import type { StaffRegistration, StoreId } from '../../types/database';

type IdentifierType = 'phone' | 'email';

export function StaffRegistrationScreen() {
  const profile = useAuthStore((s) => s.profile);
  const [registrations, setRegistrations] = useState<StaffRegistration[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [identifierType, setIdentifierType] = useState<IdentifierType>('phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [storeId, setStoreId] = useState<StoreId | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchRegistrations(); }, []);

  async function fetchRegistrations() {
    setRefreshing(true);
    const { data, error } = await supabase
      .from('staff_registrations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error(error);
    }
    setRegistrations((data as StaffRegistration[]) ?? []);
    setRefreshing(false);
  }

  function resetForm() {
    setPhone('');
    setEmail('');
    setName('');
    setStoreId(null);
    setIdentifierType('phone');
    setShowForm(false);
  }

  async function handleSave() {
    let payload: { phone: string | null; email: string | null } = { phone: null, email: null };

    if (identifierType === 'phone') {
      const trimmedPhone = phone.trim().replace(/[-\s]/g, '');
      if (!trimmedPhone) {
        Alert.alert('入力エラー', '電話番号を入力してください');
        return;
      }
      if (!/^0\d{9,10}$/.test(trimmedPhone)) {
        Alert.alert('入力エラー', '正しい電話番号を入力してください（例: 09012345678）');
        return;
      }
      payload.phone = trimmedPhone;
    } else {
      const trimmedEmail = email.trim().toLowerCase();
      if (!trimmedEmail) {
        Alert.alert('入力エラー', 'メールアドレスを入力してください');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        Alert.alert('入力エラー', '正しいメールアドレスを入力してください');
        return;
      }
      payload.email = trimmedEmail;
    }

    setSaving(true);
    const { error } = await supabase.from('staff_registrations').insert({
      ...payload,
      name: name.trim() || null,
      store_id: storeId,
      registered_by: profile?.id,
      is_active: true,
    });
    setSaving(false);

    if (error) {
      if (error.code === '23505') {
        Alert.alert('エラー', identifierType === 'phone' ? 'この電話番号は既に登録されています' : 'このメールアドレスは既に登録されています');
      } else {
        Alert.alert('エラー', 'スタッフ登録に失敗しました');
        console.error(error);
      }
      return;
    }

    Alert.alert('完了', 'スタッフを登録しました');
    resetForm();
    fetchRegistrations();
  }

  async function toggleActive(registration: StaffRegistration) {
    const newActive = !registration.is_active;
    const identifier = registration.phone ?? registration.email ?? '---';
    const message = newActive
      ? `${registration.name ?? identifier} を有効にしますか？`
      : `${registration.name ?? identifier} を無効にしますか？このスタッフは次回ログインから顧客管理にアクセスできなくなります。`;

    Alert.alert(
      newActive ? 'スタッフを有効化' : 'スタッフを無効化',
      message,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: newActive ? '有効にする' : '無効にする',
          style: newActive ? 'default' : 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('staff_registrations')
              .update({ is_active: newActive })
              .eq('id', registration.id);
            if (error) {
              Alert.alert('エラー', '更新に失敗しました');
              return;
            }
            fetchRegistrations();
          },
        },
      ],
    );
  }

  const storeOptions = Object.values(STORES);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchRegistrations} tintColor={COLORS.accent} />}
    >
      {/* Description */}
      <View style={styles.descCard}>
        <Ionicons name="information-circle-outline" size={20} color={COLORS.accent} />
        <Text style={styles.descText}>
          スタッフの電話番号またはメールアドレスを事前に登録しておくと、そのアカウントでアプリに新規登録したユーザーに自動的にスタッフ権限が付与されます。
        </Text>
      </View>

      {/* Add button */}
      {!showForm && (
        <TouchableOpacity style={styles.addBtn} onPress={() => setShowForm(true)}>
          <Ionicons name="person-add-outline" size={18} color="#FFF" />
          <Text style={styles.addBtnText}>スタッフを追加</Text>
        </TouchableOpacity>
      )}

      {/* Add form */}
      {showForm && (
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>新規スタッフ登録</Text>

          {/* Identifier type selector */}
          <View style={styles.formField}>
            <Text style={styles.formLabel}>登録方法</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeChip, identifierType === 'phone' && styles.typeChipActive]}
                onPress={() => setIdentifierType('phone')}
              >
                <Ionicons
                  name="call-outline"
                  size={14}
                  color={identifierType === 'phone' ? '#FFF' : COLORS.textSecondary}
                />
                <Text style={[styles.typeChipText, identifierType === 'phone' && styles.typeChipTextActive]}>
                  電話番号
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeChip, identifierType === 'email' && styles.typeChipActive]}
                onPress={() => setIdentifierType('email')}
              >
                <Ionicons
                  name="mail-outline"
                  size={14}
                  color={identifierType === 'email' ? '#FFF' : COLORS.textSecondary}
                />
                <Text style={[styles.typeChipText, identifierType === 'email' && styles.typeChipTextActive]}>
                  メールアドレス
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Phone input */}
          {identifierType === 'phone' && (
            <View style={styles.formField}>
              <Text style={styles.formLabel}>
                電話番号 <Text style={styles.required}>*必須</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="09012345678"
                placeholderTextColor={COLORS.textLight}
                keyboardType="phone-pad"
              />
            </View>
          )}

          {/* Email input */}
          {identifierType === 'email' && (
            <View style={styles.formField}>
              <Text style={styles.formLabel}>
                メールアドレス <Text style={styles.required}>*必須</Text>
              </Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="staff@example.com"
                placeholderTextColor={COLORS.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          )}

          <View style={styles.formField}>
            <Text style={styles.formLabel}>名前（任意）</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="スタッフ名"
              placeholderTextColor={COLORS.textLight}
            />
          </View>

          <View style={styles.formField}>
            <Text style={styles.formLabel}>所属店舗（任意）</Text>
            <View style={styles.storeRow}>
              {storeOptions.map((store) => (
                <TouchableOpacity
                  key={store.id}
                  style={[styles.storeChip, storeId === store.id && styles.storeChipActive]}
                  onPress={() => setStoreId(storeId === store.id ? null : store.id)}
                >
                  <Text style={[styles.storeChipText, storeId === store.id && styles.storeChipTextActive]}>
                    {store.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}>
              <Text style={styles.cancelBtnText}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>{saving ? '登録中...' : '登録する'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Registration list */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>登録済みスタッフ（{registrations.length}名）</Text>
        {registrations.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={28} color={COLORS.borderLight} />
            <Text style={styles.emptyText}>登録済みのスタッフはいません</Text>
          </View>
        ) : (
          registrations.map((reg) => (
            <View key={reg.id} style={styles.staffCard}>
              <View style={styles.staffInfo}>
                <View style={styles.staffRow}>
                  <View style={[styles.statusIndicator, { backgroundColor: reg.is_active ? COLORS.success : COLORS.textLight }]} />
                  <Text style={styles.staffName}>{reg.name ?? '名前未設定'}</Text>
                  {!reg.is_active && (
                    <View style={styles.inactiveBadge}>
                      <Text style={styles.inactiveBadgeText}>無効</Text>
                    </View>
                  )}
                </View>
                {reg.phone && (
                  <Text style={styles.staffIdentifier}>
                    <Ionicons name="call-outline" size={12} color={COLORS.textSecondary} />
                    {' '}{reg.phone}
                  </Text>
                )}
                {reg.email && (
                  <Text style={styles.staffIdentifier}>
                    <Ionicons name="mail-outline" size={12} color={COLORS.textSecondary} />
                    {' '}{reg.email}
                  </Text>
                )}
                {reg.store_id && (
                  <Text style={styles.staffStore}>
                    <Ionicons name="location-outline" size={12} color={COLORS.textSecondary} />
                    {' '}{STORES[reg.store_id]?.name ?? reg.store_id}
                  </Text>
                )}
                <Text style={styles.staffDate}>
                  登録日: {new Date(reg.created_at).toLocaleDateString('ja-JP')}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.toggleBtn}
                onPress={() => toggleActive(reg)}
              >
                <Ionicons
                  name={reg.is_active ? 'pause-circle-outline' : 'play-circle-outline'}
                  size={24}
                  color={reg.is_active ? COLORS.warning : COLORS.success}
                />
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  descCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: COLORS.accentLight + '60', margin: 20, marginBottom: 0,
    padding: 14, borderRadius: 12,
  },
  descText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 20 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, marginHorizontal: 20, marginTop: 16,
    paddingVertical: 14, borderRadius: 14,
  },
  addBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  formCard: {
    backgroundColor: COLORS.surface, margin: 20, marginTop: 16,
    borderRadius: 14, padding: 20, gap: 16,
  },
  formTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  formField: { gap: 6 },
  formLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  required: { fontSize: 11, color: COLORS.error },
  input: {
    backgroundColor: COLORS.backgroundSoft, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10,
    backgroundColor: COLORS.backgroundSoft, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  typeChipActive: {
    backgroundColor: COLORS.accent, borderColor: COLORS.accent,
  },
  typeChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  typeChipTextActive: { color: '#FFF' },
  storeRow: { flexDirection: 'row', gap: 8 },
  storeChip: {
    paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
    backgroundColor: COLORS.backgroundSoft, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  storeChipActive: {
    backgroundColor: COLORS.accent, borderColor: COLORS.accent,
  },
  storeChipText: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary },
  storeChipTextActive: { color: '#FFF' },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12,
    backgroundColor: COLORS.backgroundSoft,
  },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  saveBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12,
    backgroundColor: COLORS.accent,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  section: { paddingHorizontal: 20, marginTop: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  emptyCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 32,
    alignItems: 'center', gap: 10,
  },
  emptyText: { fontSize: 13, color: COLORS.textLight },
  staffCard: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14,
    flexDirection: 'row', alignItems: 'center', marginBottom: 8,
  },
  staffInfo: { flex: 1, gap: 4 },
  staffRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusIndicator: { width: 8, height: 8, borderRadius: 4 },
  staffName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  inactiveBadge: {
    backgroundColor: COLORS.textLight + '30', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6,
  },
  inactiveBadgeText: { fontSize: 10, fontWeight: '600', color: COLORS.textLight },
  staffIdentifier: { fontSize: 13, color: COLORS.textSecondary },
  staffStore: { fontSize: 12, color: COLORS.textSecondary },
  staffDate: { fontSize: 11, color: COLORS.textLight },
  toggleBtn: { padding: 8 },
});
