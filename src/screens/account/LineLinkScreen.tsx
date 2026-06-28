import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';

// LIFF URL configured in LINE Developers Console.
// The LIFF page at this URL handles liff.init() + liff.login() then
// POSTs { token, id_token } to our verify-line-link Edge Function.
// Set this to the actual LIFF URL once the LIFF app is published.
const LIFF_URL = process.env.EXPO_PUBLIC_LINE_LIFF_URL ?? '';

export function LineLinkScreen() {
  const { profile, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);

  const isLinked = !!profile?.line_user_id;

  async function handleStartLink() {
    if (!profile) return;
    if (!LIFF_URL) {
      Alert.alert(
        'LIFF未設定',
        'LINE連携機能は現在準備中です。\nしばらくお待ちください。'
      );
      return;
    }
    setLoading(true);
    try {
      // Generate link token
      const tokenStr = generateToken();
      const { error } = await supabase.from('line_link_tokens').insert({
        user_id: profile.id,
        token: tokenStr,
      });
      if (error) throw error;

      // Open LIFF with token as query param
      const url = `${LIFF_URL}?token=${encodeURIComponent(tokenStr)}`;
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('エラー', 'LINEアプリを開けませんでした');
        return;
      }
      await Linking.openURL(url);
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '連携の開始に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlink() {
    if (!profile) return;
    Alert.alert(
      'LINE連携を解除',
      'LINE連携を解除しますか？\n予約日時の通知が届かなくなります。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '解除',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('profiles')
              .update({ line_user_id: null })
              .eq('id', profile.id);
            if (error) {
              Alert.alert('エラー', '解除に失敗しました');
              return;
            }
            await refreshProfile?.();
            Alert.alert('完了', 'LINE連携を解除しました');
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scroll}>
      <View style={styles.iconCircle}>
        <Ionicons name="chatbubble-ellipses" size={36} color="#06C755" />
      </View>
      <Text style={styles.title}>LINE連携</Text>
      <Text style={styles.subtitle}>
        公式LINEと連携すると、予約日時やお知らせがLINEに届きます。
      </Text>

      {/* Status card */}
      <View style={[styles.statusCard, isLinked ? styles.statusCardLinked : styles.statusCardUnlinked]}>
        <Ionicons
          name={isLinked ? 'checkmark-circle' : 'information-circle-outline'}
          size={22}
          color={isLinked ? '#06C755' : COLORS.textSecondary}
        />
        <Text style={[styles.statusText, isLinked && { color: '#06C755' }]}>
          {isLinked ? 'LINE連携済み' : '未連携'}
        </Text>
      </View>

      {/* Benefits */}
      <View style={styles.benefitsCard}>
        <Text style={styles.benefitsTitle}>LINE連携でできること</Text>
        <Benefit icon="calendar-outline" text="スタッフが次回予約を取った際にLINEで通知" />
        <Benefit icon="notifications-outline" text="予約日の朝にリマインド" />
        <Benefit icon="gift-outline" text="キャンペーンやお得な情報" />
      </View>

      {/* Actions */}
      {isLinked ? (
        <TouchableOpacity style={styles.unlinkBtn} onPress={handleUnlink}>
          <Text style={styles.unlinkBtnText}>連携を解除する</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.linkBtn, loading && { opacity: 0.6 }]}
          onPress={handleStartLink}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="link" size={18} color="#FFF" />
              <Text style={styles.linkBtnText}>LINEと連携する</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <Text style={styles.note}>
        ※ 連携にはMoveact公式LINEを友だち追加している必要があります。{'\n'}
        ※ 連携はいつでも解除できます。
      </Text>
    </ScrollView>
  );
}

function Benefit({ icon, text }: { icon: any; text: string }) {
  return (
    <View style={styles.benefitRow}>
      <Ionicons name={icon} size={16} color={COLORS.accent} />
      <Text style={styles.benefitText}>{text}</Text>
    </View>
  );
}

function generateToken(): string {
  // 32-byte hex-like random string (generated via crypto if available, fallback to Math.random)
  const bytes = new Uint8Array(24);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 24, alignItems: 'center' },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#06C75520', justifyContent: 'center', alignItems: 'center', marginTop: 16,
  },
  title: { fontSize: 22, fontWeight: '700', color: COLORS.text, marginTop: 16 },
  subtitle: {
    fontSize: 13, color: COLORS.textSecondary, textAlign: 'center',
    marginTop: 8, lineHeight: 20, paddingHorizontal: 8,
  },
  statusCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, marginTop: 20,
  },
  statusCardLinked: { backgroundColor: '#06C75515' },
  statusCardUnlinked: { backgroundColor: COLORS.backgroundSoft },
  statusText: { fontSize: 14, fontWeight: '600', color: COLORS.textSecondary },
  benefitsCard: {
    width: '100%', backgroundColor: COLORS.surface, borderRadius: 16,
    padding: 20, marginTop: 24, gap: 12,
  },
  benefitsTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  benefitText: { fontSize: 13, color: COLORS.text, flex: 1 },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#06C755', paddingVertical: 16, borderRadius: 28,
    width: '100%', marginTop: 28,
  },
  linkBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  unlinkBtn: {
    paddingVertical: 14, borderRadius: 28, width: '100%', marginTop: 28,
    borderWidth: 1, borderColor: COLORS.error,
    alignItems: 'center',
  },
  unlinkBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.error },
  note: {
    fontSize: 11, color: COLORS.textLight, textAlign: 'center',
    marginTop: 20, lineHeight: 18,
  },
});
