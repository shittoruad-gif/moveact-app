import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { useCartStore } from '../../stores/cartStore';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';

export function CheckoutScreen() {
  const navigation = useNavigation<any>();
  const { items, getTotal, clearCart } = useCartStore();
  const { selectedStore } = useStoreSelection();
  const { profile } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const subtotal = getTotal();
  const tax = Math.floor(subtotal * 0.1);
  const total = subtotal;

  async function handleOrder() {
    if (!profile) {
      Alert.alert('エラー', 'ログインしてください');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: profile.id,
          store_id: selectedStore,
          status: 'pending',
          subtotal,
          tax: 0,
          total,
          pickup_store: selectedStore,
        })
        .select()
        .single();

      if (orderError || !order) throw orderError;

      const orderItems = items.map((item) => ({
        order_id: order.id,
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.price,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      clearCart();
      navigation.replace('OrderComplete', { orderId: order.id });
    } catch (e: any) {
      Alert.alert('エラー', '注文の処理に失敗しました。もう一度お試しください。');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 受取店舗 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>受取店舗</Text>
          <View style={styles.card}>
            <Ionicons name="storefront-outline" size={20} color={COLORS.accent} />
            <View style={styles.storeInfo}>
              <Text style={styles.storeName}>{STORES[selectedStore].name}</Text>
              <Text style={styles.storeAddress}>{STORES[selectedStore].address}</Text>
            </View>
          </View>
        </View>

        {/* 注文内容 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>注文内容</Text>
          <View style={styles.card}>
            {items.map((item, i) => (
              <View key={item.product.id} style={[styles.orderItem, i < items.length - 1 && styles.orderItemBorder]}>
                <View style={styles.orderItemInfo}>
                  <Text style={styles.orderItemName} numberOfLines={2}>{item.product.name}</Text>
                  <Text style={styles.orderItemQty}>x{item.quantity}</Text>
                </View>
                <Text style={styles.orderItemPrice}>
                  ¥{(item.product.price * item.quantity).toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* 金額明細 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>お支払い</Text>
          <View style={styles.card}>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>小計</Text>
              <Text style={styles.priceValue}>¥{subtotal.toLocaleString()}</Text>
            </View>
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>消費税（税込価格）</Text>
              <Text style={styles.priceValue}>-</Text>
            </View>
            <View style={[styles.priceRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>合計</Text>
              <Text style={styles.totalValue}>¥{total.toLocaleString()}</Text>
            </View>
          </View>
        </View>

        <View style={styles.noteCard}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.textSecondary} />
          <Text style={styles.noteText}>
            お支払いは店舗にて承ります。商品の準備が整い次第、通知でお知らせいたします。
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={isSubmitting ? '処理中...' : '注文を確定する'}
          onPress={handleOrder}
          disabled={isSubmitting || items.length === 0}
          size="large"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 16, paddingBottom: 24 },
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
  },
  storeInfo: { marginLeft: 12, flex: 1 },
  storeName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  storeAddress: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  orderItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  orderItemBorder: { borderBottomWidth: 0.5, borderBottomColor: COLORS.borderLight },
  orderItemInfo: { flex: 1 },
  orderItemName: { fontSize: 14, fontWeight: '500', color: COLORS.text },
  orderItemQty: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  orderItemPrice: { fontSize: 14, fontWeight: '600', color: COLORS.text, minWidth: 80, textAlign: 'right' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  priceLabel: { fontSize: 14, color: COLORS.textSecondary },
  priceValue: { fontSize: 14, color: COLORS.text },
  totalRow: { borderTopWidth: 1, borderTopColor: COLORS.borderLight, marginTop: 4, paddingTop: 12 },
  totalLabel: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  totalValue: { fontSize: 20, fontWeight: '700', color: COLORS.accent },
  noteCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.surfaceWarm,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  noteText: { flex: 1, fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },
  footer: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
});
