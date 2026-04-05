import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import type { Coupon } from '../../types/database';

const TYPE_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  birthday: { label: 'お誕生日クーポン', icon: 'gift-outline', color: COLORS.accentPink },
  referral: { label: '紹介クーポン', icon: 'people-outline', color: COLORS.success },
  campaign: { label: 'キャンペーン', icon: 'megaphone-outline', color: COLORS.accent },
};

export function CouponListScreen() {
  const { profile } = useAuthStore();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchCoupons(); }, []);

  async function fetchCoupons() {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('coupons')
      .select('*')
      .eq('user_id', profile.id)
      .order('valid_until', { ascending: true });
    setCoupons((data as Coupon[]) ?? []);
    setLoading(false);
  }

  function renderCoupon({ item }: { item: Coupon }) {
    const typeInfo = TYPE_LABELS[item.type] ?? TYPE_LABELS.campaign;
    const isExpired = new Date(item.valid_until) < new Date();
    const isUsable = !item.is_used && !isExpired;
    const validUntil = new Date(item.valid_until).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    return (
      <View style={[styles.couponCard, !isUsable && styles.couponCardUsed]}>
        {/* Left accent */}
        <View style={[styles.couponAccent, { backgroundColor: isUsable ? typeInfo.color : COLORS.textLight }]} />

        <View style={styles.couponContent}>
          <View style={styles.couponHeader}>
            <Ionicons name={typeInfo.icon as any} size={16} color={isUsable ? typeInfo.color : COLORS.textLight} />
            <Text style={[styles.couponType, isUsable ? { color: typeInfo.color } : { color: COLORS.textLight }]}>
              {typeInfo.label}
            </Text>
            {item.is_used && (
              <View style={styles.usedBadge}><Text style={styles.usedBadgeText}>使用済</Text></View>
            )}
            {isExpired && !item.is_used && (
              <View style={styles.expiredBadge}><Text style={styles.expiredBadgeText}>期限切れ</Text></View>
            )}
          </View>

          <Text style={[styles.couponTitle, !isUsable && { color: COLORS.textLight }]}>{item.title}</Text>

          {item.discount_amount && (
            <Text style={[styles.discountText, !isUsable && { color: COLORS.textLight }]}>
              ¥{item.discount_amount.toLocaleString()} OFF
            </Text>
          )}
          {item.discount_percent && (
            <Text style={[styles.discountText, !isUsable && { color: COLORS.textLight }]}>
              {item.discount_percent}% OFF
            </Text>
          )}

          {item.description && (
            <Text style={styles.couponDesc}>{item.description}</Text>
          )}

          <Text style={styles.validUntil}>有効期限: {validUntil}まで</Text>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      data={coupons}
      keyExtractor={(item) => item.id}
      renderItem={renderCoupon}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchCoupons} tintColor={COLORS.accent} />}
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Ionicons name="ticket-outline" size={40} color={COLORS.borderLight} />
            <Text style={styles.emptyText}>クーポンはありません</Text>
            <Text style={styles.emptySubtext}>お誕生月にはクーポンが届きます</Text>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 32 },
  couponCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    flexDirection: 'row',
    overflow: 'hidden',
    marginBottom: 12,
  },
  couponCardUsed: { opacity: 0.6 },
  couponAccent: { width: 5 },
  couponContent: { flex: 1, padding: 16, gap: 6 },
  couponHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  couponType: { fontSize: 11, fontWeight: '600' },
  usedBadge: { backgroundColor: COLORS.textLight + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  usedBadgeText: { fontSize: 10, fontWeight: '600', color: COLORS.textLight },
  expiredBadge: { backgroundColor: COLORS.error + '20', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  expiredBadgeText: { fontSize: 10, fontWeight: '600', color: COLORS.error },
  couponTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  discountText: { fontSize: 20, fontWeight: '800', color: COLORS.accent },
  couponDesc: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  validUntil: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },
  emptySubtext: { fontSize: 12, color: COLORS.textLight },
});
