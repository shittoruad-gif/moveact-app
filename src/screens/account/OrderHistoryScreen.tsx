import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import type { Order } from '../../types/database';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '注文受付', color: COLORS.warning },
  paid: { label: '支払済', color: COLORS.success },
  preparing: { label: '準備中', color: COLORS.accent },
  ready: { label: '受取可能', color: COLORS.success },
  completed: { label: '完了', color: COLORS.textSecondary },
  cancelled: { label: 'キャンセル', color: COLORS.error },
  refunded: { label: '返金済', color: COLORS.textLight },
};

export function OrderHistoryScreen() {
  const { profile } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchOrders(); }, []);

  async function fetchOrders() {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('orders')
      .select('*, items:order_items(*, product:products(name))')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    setOrders((data as Order[]) ?? []);
    setLoading(false);
  }

  function renderOrder({ item }: { item: Order }) {
    const status = STATUS_LABELS[item.status] ?? { label: item.status, color: COLORS.textLight };
    const date = new Date(item.created_at).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    return (
      <View style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <Text style={styles.orderDate}>{date}</Text>
          <View style={[styles.statusBadge, { backgroundColor: status.color + '20' }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
        <View style={styles.orderItems}>
          {(item.items ?? []).map((oi: any, i: number) => (
            <Text key={i} style={styles.orderItemText} numberOfLines={1}>
              {oi.product?.name ?? '商品'} x{oi.quantity}
            </Text>
          ))}
        </View>
        <View style={styles.orderFooter}>
          <Text style={styles.storeName}>{STORES[item.store_id]?.name ?? item.store_id}</Text>
          <Text style={styles.orderTotal}>¥{item.total.toLocaleString()}</Text>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      data={orders}
      keyExtractor={(item) => item.id}
      renderItem={renderOrder}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchOrders} tintColor={COLORS.accent} />}
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={40} color={COLORS.borderLight} />
            <Text style={styles.emptyText}>注文履歴はありません</Text>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 32 },
  orderCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  orderDate: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  orderItems: { gap: 4, marginBottom: 10 },
  orderItemText: { fontSize: 13, color: COLORS.textSecondary },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: COLORS.borderLight,
    paddingTop: 10,
  },
  storeName: { fontSize: 12, color: COLORS.textLight },
  orderTotal: { fontSize: 16, fontWeight: '700', color: COLORS.accent },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, color: COLORS.textLight },
});
