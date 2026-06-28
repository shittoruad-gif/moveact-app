// 物販商品 一覧（スタッフ用）
// B Happy URL / 店頭販売フラグ / 仕入値などを一覧表示
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  TextInput,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, PRODUCT_BRANDS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

export function StaffProductListScreen() {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [routeFilter, setRouteFilter] = useState<'all' | 'store' | 'bhappy' | 'multi'>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('id, name, brand, price, wholesale_price, stock_quantity, is_active, bhappy_url, available_in_store, sku')
      .order('sort_order', { ascending: true })
      .order('name');
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const filtered = useMemo(() => {
    return items.filter((p) => {
      if (query && !`${p.name} ${p.sku ?? ''} ${p.brand ?? ''}`.toLowerCase().includes(query.toLowerCase())) return false;
      if (brandFilter && p.brand !== brandFilter) return false;
      if (routeFilter === 'bhappy' && !p.bhappy_url) return false;
      if (routeFilter === 'store' && !p.available_in_store) return false;
      if (routeFilter === 'multi') {
        const count = (p.available_in_store ? 1 : 0) + (p.bhappy_url ? 1 : 0);
        if (count < 2) return false;
      }
      return true;
    });
  }, [items, query, brandFilter, routeFilter]);

  return (
    <View style={styles.container}>
      {/* Search + filters */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={COLORS.textLight} />
          <TextInput
            style={styles.searchInput}
            placeholder="商品名・SKU・ブランドで検索"
            placeholderTextColor={COLORS.textLight}
            value={query}
            onChangeText={setQuery}
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        <FilterChip label="すべて" active={!brandFilter} onPress={() => setBrandFilter(null)} />
        {PRODUCT_BRANDS.map((b) => (
          <FilterChip key={b} label={b} active={brandFilter === b} onPress={() => setBrandFilter(b)} />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContent}
      >
        <FilterChip label="全ルート" active={routeFilter === 'all'} onPress={() => setRouteFilter('all')} tone="dim" />
        <FilterChip label="店頭販売" active={routeFilter === 'store'} onPress={() => setRouteFilter('store')} tone="dim" />
        <FilterChip label="B Happy" active={routeFilter === 'bhappy'} onPress={() => setRouteFilter('bhappy')} tone="dim" />
        <FilterChip label="複数ルート" active={routeFilter === 'multi'} onPress={() => setRouteFilter('multi')} tone="dim" />
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={COLORS.accent} />}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cube-outline" size={40} color={COLORS.textLight} />
            <Text style={styles.emptyText}>該当する商品はありません</Text>
            <Text style={styles.emptyText2}>右下の「＋」から追加できます</Text>
          </View>
        ) : (
          filtered.map((p) => {
            const margin =
              p.wholesale_price && p.price && p.price > 0
                ? Math.round(((p.price - p.wholesale_price) / p.price) * 100)
                : null;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.card, !p.is_active && { opacity: 0.5 }]}
                onPress={() => navigation.navigate('StaffProductForm', { productId: p.id })}
              >
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    {p.brand && <Text style={styles.brand}>{p.brand}</Text>}
                    <Text style={styles.name} numberOfLines={2}>{p.name}</Text>
                    {p.sku && <Text style={styles.sku}>{p.sku}</Text>}
                  </View>
                  <View style={styles.priceCol}>
                    <Text style={styles.price}>¥{Number(p.price).toLocaleString()}</Text>
                    {margin !== null && (
                      <Text style={styles.margin}>粗利 {margin}%</Text>
                    )}
                  </View>
                </View>
                <View style={styles.badgeRow}>
                  {p.available_in_store && (
                    <View style={[styles.badge, { backgroundColor: COLORS.accent + '15' }]}>
                      <Ionicons name="storefront-outline" size={10} color={COLORS.accent} />
                      <Text style={[styles.badgeText, { color: COLORS.accent }]}>店頭</Text>
                    </View>
                  )}
                  {p.bhappy_url && (
                    <View style={[styles.badge, { backgroundColor: '#FF2D5510' }]}>
                      <Ionicons name="link" size={10} color="#FF2D55" />
                      <Text style={[styles.badgeText, { color: '#FF2D55' }]}>B Happy</Text>
                    </View>
                  )}
                  {!p.is_active && (
                    <View style={[styles.badge, { backgroundColor: COLORS.textLight + '20' }]}>
                      <Text style={[styles.badgeText, { color: COLORS.textSecondary }]}>非公開</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }} />
                  <Text style={styles.stockText}>在庫 {p.stock_quantity}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('StaffProductForm', {})}
      >
        <Ionicons name="add" size={24} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

function FilterChip({
  label, active, onPress, tone = 'brand',
}: { label: string; active: boolean; onPress: () => void; tone?: 'brand' | 'dim' }) {
  const activeBg = tone === 'brand' ? COLORS.accent : COLORS.text;
  return (
    <TouchableOpacity
      style={[styles.chip, active && { backgroundColor: activeBg, borderColor: activeBg }]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, active && { color: '#FFF' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  searchRow: { padding: 12, paddingBottom: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 13, color: COLORS.text },
  filterScroll: { maxHeight: 44, flexGrow: 0 },
  filterContent: { gap: 6, paddingHorizontal: 12, paddingVertical: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  chipText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  card: {
    backgroundColor: COLORS.surface, marginHorizontal: 16, marginTop: 8,
    padding: 12, borderRadius: 10,
  },
  cardHeader: { flexDirection: 'row', gap: 10 },
  brand: { fontSize: 10, fontWeight: '700', color: COLORS.accent, letterSpacing: 0.5 },
  name: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginTop: 2 },
  sku: { fontSize: 10, color: COLORS.textLight, marginTop: 2 },
  priceCol: { alignItems: 'flex-end' },
  price: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  margin: { fontSize: 10, color: COLORS.textSecondary, marginTop: 2 },
  badgeRow: {
    flexDirection: 'row', gap: 4, marginTop: 10, alignItems: 'center',
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
  stockText: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '600' },
  emptyCard: { alignItems: 'center', padding: 40, gap: 6, marginTop: 20 },
  emptyText: { fontSize: 13, color: COLORS.textLight },
  emptyText2: { fontSize: 11, color: COLORS.textLight },
  fab: {
    position: 'absolute', bottom: 24, right: 16,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.accent,
    alignItems: 'center', justifyContent: 'center',
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.15,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
});
