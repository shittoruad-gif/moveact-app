import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<BookingStackParamList, 'CounselingSheet'>;

const QUESTIONS = [
  { key: 'chief_complaint', label: '現在のお悩み・症状を教えてください', placeholder: '例：肩こり、腰痛、姿勢の改善など', multiline: true },
  { key: 'duration', label: 'いつ頃からのお悩みですか？', placeholder: '例：3ヶ月前から' },
  { key: 'medical_history', label: '過去の病歴・手術歴はありますか？', placeholder: '特になければ「なし」とご記入ください', multiline: true },
  { key: 'current_medication', label: '現在服用中のお薬はありますか？', placeholder: '特になければ「なし」とご記入ください' },
  { key: 'allergies', label: 'アレルギーはありますか？', placeholder: '特になければ「なし」とご記入ください' },
  { key: 'pregnancy', label: '妊娠中または妊娠の可能性はありますか？', placeholder: 'はい / いいえ' },
  { key: 'exercise_habits', label: '運動習慣を教えてください', placeholder: '例：週2回ジム、毎朝ウォーキングなど' },
  { key: 'goals', label: '施術を通じて達成したいことを教えてください', placeholder: '例：痛みの緩和、柔軟性の向上など', multiline: true },
  { key: 'other', label: 'その他、気になることがあればご記入ください', placeholder: '自由記述', multiline: true },
];

export function CounselingSheetScreen({ route, navigation }: Props) {
  const { bookingId } = route.params;
  const { profile } = useAuthStore();
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateResponse(key: string, value: string) {
    setResponses((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    if (!profile) return;

    const filledCount = Object.values(responses).filter((v) => v.trim().length > 0).length;
    if (filledCount < 2) {
      Alert.alert('入力不足', '少なくとも2項目以上ご記入ください。');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from('counseling_sheets').insert({
        user_id: profile.id,
        booking_id: bookingId,
        status: 'completed',
        responses,
        completed_at: new Date().toISOString(),
      });

      if (error) throw error;

      Alert.alert(
        '送信完了',
        'カウンセリングシートを送信しました。ご来店をお待ちしております。',
        [{ text: 'OK', onPress: () => navigation.getParent()?.navigate('HomeTab') }],
      );
    } catch (e) {
      Alert.alert('エラー', '送信に失敗しました。もう一度お試しください。');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Ionicons name="document-text-outline" size={28} color={COLORS.accent} />
          <Text style={styles.title}>カウンセリングシート</Text>
          <Text style={styles.subtitle}>
            施術をより効果的に行うため、事前に情報をご記入ください。
          </Text>
        </View>

        {QUESTIONS.map((q) => (
          <View key={q.key} style={styles.questionItem}>
            <Text style={styles.questionLabel}>{q.label}</Text>
            <TextInput
              style={[styles.input, q.multiline && styles.inputMultiline]}
              placeholder={q.placeholder}
              placeholderTextColor={COLORS.textLight}
              value={responses[q.key] ?? ''}
              onChangeText={(v) => updateResponse(q.key, v)}
              multiline={q.multiline}
              textAlignVertical={q.multiline ? 'top' : 'center'}
            />
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={isSubmitting ? '送信中...' : 'カウンセリングシートを送信'}
          onPress={handleSubmit}
          disabled={isSubmitting}
          size="large"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 24 },
  header: { alignItems: 'center', marginBottom: 24, gap: 8 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  questionItem: { marginBottom: 20 },
  questionLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: COLORS.text,
  },
  inputMultiline: { minHeight: 80 },
  footer: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
});
