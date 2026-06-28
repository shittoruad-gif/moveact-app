// 誕生日リスト
// 今月・来月に誕生日を迎える顧客の一覧。LINE送信でお祝い
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

type MonthFilter = 'this' | 'next';

export function BirthdayListScreen() {
  const navigation = useNavigation<any>();
  const [all, setAll] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MonthFilter>('this');

  const now = new Date();
  const thisMonth = now.getMonth() + 1;
  const nextMonth = thisMonth === 12 ? 1 : thisMonth + 1;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, full_name_kana, phone, date_of_birth, line_user_id')
      .eq('role', 'customer')
      .not('date_of_birth', 'is', null);
    setAll(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const filtered = useMemo(() => {
    const target = filter === 'this' ? thisMonth : nextMonth;
    return all
      .filter((p) => {
        const m = new Date(p.date_of_birth).getMonth() + 1;
        return m === target;
      })
      .sort((a, b) => new Date(a.date_of_birth).getDate() - new Date(b.date_of_birth).getDate());
  }, [all, filter, thisMonth, nextMonth]);

  function calcAge(dobStr: string): number {
    const dob = new Date(dobStr);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const mDiff = today.getMonth() - dob.getMonth();
    if (mDiff < 0 || (mDiff === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {([
          { id: 'this', label: `今月 (${thisMonth}月)` },
          { id: 'next', label: `来月 (${nextMonth}月)` },
        ] as { id: MonthFilter; label: string }[]).map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
            onPress={() => setFilter(f.id)}
          >
            <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={COLORS.accent} />}
        contentContainerStyle={{ padding: 16 }}
      >
        <Text style={styles.count}>{filtered.length}名</Text>
        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="gift-outline" size={40} color={COLORS.textLight} />
            <Text style={styles.emptyText}>該当する顧客はいません</Text>
          </View>
        ) : (
          filtered.map((p) => {
            const dob = new Date(p.date_of_birth);
            const turnsAge = (filter === 'this' ? 0 : 0) + calcAge(p.date_of_birth) + 1;
            return (
              <View key={p.id} style={styles.row}>
                <View style={styles.dateCol}>
                  <Text style={styles.dateDay}>{dob.getDate()}</Text>
                  <Text style={styles.dateLabel}>日</Text>
                </View>
                <TouchableOpacity
                  style={styles.nameCol}
                  onPress={() => navigation.navigate('CustomerDetail', { userId: p.id })}
                >
                  <Text style={styles.name}>{p.full_name}</Text>
                  <Text style={styles.meta}>
                    今年{turnsAge}歳
                    {p.full_name_kana ? ` ・ ${p.full_name_kana}` : ''}
                  </Text>
                </TouchableOpacity>
                {p.line_user_id ? (
                  <TouchableOpacity
                    style={styles.lineBtn}
                    onPress={() => navigation.navigate('LineMessageCompose', { customerId: p.id })}
                  >
                    <Ionicons name="chatbubble" size={14} color="#06C755" />
                    <Text style={styles.lineBtnText}>LINE</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.noLineBadge}>
                    <Text style={styles.noLineText}>未連携</Text>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  filterRow: {
    flexDirection: 'row', gap: 6, padding: 16,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
    backgroundColor: COLORS.backgroundSoft, borderWidth: 1, borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  filterTextActive: { color: '#FFF' },
  count: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 12, marginBottom: 8,
  },
  dateCol: {
    backgroundColor: COLORS.accentLight, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 48,
  },
  dateDay: { fontSize: 20, fontWeight: '700', color: COLORS.accent },
  dateLabel: { fontSize: 9, color: COLORS.accent, marginTop: -2 },
  nameCol: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  meta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  lineBtn: {
    flexDirection: 'row', gap: 4, alignItems: 'center',
    backgroundColor: '#06C75515',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
  },
  lineBtnText: { fontSize: 11, fontWeight: '700', color: '#06C755' },
  noLineBadge: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
    backgroundColor: COLORS.backgroundSoft,
  },
  noLineText: { fontSize: 10, color: COLORS.textLight, fontWeight: '600' },
  emptyCard: { alignItems: 'center', padding: 40, gap: 10 },
  emptyText: { fontSize: 13, color: COLORS.textLight },
});
