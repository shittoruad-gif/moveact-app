// 領収書発行フォーム
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useStoreSelection } from '../../stores/storeSelectionStore';

const SOURCE_TYPES = [
  { id: 'custom', label: 'その他' },
  { id: 'booking', label: '予約' },
  { id: 'walk_in', label: '手売り' },
  { id: 'ticket', label: '回数券' },
  { id: 'subscription', label: 'サブスク' },
];

const PROVISO_PRESETS = [
  '施術代として',
  '回数券代として',
  'サブスクリプション代として',
  '商品代として',
  'キャンセル料として',
];

export function ReceiptFormScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const profile = useAuthStore((s) => s.profile);
  const { selectedStore } = useStoreSelection();
  const params = route.params ?? {};

  const [customer, setCustomer] = useState<any>(null);
  const [issuedToName, setIssuedToName] = useState('');
  const [proviso, setProviso] = useState(PROVISO_PRESETS[0]);
  const [amountStr, setAmountStr] = useState(
    params.amount ? String(params.amount) : ''
  );
  const [taxStr, setTaxStr] = useState('0');
  const [sourceType, setSourceType] = useState<string>(params.sourceType ?? 'custom');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!params.customerId) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('id', params.customerId)
        .single();
      if (data) {
        setCustomer(data);
        setIssuedToName(data.full_name);
      }
    })();
  }, [params.customerId]);

  async function handleIssue() {
    const amount = parseInt(amountStr, 10) || 0;
    const tax = parseInt(taxStr, 10) || 0;
    if (!issuedToName.trim()) {
      Alert.alert('エラー', '宛名を入力してください');
      return;
    }
    if (amount <= 0) {
      Alert.alert('エラー', '金額を正しく入力してください');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('receipts')
        .insert({
          issued_to_name: issuedToName.trim(),
          proviso: proviso.trim() || null,
          amount,
          tax,
          source_type: sourceType,
          source_id: params.sourceId ?? null,
          customer_id: customer?.id ?? params.customerId ?? null,
          store_id: selectedStore,
          issued_by: profile?.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      navigation.replace('ReceiptView', { receiptId: data.id });
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '発行に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.label}>宛名 *</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder="例: 山田 太郎 様"
          placeholderTextColor={COLORS.textLight}
          value={issuedToName}
          onChangeText={setIssuedToName}
        />
        <TouchableOpacity
          style={styles.inlineBtn}
          onPress={() => setIssuedToName((prev) => prev.includes('様') ? prev : prev + ' 様')}
        >
          <Text style={styles.inlineBtnText}>様 追加</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.label}>但し書き</Text>
      <TextInput
        style={styles.input}
        placeholder="施術代として"
        placeholderTextColor={COLORS.textLight}
        value={proviso}
        onChangeText={setProviso}
      />
      <View style={styles.presetRow}>
        {PROVISO_PRESETS.map((p) => (
          <TouchableOpacity key={p} style={styles.presetChip} onPress={() => setProviso(p)}>
            <Text style={styles.presetText}>{p}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>金額（税込）*</Text>
      <TextInput
        style={[styles.input, { fontSize: 20, fontWeight: '700' }]}
        placeholder="0"
        placeholderTextColor={COLORS.textLight}
        value={amountStr}
        onChangeText={(v) => setAmountStr(v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>内消費税</Text>
      <TextInput
        style={styles.input}
        placeholder="0"
        placeholderTextColor={COLORS.textLight}
        value={taxStr}
        onChangeText={(v) => setTaxStr(v.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>種別</Text>
      <View style={styles.sourceRow}>
        {SOURCE_TYPES.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.sourceChip, sourceType === s.id && styles.sourceChipActive]}
            onPress={() => setSourceType(s.id)}
          >
            <Text style={[styles.sourceText, sourceType === s.id && styles.sourceTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.5 }]}
        onPress={handleIssue}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="receipt" size={16} color="#FFF" />
            <Text style={styles.saveBtnText}>発行する</Text>
          </>
        )}
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginTop: 16, marginBottom: 6 },
  inputRow: { flexDirection: 'row', gap: 6 },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: COLORS.text,
  },
  inlineBtn: {
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: COLORS.backgroundSoft, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  inlineBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  presetChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    backgroundColor: COLORS.backgroundSoft,
  },
  presetText: { fontSize: 10, color: COLORS.textSecondary },
  sourceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  sourceChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  sourceChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  sourceText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  sourceTextActive: { color: '#FFF' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: 12,
    marginTop: 24,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
