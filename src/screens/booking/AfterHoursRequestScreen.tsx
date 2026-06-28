// 営業時間外リクエスト
// 9:00〜21:00以外の時間帯に施術を希望する場合に送信するフォーム
import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingStackParamList } from '../../types/navigation';
import type { StoreId } from '../../types/database';

type Props = NativeStackScreenProps<BookingStackParamList, 'AfterHoursRequest'>;

const STORE_LIST: { id: StoreId; name: string }[] = [
  { id: 'tamashima', name: STORES.tamashima.name },
  { id: 'kanamitsu', name: STORES.kanamitsu.name },
];

export function AfterHoursRequestScreen({ route, navigation }: Props) {
  const { profile } = useAuthStore();
  const { selectedStore } = useStoreSelection();
  const initStore = route.params?.storeId ?? selectedStore ?? 'tamashima';

  const [storeId, setStoreId] = useState<StoreId>(initStore);
  const [dateStr, setDateStr] = useState('');   // YYYY/MM/DD形式で入力
  const [timeHour, setTimeHour] = useState('');
  const [timeMinute, setTimeMinute] = useState('');
  const [menuName, setMenuName] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!dateStr.trim()) {
      Alert.alert('エラー', '希望日を入力してください（例：2026/07/01）');
      return;
    }
    const hh = parseInt(timeHour, 10);
    const mm = parseInt(timeMinute, 10);
    if (isNaN(hh) || hh < 0 || hh > 23 || isNaN(mm) || mm < 0 || mm > 59) {
      Alert.alert('エラー', '時間を正しく入力してください（例：22時00分）');
      return;
    }
    const requestedTime = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    if (hh >= 9 && hh < 21) {
      Alert.alert(
        '確認',
        `${requestedTime}は通常の営業時間内（9:00〜21:00）です。通常の予約をご利用ください。`,
        [
          { text: 'キャンセル', style: 'cancel' },
          { text: '続けて送信', onPress: () => doSubmit(requestedTime) },
        ],
      );
      return;
    }
    doSubmit(requestedTime);
  };

  const doSubmit = async (requestedTime: string) => {
    if (!profile?.id) {
      Alert.alert('エラー', 'ログインが必要です');
      return;
    }
    setSubmitting(true);
    // YYYY/MM/DD → YYYY-MM-DD
    const isoDate = dateStr.replace(/\//g, '-').replace(/(\d+)-(\d+)-(\d+)/, (_, y, m, d) =>
      `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
    const { error } = await supabase.from('after_hours_requests').insert({
      user_id: profile.id,
      store_id: storeId,
      requested_date: isoDate,
      requested_time: requestedTime,
      menu_name: menuName.trim() || null,
      message: message.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      Alert.alert('エラー', '送信に失敗しました。再度お試しください。');
      return;
    }
    Alert.alert(
      '送信完了',
      'リクエストを受け付けました。スタッフより折り返しご連絡します。',
      [{ text: 'OK', onPress: () => navigation.goBack() }],
    );
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <Ionicons name="moon-outline" size={24} color={COLORS.primary} />
        <Text style={styles.headerTitle}>営業時間外リクエスト</Text>
      </View>
      <Text style={styles.desc}>
        通常営業時間（9:00〜21:00）以外にご希望の場合、こちらからリクエストをお送りください。
        スタッフより折り返しご連絡します。
      </Text>

      {/* 店舗選択 */}
      <Text style={styles.label}>店舗</Text>
      <View style={styles.storeRow}>
        {STORE_LIST.map(s => (
          <TouchableOpacity
            key={s.id}
            style={[styles.storeBtn, storeId === s.id && styles.storeBtnActive]}
            onPress={() => setStoreId(s.id)}
          >
            <Text style={[styles.storeBtnText, storeId === s.id && styles.storeBtnTextActive]}>
              {s.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 日付 */}
      <Text style={styles.label}>希望日</Text>
      <TextInput
        style={styles.textInput}
        placeholder="例：2026/07/15"
        keyboardType="numbers-and-punctuation"
        value={dateStr}
        onChangeText={setDateStr}
        maxLength={10}
      />

      {/* 時間 */}
      <Text style={styles.label}>希望時間</Text>
      <View style={styles.timeRow}>
        <TextInput
          style={styles.timeInput}
          placeholder="22"
          keyboardType="number-pad"
          maxLength={2}
          value={timeHour}
          onChangeText={setTimeHour}
        />
        <Text style={styles.timeSep}>時</Text>
        <TextInput
          style={styles.timeInput}
          placeholder="00"
          keyboardType="number-pad"
          maxLength={2}
          value={timeMinute}
          onChangeText={setTimeMinute}
        />
        <Text style={styles.timeSep}>分</Text>
      </View>

      {/* 希望メニュー */}
      <Text style={styles.label}>希望メニュー（任意）</Text>
      <TextInput
        style={styles.textInput}
        placeholder="例：整体60分、美容鍼など"
        value={menuName}
        onChangeText={setMenuName}
      />

      {/* 備考 */}
      <Text style={styles.label}>備考（任意）</Text>
      <TextInput
        style={[styles.textInput, styles.textarea]}
        placeholder="ご事情や連絡先など"
        multiline
        numberOfLines={3}
        value={message}
        onChangeText={setMessage}
      />

      <View style={styles.note}>
        <Ionicons name="information-circle-outline" size={16} color="#888" />
        <Text style={styles.noteText}>
          リクエストはスタッフの予定により対応できない場合がございます。
          ご了承ください。
        </Text>
      </View>

      <Button
        title="リクエストを送信する"
        onPress={handleSubmit}
        loading={submitting}
        style={styles.submitBtn}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, paddingBottom: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  desc: { fontSize: 13, color: '#666', lineHeight: 20, paddingHorizontal: 16, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginHorizontal: 16, marginTop: 12, marginBottom: 4 },
  storeRow: { flexDirection: 'row', gap: 8, marginHorizontal: 16 },
  storeBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', alignItems: 'center' },
  storeBtnActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' },
  storeBtnText: { fontSize: 14, color: '#666' },
  storeBtnTextActive: { color: COLORS.primary, fontWeight: '600' },
  datePicker: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, padding: 12, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  dateText: { fontSize: 15, color: COLORS.text },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginHorizontal: 16 },
  timeInput: { width: 56, padding: 10, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, backgroundColor: '#fff', textAlign: 'center', fontSize: 18, fontWeight: '600' },
  timeSep: { fontSize: 16, color: '#555' },
  textInput: { marginHorizontal: 16, padding: 12, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', fontSize: 14 },
  textarea: { height: 80, textAlignVertical: 'top' },
  note: { flexDirection: 'row', gap: 6, marginHorizontal: 16, marginTop: 12, padding: 10, backgroundColor: '#f0f0f0', borderRadius: 8 },
  noteText: { flex: 1, fontSize: 12, color: '#666', lineHeight: 18 },
  submitBtn: { margin: 16, marginTop: 20 },
});
