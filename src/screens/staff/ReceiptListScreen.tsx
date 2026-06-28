// 領収書一覧
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, TextInput,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

export function ReceiptListScreen() {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('receipts')
      .select('*, customer:profiles!receipts_customer_id_fkey(full_name)')
      .order('issued_at', { ascending: false })
      .limit(100);
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const filtered = items.filter((r) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      r.receipt_number?.toLowerCase().includes(q) ||
      r.issued_to_name?.toLowerCase().includes(q) ||
      r.customer?.full_name?.toLowerCase().includes(q)
    );
  });

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={COLORS.textLight} />
        <TextInput
          style={styles.searchInput}
          placeholder="領収書番号・宛名で検索"
          placeholderTextColor={COLORS.textLight}
          value={query}
          onChangeText={setQuery}
        />
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={COLORS.accent} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={40} color={COLORS.textLight} />
            <Text style={styles.emptyText}>領収書はありません</Text>
          </View>
        ) : (
          filtered.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={styles.row}
              onPress={() => navigation.navigate('ReceiptView', { receiptId: r.id })}
            >
              <View style={styles.numBadge}>
                <Text style={styles.numText}>{r.receipt_number?.split('-')[2] ?? '---'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{r.issued_to_name}</Text>
                <Text style={styles.proviso} numberOfLines={1}>
                  {r.proviso ?? '（但し書きなし）'}
                </Text>
                <Text style={styles.meta}>
                  {new Date(r.issued_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {r.source_type ? ` ・ ${sourceLabel(r.source_type)}` : ''}
                </Text>
              </View>
              <Text style={styles.amount}>¥{(r.amount ?? 0).toLocaleString()}</Text>
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('ReceiptForm', {})}
      >
        <Ionicons name="add" size={24} color="#FFF" />
        <Text style={styles.fabText}>発行</Text>
      </TouchableOpacity>
    </View>
  );
}

function sourceLabel(s: string) {
  switch (s) {
    case 'booking': return '予約';
    case 'order': return '注文';
    case 'ticket': return '回数券';
    case 'walk_in': return '手売り';
    case 'subscription': return 'サブスク';
    default: return 'その他';
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, marginHorizontal: 16, marginTop: 12,
    paddingHorizontal: 12, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: 13, color: COLORS.text, paddingVertical: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, borderRadius: 10, padding: 12,
    marginHorizontal: 16, marginTop: 8,
  },
  numBadge: {
    width: 46, height: 46, borderRadius: 10,
    backgroundColor: COLORS.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  numText: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  name: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  proviso: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  meta: { fontSize: 10, color: COLORS.textLight, marginTop: 2 },
  amount: { fontSize: 16, fontWeight: '700', color: COLORS.accent },
  emptyCard: { alignItems: 'center', padding: 40, gap: 10, marginTop: 40 },
  emptyText: { fontSize: 13, color: COLORS.textLight },
  fab: {
    position: 'absolute', bottom: 24, right: 16,
    backgroundColor: COLORS.accent, borderRadius: 28,
    paddingHorizontal: 18, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.15,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  fabText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
