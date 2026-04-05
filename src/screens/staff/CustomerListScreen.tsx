import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../types/database';

export function CustomerListScreen() {
  const navigation = useNavigation<any>();
  const [customers, setCustomers] = useState<Profile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchCustomers(); }, []);

  async function fetchCustomers() {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'customer')
      .order('created_at', { ascending: false });
    setCustomers((data as Profile[]) ?? []);
    setLoading(false);
  }

  const filtered = searchQuery.trim()
    ? customers.filter((c) => {
        const q = searchQuery.trim().toLowerCase();
        return (
          c.full_name?.toLowerCase().includes(q) ||
          c.full_name_kana?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.email?.toLowerCase().includes(q)
        );
      })
    : customers;

  function renderCustomer({ item }: { item: Profile }) {
    const initial = item.full_name?.charAt(0) ?? '?';
    const dob = item.date_of_birth
      ? new Date(item.date_of_birth).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
      : null;

    return (
      <TouchableOpacity
        style={styles.customerCard}
        onPress={() => navigation.navigate('CustomerDetail', { userId: item.id })}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.customerInfo}>
          <Text style={styles.customerName}>{item.full_name}</Text>
          {item.full_name_kana && (
            <Text style={styles.customerKana}>{item.full_name_kana}</Text>
          )}
          <View style={styles.detailRow}>
            {item.phone && (
              <View style={styles.detailChip}>
                <Ionicons name="call-outline" size={11} color={COLORS.textSecondary} />
                <Text style={styles.detailText}>{item.phone}</Text>
              </View>
            )}
            {dob && (
              <View style={styles.detailChip}>
                <Ionicons name="gift-outline" size={11} color={COLORS.textSecondary} />
                <Text style={styles.detailText}>{dob}</Text>
              </View>
            )}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="名前・電話番号・メールで検索"
            placeholderTextColor={COLORS.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <Text style={styles.countText}>{filtered.length}名</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderCustomer}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchCustomers} tintColor={COLORS.accent} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={40} color={COLORS.borderLight} />
              <Text style={styles.emptyText}>顧客が見つかりません</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  searchSection: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: COLORS.borderLight, gap: 8,
    marginBottom: 6,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text, padding: 0 },
  countText: { fontSize: 12, color: COLORS.textSecondary, textAlign: 'right' },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  customerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.accentLight,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 17, fontWeight: '500', color: COLORS.accent },
  customerInfo: { flex: 1 },
  customerName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  customerKana: { fontSize: 11, color: COLORS.textLight, marginTop: 1 },
  detailRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  detailChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  detailText: { fontSize: 11, color: COLORS.textSecondary },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, color: COLORS.textLight },
});
