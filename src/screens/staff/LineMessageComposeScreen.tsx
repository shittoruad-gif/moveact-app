// LINE個別メッセージ送信
// スタッフが特定の顧客に対してアドホックなLINEメッセージを送る画面
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

const TEMPLATES: Array<{ title: string; body: string }> = [
  {
    title: 'お礼',
    body: '本日はご来店いただき誠にありがとうございました。\n次回のご来店もお待ちしております。',
  },
  {
    title: 'フォロー',
    body: '先日はありがとうございました。\nその後の体調はいかがでしょうか？\nご質問などあればお気軽にご連絡ください。',
  },
  {
    title: '予約確認',
    body: 'ご予約日時の確認のため、ご連絡いたしました。\nご都合はいかがでしょうか？',
  },
  {
    title: 'お誕生日',
    body: 'お誕生日おめでとうございます🎂\n素敵な一年になりますように。\n当店からささやかなプレゼントをご用意しております。',
  },
  {
    title: 'キャンペーン',
    body: '現在、◯◯キャンペーンを実施中です。\nご興味があればぜひご来店ください。',
  },
];

export function LineMessageComposeScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const customerId: string = route.params?.customerId;
  const [customer, setCustomer] = useState<any>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, line_user_id')
        .eq('id', customerId)
        .single();
      setCustomer(data);
    })();
  }, [customerId]);

  async function handleSend() {
    if (!text.trim()) {
      Alert.alert('エラー', 'メッセージを入力してください');
      return;
    }
    if (!customer?.line_user_id) {
      Alert.alert('エラー', 'この顧客はLINE連携されていません');
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-line-message', {
        body: {
          user_id: customerId,
          message_type: 'custom',
          custom_text: text,
        },
      });
      if (error) throw error;
      if ((data as any)?.ok) {
        Alert.alert('送信完了', 'LINEメッセージを送信しました', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('エラー', (data as any)?.error ?? '送信に失敗しました');
      }
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '送信に失敗しました');
    } finally {
      setSending(false);
    }
  }

  if (!customer) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <View style={styles.recipientCard}>
        <Ionicons name="person-circle" size={32} color={COLORS.accent} />
        <View>
          <Text style={styles.recipientName}>{customer.full_name}</Text>
          <View style={styles.recipientLine}>
            <Ionicons
              name={customer.line_user_id ? 'chatbubble' : 'close-circle'}
              size={12}
              color={customer.line_user_id ? '#06C755' : COLORS.error}
            />
            <Text style={[styles.recipientLineText, !customer.line_user_id && { color: COLORS.error }]}>
              {customer.line_user_id ? 'LINE連携済み' : 'LINE未連携'}
            </Text>
          </View>
        </View>
      </View>

      {!customer.line_user_id && (
        <View style={styles.warningCard}>
          <Ionicons name="warning-outline" size={18} color={COLORS.error} />
          <Text style={styles.warningText}>
            LINE未連携の顧客には送信できません。顧客側にLINE連携を促してください。
          </Text>
        </View>
      )}

      <Text style={styles.label}>テンプレート</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.templateRow}>
        {TEMPLATES.map((t) => (
          <TouchableOpacity
            key={t.title}
            style={styles.templateChip}
            onPress={() => setText(t.body)}
          >
            <Text style={styles.templateChipText}>{t.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.label}>メッセージ</Text>
      <TextInput
        style={styles.input}
        multiline
        placeholder="送信内容を入力..."
        placeholderTextColor={COLORS.textLight}
        value={text}
        onChangeText={setText}
        textAlignVertical="top"
      />
      <Text style={styles.charCount}>{text.length}文字 / 推奨500文字以内</Text>

      <TouchableOpacity
        style={[styles.sendBtn, (!customer.line_user_id || sending) && { opacity: 0.5 }]}
        onPress={handleSend}
        disabled={!customer.line_user_id || sending}
      >
        {sending ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="send" size={16} color="#FFF" />
            <Text style={styles.sendBtnText}>LINEで送信</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  recipientCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, padding: 14, borderRadius: 12, marginBottom: 16,
  },
  recipientName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  recipientLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  recipientLineText: { fontSize: 11, color: '#06C755', fontWeight: '600' },
  warningCard: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: COLORS.error + '10', padding: 12, borderRadius: 10, marginBottom: 12,
  },
  warningText: { flex: 1, fontSize: 12, color: COLORS.error, lineHeight: 17 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginTop: 10, marginBottom: 6 },
  templateRow: { gap: 6, paddingBottom: 6 },
  templateChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  templateChipText: { fontSize: 12, fontWeight: '600', color: COLORS.accent },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: COLORS.text, minHeight: 160,
  },
  charCount: { fontSize: 11, color: COLORS.textLight, marginTop: 4, textAlign: 'right' },
  sendBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#06C755', paddingVertical: 14, borderRadius: 12,
    marginTop: 20,
  },
  sendBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
