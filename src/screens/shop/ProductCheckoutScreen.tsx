// 商品注文画面（店頭受取・店頭支払い）
// ProductDetailScreen の「購入する」ボタンから遷移してくる。
// - 数量を選択
// - クーポンを選択して割引を適用
// - 「注文を確定する」→ Edge Function (create-in-store-order) で注文作成
//   お支払い・商品受け取りは店舗で行う（アプリ内決済はなし）
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image,
  ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { safeErrorMessage } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ShopStackParamList } from '../../types/navigation';
import type { Product, Coupon, StoreId } from '../../types/database';

type Props = NativeStackScreenProps<ShopStackParamList, 'ProductCheckout'>;

export function ProductCheckoutScreen({ route, navigation }: Props) {
  const { productId, quantity: initialQty = 1 } = route.params;
  const { profile } = useAuthStore();
  const selectedStore = useStoreSelection((s: { selectedStore: StoreId }) => s.selectedStore);

  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(initialQty);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // 商品取得
      const { data: p } = await supabase
        .from('products')
        .select('*, images:product_images(id, image_url, sort_order)')
        .eq('id', productId)
        .single();
      setProduct(p as Product);

      // ユーザーのクーポン取得（未使用・期限内・物販適用可）
      if (profile) {
        const nowIso = new Date().toISOString();
        const { data: cps } = await supabase
          .from('coupons')
          .select('*')
          .eq('user_id', profile.id)
          .eq('is_used', false)
          .lte('valid_from', nowIso)
          .gte('valid_until', nowIso)
          .in('applicable_to', ['all', 'shop'])
          .order('valid_until', { ascending: true });
        setCoupons((cps ?? []) as Coupon[]);
      }

      setLoading(false);
    })();
  }, [productId, profile]);

  if (loading || !product) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  const image = product.images?.sort((a, b) => a.sort_order - b.sort_order)[0]?.image_url;
  const subtotal = product.price * quantity;

  const selectedCoupon = coupons.find((c) => c.id === selectedCouponId) ?? null;
  const discount = calcDiscount(selectedCoupon, subtotal);
  const total = Math.max(1, subtotal - discount);

  const stockIssue = product.available_in_store && product.stock_quantity < quantity;

  function handleConfirm() {
    if (!profile) {
      Alert.alert('エラー', 'ログインが必要です');
      return;
    }
    if (stockIssue) {
      Alert.alert('在庫不足', '店頭在庫が足りません。数量を減らしてお試しください');
      return;
    }

    Alert.alert(
      '注文確認',
      'この内容で注文を確定します。\nお支払いと商品のお受け取りは、ご来店時に店舗で行います。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '確定', onPress: submitOrder },
      ],
    );
  }

  async function submitOrder() {
    if (!product || !profile) return;
    if (submitting) return; // ダブルタップ保護
    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('create-in-store-order', {
        body: {
          productId: product.id,
          quantity,
          storeId: selectedStore,
          couponId: selectedCouponId,
        },
      });
      if (error) throw error;
      if (!data?.success || !data?.orderId) {
        throw new Error(data?.error ?? '注文の作成に失敗しました');
      }

      navigation.replace('OrderComplete', { orderId: data.orderId });
    } catch (e) {
      Alert.alert('エラー', safeErrorMessage(e, '注文に失敗しました'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 商品情報 */}
        <View style={styles.productCard}>
          {image ? (
            <Image source={{ uri: image }} style={styles.productImage} />
          ) : (
            <View style={[styles.productImage, styles.imagePlaceholder]}>
              <Ionicons name="image-outline" size={28} color={COLORS.borderLight} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            {product.brand && <Text style={styles.brand}>{product.brand}</Text>}
            <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
            <Text style={styles.unitPrice}>¥{product.price.toLocaleString()}</Text>
          </View>
        </View>

        {/* 数量 */}
        <Text style={styles.sectionTitle}>数量</Text>
        <View style={styles.qtyRow}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => setQuantity((q) => Math.max(1, q - 1))}
          >
            <Ionicons name="remove" size={18} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.qtyText}>{quantity}</Text>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => setQuantity((q) => Math.min(99, q + 1))}
          >
            <Ionicons name="add" size={18} color={COLORS.text} />
          </TouchableOpacity>
          {product.available_in_store && (
            <Text style={styles.stockNote}>店頭在庫: {product.stock_quantity}</Text>
          )}
        </View>

        {/* クーポン */}
        <Text style={styles.sectionTitle}>クーポン</Text>
        {coupons.length === 0 ? (
          <View style={styles.emptyCoupon}>
            <Text style={styles.emptyCouponText}>利用可能なクーポンはありません</Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.couponItem, !selectedCouponId && styles.couponItemActive]}
              onPress={() => setSelectedCouponId(null)}
            >
              <Ionicons
                name={!selectedCouponId ? 'radio-button-on' : 'radio-button-off'}
                size={18}
                color={!selectedCouponId ? COLORS.accent : COLORS.textLight}
              />
              <Text style={styles.couponText}>使用しない</Text>
            </TouchableOpacity>
            {coupons.map((c) => {
              const active = selectedCouponId === c.id;
              const d = calcDiscount(c, subtotal);
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.couponItem, active && styles.couponItemActive]}
                  onPress={() => setSelectedCouponId(c.id)}
                >
                  <Ionicons
                    name={active ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={active ? COLORS.accent : COLORS.textLight}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.couponText}>{c.title}</Text>
                    <Text style={styles.couponSub}>
                      -¥{d.toLocaleString()} / ~{new Date(c.valid_until).toLocaleDateString('ja-JP')}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* お受け取り・お支払い案内 */}
        <Text style={styles.sectionTitle}>お受け取り・お支払い</Text>
        <View style={styles.infoCard}>
          <Ionicons name="storefront-outline" size={22} color={COLORS.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>店舗でお受け取り・お支払い</Text>
            <Text style={styles.infoDesc}>
              ご注文後、商品の準備が整いましたら通知でお知らせします。{'\n'}
              次回ご来店時に店舗でお支払い・お受け取りください。
            </Text>
          </View>
        </View>

        {/* 金額内訳 */}
        <Text style={styles.sectionTitle}>お支払い内訳（店舗でのお支払い額）</Text>
        <View style={styles.breakdown}>
          <Row label="小計" value={`¥${subtotal.toLocaleString()}`} />
          {discount > 0 && (
            <Row label="クーポン割引" value={`-¥${discount.toLocaleString()}`} accent />
          )}
          <View style={styles.divider} />
          <Row label="合計（税込）" value={`¥${total.toLocaleString()}`} bold />
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* フッター */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitBtn, submitting && { opacity: 0.5 }]}
          onPress={handleConfirm}
          disabled={submitting}
        >
          {submitting ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.submitText}>注文を確定する</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function calcDiscount(coupon: Coupon | null, subtotal: number): number {
  if (!coupon) return 0;
  let calc = 0;
  if (coupon.discount_percent) {
    calc = Math.floor((subtotal * coupon.discount_percent) / 100);
    if (coupon.discount_amount && calc > coupon.discount_amount) {
      calc = coupon.discount_amount;
    }
  } else if (coupon.discount_amount) {
    calc = coupon.discount_amount;
  }
  return Math.min(calc, subtotal);
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && { fontWeight: '700' }]}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          bold && { fontWeight: '700', fontSize: 18 },
          accent && { color: COLORS.accent },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 16, paddingBottom: 120 },

  productCard: {
    flexDirection: 'row', gap: 12,
    backgroundColor: COLORS.surface, padding: 12, borderRadius: 12,
  },
  productImage: { width: 72, height: 72, borderRadius: 8 },
  imagePlaceholder: {
    backgroundColor: COLORS.backgroundSoft,
    justifyContent: 'center', alignItems: 'center',
  },
  brand: { fontSize: 10, fontWeight: '700', color: COLORS.accent, letterSpacing: 0.5 },
  productName: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginTop: 2 },
  unitPrice: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 4 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginTop: 20, marginBottom: 8 },

  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  qtyBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    justifyContent: 'center', alignItems: 'center',
  },
  qtyText: { fontSize: 16, fontWeight: '700', color: COLORS.text, minWidth: 40, textAlign: 'center' },
  stockNote: { fontSize: 11, color: COLORS.textSecondary, marginLeft: 'auto' },

  emptyCoupon: {
    backgroundColor: COLORS.surface, padding: 14, borderRadius: 10,
    alignItems: 'center',
  },
  emptyCouponText: { fontSize: 12, color: COLORS.textLight },
  couponItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 6,
  },
  couponItemActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accent + '08' },
  couponText: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  couponSub: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },

  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: COLORS.surface, padding: 14, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  infoTitle: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  infoDesc: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4, lineHeight: 17 },

  breakdown: {
    backgroundColor: COLORS.surface, padding: 14, borderRadius: 12,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  rowLabel: { fontSize: 13, color: COLORS.textSecondary },
  rowValue: { fontSize: 14, color: COLORS.text },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 4 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: 16, paddingBottom: 32,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  submitBtn: {
    backgroundColor: COLORS.accent, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  submitText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
