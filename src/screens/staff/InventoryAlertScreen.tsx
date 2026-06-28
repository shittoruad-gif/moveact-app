// 在庫アラート画面
// 閾値を下回った物販商品を一覧。閾値・在庫を直接編集可能
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

export function InventoryAlertScreen() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string; field: 'stock' | 'threshold'; value: string } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('id, name, stock_quantity, low_stock_threshold, is_active, sku')
      .order('stock_quantity', { ascending: true });
    setProducts(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  async function saveEdit() {
    if (!editing) return;
    const val = parseInt(editing.value, 10);
    if (isNaN(val) || val < 0) {
      Alert.alert('エラー', '0以上の整数を入力してください');
      return;
    }
    const field = editing.field === 'stock' ? 'stock_quantity' : 'low_stock_threshold';
    await supabase.from('products').update({ [field]: val }).eq('id', editing.id);
    setEditing(null);
    fetchData();
  }

  const outOfStock = products.filter((p) => p.stock_quantity === 0);
  const lowStock = products.filter((p) => p.stock_quantity > 0 && p.stock_quantity <= (p.low_stock_threshold ?? 5));
  const okStock = products.filter((p) => p.stock_quantity > (p.low_stock_threshold ?? 5));

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={COLORS.accent} />}
    >
      {/* Summary */}
      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, { borderLeftColor: COLORS.error }]}>
          <Text style={styles.summaryLabel}>在庫切れ</Text>
          <Text style={[styles.summaryValue, { color: COLORS.error }]}>{outOfStock.length}</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftColor: COLORS.warning }]}>
          <Text style={styles.summaryLabel}>少量在庫</Text>
          <Text style={[styles.summaryValue, { color: COLORS.warning }]}>{lowStock.length}</Text>
        </View>
        <View style={[styles.summaryCard, { borderLeftColor: COLORS.success }]}>
          <Text style={styles.summaryLabel}>通常</Text>
          <Text style={[styles.summaryValue, { color: COLORS.success }]}>{okStock.length}</Text>
        </View>
      </View>

      {outOfStock.length > 0 && (
        <Section title="⚠️ 在庫切れ" color={COLORS.error}>
          {outOfStock.map((p) => (
            <ProductRow key={p.id} product={p} editing={editing} setEditing={setEditing} onSave={saveEdit} />
          ))}
        </Section>
      )}

      {lowStock.length > 0 && (
        <Section title="⚡ 補充推奨" color={COLORS.warning}>
          {lowStock.map((p) => (
            <ProductRow key={p.id} product={p} editing={editing} setEditing={setEditing} onSave={saveEdit} />
          ))}
        </Section>
      )}

      {okStock.length > 0 && (
        <Section title="✅ 通常在庫" color={COLORS.success}>
          {okStock.map((p) => (
            <ProductRow key={p.id} product={p} editing={editing} setEditing={setEditing} onSave={saveEdit} />
          ))}
        </Section>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Section({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 20 }}>
      <Text style={[styles.sectionTitle, { color }]}>{title}</Text>
      {children}
    </View>
  );
}

function ProductRow({
  product, editing, setEditing, onSave,
}: {
  product: any;
  editing: { id: string; field: 'stock' | 'threshold'; value: string } | null;
  setEditing: (v: any) => void;
  onSave: () => void;
}) {
  const stockEditing = editing?.id === product.id && editing?.field === 'stock' ? editing : null;
  const thresholdEditing = editing?.id === product.id && editing?.field === 'threshold' ? editing : null;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        {product.sku && <Text style={styles.sku}>{product.sku}</Text>}
      </View>
      <View style={styles.stockCol}>
        <Text style={styles.stockLabel}>在庫</Text>
        {stockEditing ? (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <TextInput
              style={styles.inlineInput}
              keyboardType="number-pad"
              value={stockEditing.value}
              onChangeText={(v) => setEditing({ ...stockEditing, value: v.replace(/[^0-9]/g, '') })}
              autoFocus
            />
            <TouchableOpacity onPress={onSave}>
              <Ionicons name="checkmark" size={18} color={COLORS.success} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setEditing({ id: product.id, field: 'stock', value: String(product.stock_quantity) })}
          >
            <Text style={[styles.stockValue, {
              color: product.stock_quantity === 0 ? COLORS.error
                : product.stock_quantity <= (product.low_stock_threshold ?? 5) ? COLORS.warning
                : COLORS.text,
            }]}>
              {product.stock_quantity}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.stockCol}>
        <Text style={styles.stockLabel}>閾値</Text>
        {thresholdEditing ? (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <TextInput
              style={styles.inlineInput}
              keyboardType="number-pad"
              value={thresholdEditing.value}
              onChangeText={(v) => setEditing({ ...thresholdEditing, value: v.replace(/[^0-9]/g, '') })}
              autoFocus
            />
            <TouchableOpacity onPress={onSave}>
              <Ionicons name="checkmark" size={18} color={COLORS.success} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => setEditing({ id: product.id, field: 'threshold', value: String(product.low_stock_threshold ?? 5) })}
          >
            <Text style={styles.stockValue}>{product.low_stock_threshold ?? 5}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  summaryRow: { flexDirection: 'row', gap: 8, padding: 16 },
  summaryCard: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 10,
    padding: 12, borderLeftWidth: 3,
  },
  summaryLabel: { fontSize: 10, color: COLORS.textSecondary },
  summaryValue: { fontSize: 24, fontWeight: '700', marginTop: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '700', paddingHorizontal: 16, marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, padding: 12,
    marginHorizontal: 16, borderRadius: 10, marginBottom: 6,
  },
  name: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  sku: { fontSize: 10, color: COLORS.textLight, marginTop: 2 },
  stockCol: { alignItems: 'center', minWidth: 60 },
  stockLabel: { fontSize: 9, color: COLORS.textLight },
  stockValue: {
    fontSize: 18, fontWeight: '700', color: COLORS.text,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  inlineInput: {
    width: 50, borderBottomWidth: 1, borderBottomColor: COLORS.accent,
    fontSize: 16, fontWeight: '700', color: COLORS.text, textAlign: 'center',
  },
});
