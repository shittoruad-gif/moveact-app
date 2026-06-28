import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet, RefreshControl,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import type { CustomerLastVisitView } from '../../types/database';

type FilterKey =
  | 'all'
  | 'line_linked'
  | 'birthday_this_month'
  | 'visited_this_month'
  | 'inactive_60d';

type SortKey = 'recent_visit' | 'recent_registered' | 'name_kana';

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'すべて',
  line_linked: 'LINE連携済み',
  birthday_this_month: '今月誕生日',
  visited_this_month: '今月来店',
  inactive_60d: '60日以上未来店',
};

const SORT_LABELS: Record<SortKey, string> = {
  recent_visit: '最終来店順',
  recent_registered: '登録順',
  name_kana: '名前順',
};

// Hiragana → Katakana normalization (for kana search)
function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/[\u3041-\u3096]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) + 0x60)
    )
    .replace(/[\s　]+/g, '');
}

function phoneDigits(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\D/g, '');
}

export function CustomerListScreen() {
  const navigation = useNavigation<any>();
  const [customers, setCustomers] = useState<CustomerLastVisitView[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('recent_visit');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchCustomers(); }, []);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('v_customer_last_visit')
      .select('*');
    setCustomers((data as CustomerLastVisitView[]) ?? []);
    setLoading(false);
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    const thisMonth = now.getMonth() + 1;
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

    const qNorm = normalize(searchQuery);
    const qDigits = phoneDigits(searchQuery);

    let list = customers.filter((c) => {
      if (qNorm) {
        const matchText =
          normalize(c.full_name).includes(qNorm) ||
          normalize(c.full_name_kana).includes(qNorm) ||
          normalize(c.email).includes(qNorm);
        const matchDigits = qDigits.length >= 2 && phoneDigits(c.phone).includes(qDigits);
        if (!matchText && !matchDigits) return false;
      }
      if (filter === 'line_linked' && !c.line_user_id) return false;
      if (filter === 'birthday_this_month') {
        if (!c.date_of_birth) return false;
        const mo = new Date(c.date_of_birth).getMonth() + 1;
        if (mo !== thisMonth) return false;
      }
      if (filter === 'visited_this_month') {
        if (!c.last_booking_at || c.last_booking_at < thisMonthStart) return false;
      }
      if (filter === 'inactive_60d') {
        if (!c.last_booking_at) return false; // 新規(来店なし)は除外
        if (c.last_booking_at > sixtyDaysAgo) return false;
      }
      return true;
    });

    // Sort
    list = [...list].sort((a, b) => {
      if (sort === 'recent_visit') {
        const av = a.last_booking_at ?? '';
        const bv = b.last_booking_at ?? '';
        return bv.localeCompare(av);
      }
      if (sort === 'recent_registered') {
        return (b.registered_at ?? '').localeCompare(a.registered_at ?? '');
      }
      // name_kana
      return (a.full_name_kana ?? a.full_name ?? '').localeCompare(
        b.full_name_kana ?? b.full_name ?? '',
        'ja'
      );
    });
    return list;
  }, [customers, searchQuery, filter, sort]);

  function renderCustomer({ item }: { item: CustomerLastVisitView }) {
    const initial = item.full_name?.charAt(0) ?? '?';
    const dob = item.date_of_birth
      ? new Date(item.date_of_birth).toLocaleDateString('ja-JP', { month: 'long', day: 'numeric' })
      : null;
    const lastVisit = item.last_booking_at
      ? new Date(item.last_booking_at).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })
      : '未来店';
    const daysSinceVisit = item.last_booking_at
      ? Math.floor((Date.now() - new Date(item.last_booking_at).getTime()) / 86400000)
      : null;
    const inactive = daysSinceVisit !== null && daysSinceVisit > 60;

    return (
      <TouchableOpacity
        style={styles.customerCard}
        onPress={() => navigation.navigate('CustomerDetail', { userId: item.user_id })}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.customerInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.customerName}>{item.full_name}</Text>
            {item.line_user_id && (
              <View style={styles.lineBadge}>
                <Ionicons name="chatbubble" size={9} color="#06C755" />
                <Text style={styles.lineBadgeText}>LINE</Text>
              </View>
            )}
          </View>
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
            <View style={styles.detailChip}>
              <Ionicons name="time-outline" size={11} color={inactive ? COLORS.error : COLORS.textSecondary} />
              <Text style={[styles.detailText, inactive && { color: COLORS.error }]}>
                {lastVisit}
                {daysSinceVisit !== null ? `（${daysSinceVisit}日前）` : ''}
              </Text>
            </View>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
      </TouchableOpacity>
    );
  }

  const filterKeys: FilterKey[] = ['all','line_linked','birthday_this_month','visited_this_month','inactive_60d'];
  const sortKeys: SortKey[] = ['recent_visit','recent_registered','name_kana'];

  return (
    <View style={styles.container}>
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="名前・カナ・電話番号・メールで検索"
            placeholderTextColor={COLORS.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {filterKeys.map((k) => (
            <TouchableOpacity
              key={k}
              style={[styles.chip, filter === k && styles.chipActive]}
              onPress={() => setFilter(k)}
            >
              <Text style={[styles.chipText, filter === k && styles.chipTextActive]}>{FILTER_LABELS[k]}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={styles.sortRow}>
          <Text style={styles.countText}>{filtered.length}名</Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {sortKeys.map((s) => (
              <TouchableOpacity
                key={s}
                style={[styles.sortChip, sort === s && styles.sortChipActive]}
                onPress={() => setSort(s)}
              >
                <Text style={[styles.sortChipText, sort === s && styles.sortChipTextActive]}>
                  {SORT_LABELS[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.user_id}
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
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text, padding: 0 },
  chipRow: { gap: 6, paddingRight: 8, paddingBottom: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive: { color: '#FFF' },
  sortRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 4, marginBottom: 4,
  },
  sortChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  sortChipActive: { backgroundColor: COLORS.accentLight },
  sortChipText: { fontSize: 10, color: COLORS.textLight },
  sortChipTextActive: { color: COLORS.accent, fontWeight: '700' },
  countText: { fontSize: 12, color: COLORS.textSecondary },
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  customerName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  lineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: '#06C75515', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
  },
  lineBadgeText: { fontSize: 8, fontWeight: '700', color: '#06C755' },
  customerKana: { fontSize: 11, color: COLORS.textLight, marginTop: 1 },
  detailRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  detailChip: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  detailText: { fontSize: 11, color: COLORS.textSecondary },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, color: COLORS.textLight },
});
