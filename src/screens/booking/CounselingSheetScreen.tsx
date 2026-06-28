import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<BookingStackParamList, 'CounselingSheet'>;

type Question =
  | {
      key: string;
      type?: 'text';
      label: string;
      placeholder?: string;
      multiline?: boolean;
      helperText?: string;
    }
  | {
      key: string;
      type: 'choice';
      label: string;
      helperText?: string;
      options: { value: string; label: string; description?: string; icon?: keyof typeof Ionicons.glyphMap }[];
    };

const QUESTIONS: Question[] = [
  {
    key: 'chief_complaint',
    label: '現在のお悩み・症状を教えてください',
    placeholder: '例：肩こり、腰痛、姿勢の改善など',
    multiline: true,
  },
  {
    key: 'duration',
    label: 'いつ頃からのお悩みですか？',
    placeholder: '例：3ヶ月前から',
  },
  {
    key: 'medical_history',
    label: '過去の病歴・手術歴はありますか？',
    placeholder: '特になければ「なし」とご記入ください',
    multiline: true,
  },
  {
    key: 'current_medication',
    label: '現在服用中のお薬はありますか？',
    placeholder: '特になければ「なし」とご記入ください',
  },
  {
    key: 'allergies',
    label: 'アレルギーはありますか？',
    placeholder: '特になければ「なし」とご記入ください',
  },
  {
    key: 'pregnancy',
    label: '妊娠中または妊娠の可能性はありますか？',
    placeholder: 'はい / いいえ',
  },
  {
    key: 'exercise_habits',
    label: '運動習慣を教えてください',
    placeholder: '例：週2回ジム、毎朝ウォーキングなど',
  },
  {
    key: 'goals',
    label: '施術を通じて達成したいことを教えてください',
    placeholder: '例：痛みの緩和、柔軟性の向上など',
    multiline: true,
  },
  {
    key: 'communication_preference',
    type: 'choice',
    label: '施術中のコミュニケーションはいかがしましょうか？',
    helperText: '当日の気分にあわせて、施術者があなたに合った距離感でお過ごしいただけます。いつでも変更OKです。',
    options: [
      {
        value: 'talk_a_lot',
        label: 'しっかり会話を楽しみたい',
        description: '施術中も気軽にお話ししたい方',
        icon: 'chatbubbles',
      },
      {
        value: 'talk_some',
        label: 'ほどよく会話したい',
        description: '必要なやりとりや軽い雑談はOK',
        icon: 'chatbox-ellipses-outline',
      },
      {
        value: 'quiet',
        label: 'リラックスしたいので静かに過ごしたい',
        description: '施術説明以外は最小限で',
        icon: 'leaf-outline',
      },
      {
        value: 'sleep_ok',
        label: '寝てしまっても大丈夫な雰囲気で',
        description: '眠ってしまっても起こさずそっと',
        icon: 'moon-outline',
      },
      {
        value: 'omakase',
        label: 'おまかせ / その日の気分で',
        description: '当日の体調・気分にあわせて',
        icon: 'sparkles-outline',
      },
    ],
  },
  {
    key: 'other',
    label: 'その他、気になることがあればご記入ください',
    placeholder: '自由記述',
    multiline: true,
  },
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
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Ionicons name="document-text-outline" size={28} color={COLORS.accent} />
          <Text style={styles.title}>カウンセリングシート</Text>
          <Text style={styles.subtitle}>
            施術をより効果的に行うため、事前に情報をご記入ください。
          </Text>
        </View>

        {QUESTIONS.map((q) => {
          if (q.type === 'choice') {
            const selected = responses[q.key];
            return (
              <View key={q.key} style={styles.questionItem}>
                <Text style={styles.questionLabel}>{q.label}</Text>
                {q.helperText && <Text style={styles.helperText}>{q.helperText}</Text>}
                <View style={styles.choiceList}>
                  {q.options.map((opt) => {
                    const isSelected = selected === opt.value;
                    return (
                      <TouchableOpacity
                        key={opt.value}
                        activeOpacity={0.8}
                        style={[styles.choiceCard, isSelected && styles.choiceCardSelected]}
                        onPress={() => updateResponse(q.key, opt.value)}
                      >
                        {opt.icon && (
                          <View style={[styles.choiceIcon, isSelected && styles.choiceIconSelected]}>
                            <Ionicons
                              name={opt.icon}
                              size={18}
                              color={isSelected ? '#FFF' : COLORS.accent}
                            />
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.choiceLabel, isSelected && styles.choiceLabelSelected]}>
                            {opt.label}
                          </Text>
                          {opt.description && (
                            <Text style={[styles.choiceDesc, isSelected && styles.choiceDescSelected]}>
                              {opt.description}
                            </Text>
                          )}
                        </View>
                        <Ionicons
                          name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                          size={22}
                          color={isSelected ? COLORS.accent : COLORS.borderLight}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            );
          }

          return (
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
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={isSubmitting ? '送信中...' : 'カウンセリングシートを送信'}
          onPress={handleSubmit}
          disabled={isSubmitting}
          size="large"
        />
      </View>
    </KeyboardAvoidingView>
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
  helperText: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17, marginBottom: 10 },
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
  choiceList: { gap: 8 },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  choiceCardSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent + '0C',
  },
  choiceIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.accent + '15',
  },
  choiceIconSelected: {
    backgroundColor: COLORS.accent,
  },
  choiceLabel: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  choiceLabelSelected: { color: COLORS.accent },
  choiceDesc: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, lineHeight: 15 },
  choiceDescSelected: { color: COLORS.textSecondary },
  footer: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
});
