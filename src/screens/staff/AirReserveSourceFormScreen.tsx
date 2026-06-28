// Airリザーブ ソース登録・編集
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

export function AirReserveSourceFormScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const sourceId: string | undefined = route.params?.sourceId;
  const isEdit = !!sourceId;

  const [label, setLabel] = useState('');
  const [storeId, setStoreId] = useState<string>('kanamitsu');
  const [staffId, setStaffId] = useState<string | null>(null);
  const [icalUrl, setIcalUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [staffOptions, setStaffOptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: staff } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('role', ['staff', 'admin'])
        .order('full_name');
      setStaffOptions(staff ?? []);

      if (isEdit) {
        const { data } = await supabase
          .from('airreserve_sources').select('*').eq('id', sourceId).single();
        if (data) {
          setLabel(data.label);
          setStoreId(data.store_id);
          setStaffId(data.staff_id);
          setIcalUrl(data.ical_url);
          setIsActive(data.is_active);
        }
      }
      setLoading(false);
    })();
  }, [sourceId, isEdit]);

  async function handleSave() {
    if (!label.trim()) {
      Alert.alert('エラー', 'ラベルを入力してください');
      return;
    }
    if (!icalUrl.trim() || !icalUrl.startsWith('http')) {
      Alert.alert('エラー', 'iCal URLを正しく入力してください');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        label: label.trim(),
        store_id: storeId,
        staff_id: staffId,
        ical_url: icalUrl.trim(),
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };
      if (isEdit) {
        const { error } = await supabase
          .from('airreserve_sources').update(payload).eq('id', sourceId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('airreserve_sources').insert(payload);
        if (error) throw error;
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.label}>ラベル *</Text>
      <TextInput
        style={styles.input}
        placeholder="例: 金光店 / 中野"
        placeholderTextColor={COLORS.textLight}
        value={label}
        onChangeText={setLabel}
      />

      <Text style={styles.label}>対象店舗 *</Text>
      <View style={styles.row}>
        {[
          { id: 'kanamitsu', label: STORES.kanamitsu.name },
          { id: 'tamashima', label: STORES.tamashima.name },
        ].map((s) => (
          <TouchableOpacity
            key={s.id}
            style={[styles.chip, storeId === s.id && styles.chipActive]}
            onPress={() => setStoreId(s.id)}
          >
            <Text style={[styles.chipText, storeId === s.id && styles.chipTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>担当スタッフ（任意）</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.chip, !staffId && styles.chipActive]}
          onPress={() => setStaffId(null)}
        >
          <Text style={[styles.chipText, !staffId && styles.chipTextActive]}>指定なし</Text>
        </TouchableOpacity>
        {staffOptions.map((st) => (
          <TouchableOpacity
            key={st.id}
            style={[styles.chip, staffId === st.id && styles.chipActive]}
            onPress={() => setStaffId(st.id)}
          >
            <Text style={[styles.chipText, staffId === st.id && styles.chipTextActive]}>
              {st.full_name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>iCal URL *</Text>
      <TextInput
        style={[styles.input, { fontSize: 11 }]}
        placeholder="https://airrsv.net/.../ical"
        placeholderTextColor={COLORS.textLight}
        value={icalUrl}
        onChangeText={setIcalUrl}
        autoCapitalize="none"
        autoCorrect={false}
        multiline
      />
      <Text style={styles.helpText}>
        Airリザーブ管理画面 → カレンダー → iCal形式で出力 からURLを取得してください
      </Text>

      <View style={styles.toggleRow}>
        <View>
          <Text style={styles.toggleLabel}>有効化</Text>
          <Text style={styles.toggleSub}>定期同期の対象にします</Text>
        </View>
        <Switch
          value={isActive}
          onValueChange={setIsActive}
          trackColor={{ true: COLORS.success, false: COLORS.border }}
          thumbColor="#FFF"
        />
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.5 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="save" size={16} color="#FFF" />
            <Text style={styles.saveBtnText}>{isEdit ? '更新' : '登録'}</Text>
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
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 13, color: COLORS.text,
  },
  helpText: { fontSize: 10, color: COLORS.textLight, marginTop: 4 },
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive: { color: '#FFF' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, padding: 14, borderRadius: 10, marginTop: 14,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  toggleSub: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: 12,
    marginTop: 24,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
