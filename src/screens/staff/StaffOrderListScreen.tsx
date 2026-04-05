import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

const STATUS_FLOW: Record<string, { next: string; label: string; color: string }> = {
  pending: { next: 'preparing', label: '準備開始', color: COLORS.accent },
  preparing: { next: 'ready', label: '準備完了', color: COLORS.success },
  ready: { next: 'completed', label: 'お渡し完了', color: COLORS.primary },
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '注文受付', color: COLORS.warning },
  preparing: { label: '準備中', color: COLORS.accent },
  ready: { label: '受取可能', color: COLORS.success },
  completed: { label: '完了', color: COLORS.textSecondary },
  cancelled: { label: 'キャンセル', color: COLORS.error },
};

export function StaffOrderListScreen() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('active'); // active | all

  useEffect(() => { fetchOrders(); }, [filter]);

  async function fetchOrders() {
    setLoading(true);
    let query = supabase
      .from('orders')
      .select('*, items:order_items(*, product:products(name)), customer:profiles!user_id(full_name, phone)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (filter === 'active') {
      query = query.in('status', ['pending', 'preparing', 'ready']);
    }

    const { data } = await query;
    setOrders(data ?? []);
    setLoading(false);
  }

  async function advanceStatus(orderId: string, currentStatus: string) {
    const flow = STATUS_FLOW[currentStatus];
    if (!flow) return;

    const { error } = await supabase.from('orders').update({ status: flow.next }).eq('id', orderId);
    if (error) { Alert.alert('エラー', '更新に失敗しました'); return; }
    fetchOrders();
  }

  function renderOrder({ item }: { item: any }) {
    const status = STATUS_LABELS[item.status] ?? { label: item.status, color: COLORS.textLight };
    const flow = STATUS_FLOW[item.status];
    const date = new Date(item.created_at).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    return (
      <View style={styles.orderCard}>
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.customerName}>{item.customer?.full_name ?? '---'}</Text>
            <Text style={styles.orderDate}>{date}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: status.color + '20' }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        <View style={styles.itemsList}>
          {(item.items ?? []).map((oi: any, i: number) => (
            <Text key={i} style={styles.itemText}>
              {oi.product?.name ?? '商品'} x{oi.quantity} (¥{(oi.unit_price * oi.quantity).toLocaleString()})
            </Text>
          ))}
        </View>

        <View style={styles.orderFooter}>
          <Text style={styles.totalText}>合計: ¥{item.total.toLocaleString()}</Text>
          {flow && (
            <TouchableOpacity
              style={[styles.advanceBtn, { backgroundColor: flow.color }]}
              onPress={() => advanceStatus(item.id, item.status)}
            >
              <Text style={styles.advanceBtnText}>{flow.label}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'active' && styles.filterTabActive]}
          onPress={() => setFilter('active')}
        >
          <Text style={[styles.filterText, filter === 'active' && styles.filterTextActive]}>対応中</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, filter === 'all' && styles.filterTabActive]}
          onPress={() => setFilter('all')}
        >
          <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>すべて</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(item) => item.id}
        renderItem={renderOrder}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchOrders} tintColor={COLORS.accent} />}
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <Ionicons name="bag-check-outline" size={40} color={COLORS.borderLight} />
            <Text style={styles.emptyText}>注文はありません</Text>
          </View>
        ) : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterTab: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 20, backgroundColor: COLORS.backgroundSoft },
  filterTabActive: { backgroundColor: COLORS.primary },
  filterText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  filterTextActive: { color: '#FFF' },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  orderCard: { backgroundColor: COLORS.surface, borderRadius: 14, padding: 16, marginBottom: 10 },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  customerName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  orderDate: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 11, fontWeight: '700' },
  itemsList: { gap: 4, marginBottom: 10 },
  itemText: { fontSize: 13, color: COLORS.textSecondary },
  orderFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 0.5, borderTopColor: COLORS.borderLight, paddingTop: 10 },
  totalText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  advanceBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  advanceBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, color: COLORS.textLight },
});
