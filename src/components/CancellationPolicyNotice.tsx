// キャンセルポリシーの共通表示コンポーネント
// =====================================================
// 予約フロー各所で同じ規約を統一表示する（出典は constants.CANCELLATION_POLICY）。
// variant:
//   'banner'  … 当日キャンセル規約を強調した目立つバナー（予約開始/確認画面の上部向け）
//   'detail'  … 箇条書きの詳細（確認画面・規約セクション向け）
// =====================================================
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, CANCELLATION_POLICY } from '../lib/constants';

export function CancellationPolicyNotice({ variant = 'detail' }: { variant?: 'banner' | 'detail' }) {
  if (variant === 'banner') {
    return (
      <View style={styles.banner}>
        <Ionicons name="alert-circle" size={18} color={COLORS.error} />
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>{CANCELLATION_POLICY.title}</Text>
          <Text style={styles.bannerText}>{CANCELLATION_POLICY.headline}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.detail}>
      <View style={styles.detailHeader}>
        <Ionicons name="information-circle-outline" size={16} color={COLORS.text} />
        <Text style={styles.detailTitle}>{CANCELLATION_POLICY.title}</Text>
      </View>
      <View style={styles.headlineBox}>
        <Text style={styles.headlineText}>{CANCELLATION_POLICY.headline}</Text>
      </View>
      {CANCELLATION_POLICY.lines.map((line, i) => (
        <View key={i} style={styles.lineRow}>
          <Text style={styles.bullet}>・</Text>
          <Text style={styles.lineText}>{line}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#FBEDED', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: COLORS.error + '40',
  },
  bannerTitle: { fontSize: 12, fontWeight: '700', color: COLORS.error, marginBottom: 3 },
  bannerText: { fontSize: 13, color: COLORS.text, fontWeight: '600', lineHeight: 19 },
  detail: {
    backgroundColor: COLORS.surfaceWarm, borderRadius: 12, padding: 16,
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  detailTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  headlineBox: {
    backgroundColor: '#FBEDED', borderRadius: 8, padding: 10, marginBottom: 10,
  },
  headlineText: { fontSize: 12, fontWeight: '700', color: COLORS.error, lineHeight: 18 },
  lineRow: { flexDirection: 'row', marginTop: 4 },
  bullet: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  lineText: { flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
});
