import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { StoreSelector } from '../../components/layout/StoreSelector';
import { supabase } from '../../lib/supabase';

interface Stats {
  todayBookings: number;
  pendingOrders: number;
  totalCustomers: number;
  newCustomersThisMonth: number;
  pendingCounseling: number;
}

export function StaffDashboardScreen() {
  const navigation = useNavigation<any>();
  const { selectedStore } = useStoreSelection();
  const [stats, setStats] = useState<Stats>({
    todayBookings: 0, pendingOrders: 0, totalCustomers: 0,
    newCustomersThisMonth: 0, pendingCounseling: 0,
  });
  const [todayBookings, setTodayBookings] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchAll(); }, [selectedStore]);

  async function fetchAll() {
    setRefreshing(true);
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const [bookingsRes, ordersRes, customersRes, newCustRes, counselingRes, todayBookRes] = await Promise.all([
      supabase.from('app_bookings').select('id', { count: 'exact', head: true })
        .eq('store_id', selectedStore).gte('starts_at', `${today}T00:00:00`).lte('starts_at', `${today}T23:59:59`).neq('status', 'cancelled'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer').gte('created_at', monthStart),
      supabase.from('counseling_sheets').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('app_bookings').select('*, treatment_menu:treatment_menus(name), profile:profiles(full_name, phone)')
        .eq('store_id', selectedStore).gte('starts_at', `${today}T00:00:00`).lte('starts_at', `${today}T23:59:59`)
        .neq('status', 'cancelled').order('starts_at'),
    ]);

    setStats({
      todayBookings: bookingsRes.count ?? 0,
      pendingOrders: ordersRes.count ?? 0,
      totalCustomers: customersRes.count ?? 0,
      newCustomersThisMonth: newCustRes.count ?? 0,
      pendingCounseling: counselingRes.count ?? 0,
    });
    setTodayBookings(todayBookRes.data ?? []);
    setRefreshing(false);
  }

  const statCards: { label: string; value: number; icon: string; color: string; onPress?: () => void }[] = [
    { label: '本日の予約', value: stats.todayBookings, icon: 'calendar', color: COLORS.accent, onPress: () => navigation.navigate('StaffBookingList') },
    { label: '未処理の注文', value: stats.pendingOrders, icon: 'bag-handle', color: COLORS.warning, onPress: () => navigation.navigate('StaffOrderList') },
    { label: '総顧客数', value: stats.totalCustomers, icon: 'people', color: COLORS.success, onPress: () => navigation.navigate('CustomerList') },
    { label: '今月の新規', value: stats.newCustomersThisMonth, icon: 'person-add', color: COLORS.accentPink },
    { label: '未記入カウンセリング', value: stats.pendingCounseling, icon: 'document-text', color: COLORS.error },
  ];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchAll} tintColor={COLORS.accent} />}
    >
      <StoreSelector />

      <Text style={styles.heading}>スタッフダッシュボード</Text>

      {/* Stats grid */}
      <View style={styles.statsGrid}>
        {statCards.map((s) => (
          <TouchableOpacity
            key={s.label}
            style={styles.statCard}
            onPress={s.onPress}
            disabled={!s.onPress}
            activeOpacity={s.onPress ? 0.7 : 1}
          >
            <Ionicons name={s.icon as any} size={22} color={s.color} />
            <Text style={styles.statValue}>{s.value}</Text>
            <Text style={styles.statLabel}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity style={styles.quickAction} onPress={() => navigation.navigate('CustomerList')}>
          <Ionicons name="search-outline" size={20} color={COLORS.accent} />
          <Text style={styles.quickActionText}>顧客検索</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => navigation.navigate('StaffBookingList')}>
          <Ionicons name="list-outline" size={20} color={COLORS.accent} />
          <Text style={styles.quickActionText}>予約一覧</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => navigation.navigate('StaffOrderList')}>
          <Ionicons name="bag-outline" size={20} color={COLORS.accent} />
          <Text style={styles.quickActionText}>注文管理</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickAction} onPress={() => navigation.navigate('StaffRevenue')}>
          <Ionicons name="cash-outline" size={20} color={COLORS.accent} />
          <Text style={styles.quickActionText}>売上・明細</Text>
        </TouchableOpacity>
      </View>

      {/* Today's bookings list */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>本日の予約</Text>
        {todayBookings.length === 0 ? (
          <Text style={styles.emptyText}>本日の予約はありません</Text>
        ) : (
          todayBookings.map((b: any) => (
            <TouchableOpacity
              key={b.id}
              style={styles.bookingItem}
              onPress={() => navigation.navigate('StaffBookingDetail', { bookingId: b.id })}
            >
              <View style={styles.bookingTime}>
                <Text style={styles.bookingTimeText}>
                  {new Date(b.starts_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              <View style={styles.bookingInfo}>
                <Text style={styles.bookingName}>{b.profile?.full_name ?? '---'}</Text>
                <Text style={styles.bookingMenu}>{b.treatment_menu?.name ?? ''}</Text>
              </View>
              <View style={[styles.statusDot, { backgroundColor: b.status === 'confirmed' ? COLORS.success : COLORS.textLight }]} />
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  heading: { fontSize: 20, fontWeight: '700', color: COLORS.text, paddingHorizontal: 20, marginBottom: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, marginBottom: 20 },
  statCard: {
    width: '47%',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    gap: 6,
  },
  statValue: { fontSize: 28, fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 10, marginBottom: 24 },
  quickAction: {
    width: '47%',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
  },
  quickActionText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  section: { paddingHorizontal: 20, marginBottom: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 10 },
  emptyText: { fontSize: 13, color: COLORS.textLight, paddingVertical: 16 },
  bookingItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  bookingTime: {
    backgroundColor: COLORS.accentLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  bookingTimeText: { fontSize: 14, fontWeight: '700', color: COLORS.accent },
  bookingInfo: { flex: 1 },
  bookingName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  bookingMenu: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
});
