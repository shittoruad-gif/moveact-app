// 手売りレジ（物販の店頭販売）
// 商品選択→数量→決済方法→保存→領収書発行
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useStoreSelection } from '../../stores/storeSelectionStore';

type LineItem = { product_id?: string; name: string; qty: number; unit_price: number };

const PAYMENT_METHODS = [
  { id: 'cash', label: '現金', icon: 'cash-outline' },
  { id: 'card', label: 'カード', icon: 'card-outline' },
  { id: 'paypay', label: 'PayPay', icon: 'qr-code-outline' },
  { id: 'other', label: 'その他', icon: 'ellipsis-horizontal' },
] as const;

export function WalkInSaleScreen() {
  const navigation = useNavigation<any>();
  const profile = useAuthStore((s) => s.profile);
  const { selectedStore } = useStoreSelection();
  const [products, setProducts] = useState<any[]>([]);
  const [cart, setCart] = useState<LineItem[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string>('cash');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('id, name, price, stock_quantity')
      .eq('is_active', true)
      .order('sort_order');
    setProducts(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchProducts(); }, [fetchProducts]));

  function addProduct(p: any) {
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.product_id === p.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], qty: copy[idx].qty + 1 };
        return copy;
      }
      return [...prev, { product_id: p.id, name: p.name, qty: 1, unit_price: p.price }];
    });
  }

  function updateQty(idx: number, delta: number) {
    setCart((prev) => {
      const copy = [...prev];
      const newQty = copy[idx].qty + delta;
      if (newQty <= 0) return copy.filter((_, i) => i !== idx);
      copy[idx] = { ...copy[idx], qty: newQty };
      return copy;
    });
  }

  function removeItem(idx: number) {
    setCart((prev) => prev.filter((_, i) => i !== idx));
  }

  function addCustomItem() {
    setCart((prev) => [...prev, { name: '手入力', qty: 1, unit_price: 0 }]);
  }

  function updateCustomName(idx: number, name: string) {
    setCart((prev) => prev.map((it, i) => i === idx ? { ...it, name } : it));
  }

  function updateCustomPrice(idx: number, priceStr: string) {
    const price = parseInt(priceStr, 10) || 0;
    setCart((prev) => prev.map((it, i) => i === idx ? { ...it, unit_price: price } : it));
  }

  const total = useMemo(() => cart.reduce((sum, it) => sum + it.qty * it.unit_price, 0), [cart]);

  async function handleCheckout() {
    if (cart.length === 0) {
      Alert.alert('エラー', '商品を追加してください');
      return;
    }
    if (total <= 0) {
      Alert.alert('エラー', '金額が0円です');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('walk_in_sales')
        .insert({
          store_id: selectedStore,
          staff_id: profile?.id,
          customer_id: null,
          customer_name: customerName.trim() || null,
          subtotal: total,
          tax: 0,
          total,
          payment_method: paymentMethod,
          items: cart,
          note: note.trim() || null,
        })
        .select('id')
        .single();
      if (error) throw error;

      // Decrement stock for items with product_id (best-effort)
      for (const it of cart) {
        if (it.product_id) {
          try {
            await supabase.rpc('decrement_product_stock', {
              p_product_id: it.product_id,
              p_qty: it.qty,
            });
          } catch {
            // fallback: ignore if RPC missing; admin can adjust manually
          }
        }
      }

      Alert.alert('販売登録完了', `¥${total.toLocaleString()} の販売を記録しました`, [
        { text: '領収書を発行', onPress: () => navigation.replace('ReceiptForm', {
          amount: total,
          sourceType: 'walk_in',
          sourceId: data.id,
        }) },
        { text: '閉じる', onPress: () => navigation.goBack(), style: 'cancel' },
      ]);
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '登録に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }}>
        <Text style={styles.section}>商品を選択</Text>
        {loading ? (
          <ActivityIndicator style={{ margin: 20 }} color={COLORS.accent} />
        ) : (
          <View style={styles.productGrid}>
            {products.map((p) => (
              <TouchableOpacity
                key={p.id}
                style={styles.productCard}
                onPress={() => addProduct(p)}
              >
                <Text style={styles.productName} numberOfLines={2}>{p.name}</Text>
                <Text style={styles.productPrice}>¥{p.price.toLocaleString()}</Text>
                <Text style={styles.productStock}>在庫 {p.stock_quantity}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.productCard, { backgroundColor: COLORS.backgroundSoft, borderStyle: 'dashed' }]}
              onPress={addCustomItem}
            >
              <Ionicons name="add" size={24} color={COLORS.textSecondary} />
              <Text style={[styles.productName, { color: COLORS.textSecondary }]}>手入力</Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.section}>カート ({cart.length}点)</Text>
        {cart.length === 0 ? (
          <Text style={styles.emptyCart}>商品をタップして追加してください</Text>
        ) : (
          cart.map((it, idx) => (
            <View key={idx} style={styles.cartRow}>
              <View style={{ flex: 1 }}>
                {it.product_id ? (
                  <Text style={styles.cartName} numberOfLines={1}>{it.name}</Text>
                ) : (
                  <TextInput
                    style={styles.cartNameInput}
                    value={it.name}
                    onChangeText={(v) => updateCustomName(idx, v)}
                    placeholder="商品名"
                    placeholderTextColor={COLORS.textLight}
                  />
                )}
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 4 }}>
                  {it.product_id ? (
                    <Text style={styles.cartPrice}>¥{it.unit_price.toLocaleString()} × {it.qty}</Text>
                  ) : (
                    <>
                      <Text style={styles.cartPrice}>¥</Text>
                      <TextInput
                        style={styles.cartPriceInput}
                        keyboardType="number-pad"
                        value={String(it.unit_price)}
                        onChangeText={(v) => updateCustomPrice(idx, v.replace(/[^0-9]/g, ''))}
                      />
                      <Text style={styles.cartPrice}>× {it.qty}</Text>
                    </>
                  )}
                  <Text style={styles.cartLineTotal}>
                    = ¥{(it.qty * it.unit_price).toLocaleString()}
                  </Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(idx, -1)}>
                  <Ionicons name="remove" size={16} color={COLORS.text} />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{it.qty}</Text>
                <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQty(idx, 1)}>
                  <Ionicons name="add" size={16} color={COLORS.text} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => removeItem(idx)}>
                  <Ionicons name="close-circle" size={20} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}

        <Text style={styles.section}>お客様名（任意）</Text>
        <TextInput
          style={styles.input}
          placeholder="例: 山田 太郎"
          placeholderTextColor={COLORS.textLight}
          value={customerName}
          onChangeText={setCustomerName}
        />

        <Text style={styles.section}>決済方法</Text>
        <View style={styles.paymentRow}>
          {PAYMENT_METHODS.map((pm) => (
            <TouchableOpacity
              key={pm.id}
              style={[styles.paymentChip, paymentMethod === pm.id && styles.paymentChipActive]}
              onPress={() => setPaymentMethod(pm.id)}
            >
              <Ionicons
                name={pm.icon as any}
                size={18}
                color={paymentMethod === pm.id ? '#FFF' : COLORS.textSecondary}
              />
              <Text style={[styles.paymentText, paymentMethod === pm.id && { color: '#FFF' }]}>
                {pm.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.section}>メモ</Text>
        <TextInput
          style={[styles.input, { minHeight: 60 }]}
          placeholder="補足情報"
          placeholderTextColor={COLORS.textLight}
          multiline
          value={note}
          onChangeText={setNote}
          textAlignVertical="top"
        />

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={styles.bottomBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.totalLabel}>合計</Text>
          <Text style={styles.totalValue}>¥{total.toLocaleString()}</Text>
        </View>
        <TouchableOpacity
          style={[styles.checkoutBtn, (saving || cart.length === 0) && { opacity: 0.5 }]}
          onPress={handleCheckout}
          disabled={saving || cart.length === 0}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#FFF" />
              <Text style={styles.checkoutText}>販売確定</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  section: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginTop: 16, marginHorizontal: 16, marginBottom: 8 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, gap: 8 },
  productCard: {
    width: '31%',
    backgroundColor: COLORS.surface, borderRadius: 10,
    padding: 10, gap: 4, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border, minHeight: 88,
    justifyContent: 'center',
  },
  productName: { fontSize: 11, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  productPrice: { fontSize: 13, fontWeight: '700', color: COLORS.accent },
  productStock: { fontSize: 9, color: COLORS.textLight },
  emptyCart: {
    textAlign: 'center', fontSize: 12, color: COLORS.textLight,
    paddingVertical: 30, marginHorizontal: 16,
  },
  cartRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, padding: 12,
    marginHorizontal: 16, borderRadius: 10, marginBottom: 6,
  },
  cartName: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  cartNameInput: {
    fontSize: 13, fontWeight: '600', color: COLORS.text,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, paddingVertical: 2,
  },
  cartPrice: { fontSize: 11, color: COLORS.textSecondary },
  cartPriceInput: {
    fontSize: 11, color: COLORS.text, width: 60,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    paddingVertical: 0,
  },
  cartLineTotal: { fontSize: 11, fontWeight: '700', color: COLORS.accent, marginLeft: 'auto' },
  qtyBtn: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: COLORS.backgroundSoft, alignItems: 'center', justifyContent: 'center',
  },
  qtyText: { fontSize: 13, fontWeight: '700', color: COLORS.text, minWidth: 20, textAlign: 'center' },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 13, color: COLORS.text, marginHorizontal: 16,
  },
  paymentRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16 },
  paymentChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingVertical: 10,
  },
  paymentChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  paymentText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  totalLabel: { fontSize: 11, color: COLORS.textSecondary },
  totalValue: { fontSize: 22, fontWeight: '700', color: COLORS.accent },
  checkoutBtn: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
    backgroundColor: COLORS.success, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 12,
  },
  checkoutText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
