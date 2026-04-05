import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Linking, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { useAuthStore } from '../../stores/authStore';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { supabase } from '../../lib/supabase';

// 新規予約用URL（後日設定可能）
const NEW_CUSTOMER_BOOKING_URL = '';

export function ReferralScreen() {
  const { profile } = useAuthStore();
  const { selectedStore } = useStoreSelection();
  const [isSending, setIsSending] = useState(false);

  const storeName = STORES[selectedStore].name;
  const referrerName = profile?.full_name ?? '';

  // 紹介メッセージ生成
  const generateMessage = useCallback(() => {
    const bookingUrl = NEW_CUSTOMER_BOOKING_URL || 'https://moveact.jp/booking';
    return [
      `${referrerName}さんからのご紹介です`,
      '',
      `Moveact ${storeName}のご予約はこちらから:`,
      bookingUrl,
      '',
      '整体・美容鍼・ピラティスなど、',
      'お体のお悩みに合わせた施術をご提供しています。',
      '',
      '初回の方はカウンセリングシートの事前記入で',
      '当日スムーズにご案内できます。',
    ].join('\n');
  }, [referrerName, storeName]);

  // LINEで送る
  async function handleShareViaLine() {
    setIsSending(true);
    try {
      // 紹介レコードを作成
      if (profile) {
        await supabase.from('referrals').insert({
          referrer_user_id: profile.id,
          status: 'sent',
          referral_code: `REF-${profile.id.slice(0, 8).toUpperCase()}`,
        });
      }

      const message = encodeURIComponent(generateMessage());
      const lineUrl = `https://line.me/R/share?text=${message}`;

      const canOpen = await Linking.canOpenURL(lineUrl);
      if (canOpen) {
        await Linking.openURL(lineUrl);
      } else {
        // LINEがインストールされていない場合は通常のShare
        await Share.share({ message: generateMessage() });
      }
    } catch (e) {
      Alert.alert('エラー', '送信に失敗しました');
    } finally {
      setIsSending(false);
    }
  }

  // 通常のシェア
  async function handleShare() {
    try {
      if (profile) {
        await supabase.from('referrals').insert({
          referrer_user_id: profile.id,
          status: 'sent',
          referral_code: `REF-${profile.id.slice(0, 8).toUpperCase()}`,
        });
      }
      await Share.share({ message: generateMessage() });
    } catch (e) {
      // cancelled
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="gift" size={36} color={COLORS.accent} />
        </View>
        <Text style={styles.title}>お知り合いをご紹介</Text>
        <Text style={styles.subtitle}>
          お知り合いにMoveactをご紹介ください。{'\n'}
          ご紹介いただいた方のご予約が完了すると、{'\n'}
          紹介クーポンをプレゼントいたします。
        </Text>
      </View>

      {/* How it works */}
      <View style={styles.stepsCard}>
        <Text style={styles.stepsTitle}>ご紹介の流れ</Text>
        <View style={styles.step}>
          <View style={styles.stepNum}><Text style={styles.stepNumText}>1</Text></View>
          <Text style={styles.stepText}>下のボタンからLINEで予約リンクを送信</Text>
        </View>
        <View style={styles.step}>
          <View style={styles.stepNum}><Text style={styles.stepNumText}>2</Text></View>
          <Text style={styles.stepText}>お知り合いがリンクから初回予約を完了</Text>
        </View>
        <View style={styles.step}>
          <View style={styles.stepNum}><Text style={styles.stepNumText}>3</Text></View>
          <Text style={styles.stepText}>紹介クーポンが届きます</Text>
        </View>
      </View>

      {/* Share buttons */}
      <View style={styles.shareSection}>
        <TouchableOpacity style={styles.lineButton} onPress={handleShareViaLine} disabled={isSending}>
          <Ionicons name="chatbubble" size={20} color="#FFF" />
          <Text style={styles.lineButtonText}>LINEで紹介する</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.otherShareButton} onPress={handleShare}>
          <Ionicons name="share-outline" size={18} color={COLORS.textSecondary} />
          <Text style={styles.otherShareText}>その他の方法で共有</Text>
        </TouchableOpacity>
      </View>

      {/* Preview */}
      <View style={styles.previewCard}>
        <Text style={styles.previewTitle}>送信されるメッセージ</Text>
        <Text style={styles.previewText}>{generateMessage()}</Text>
      </View>

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20 },
  header: { alignItems: 'center', marginBottom: 24, gap: 10 },
  headerIcon: {
    width: 72, height: 72, borderRadius: 24,
    backgroundColor: COLORS.accentLight,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  subtitle: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
  stepsCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    gap: 14,
  },
  stepsTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepNum: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center',
  },
  stepNumText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  stepText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 18 },
  shareSection: { gap: 12, marginBottom: 24 },
  lineButton: {
    backgroundColor: '#06C755',
    borderRadius: 14,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  lineButtonText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  otherShareButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  otherShareText: { fontSize: 13, color: COLORS.textSecondary },
  previewCard: {
    backgroundColor: COLORS.surfaceWarm,
    borderRadius: 12,
    padding: 16,
  },
  previewTitle: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 8 },
  previewText: { fontSize: 12, color: COLORS.textLight, lineHeight: 18 },
});
