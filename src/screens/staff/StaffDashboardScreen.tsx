import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { useAuthStore } from '../../stores/authStore';
import { StoreSelector } from '../../components/layout/StoreSelector';
import { supabase } from '../../lib/supabase';

interface Stats {
  todayBookings: number;
  pendingOrders: number;
  totalCustomers: number;
  newCustomersThisMonth: number;
  pendingCounseling: number;
  unreadNotes: number;
  lowStock: number;
  birthdaysThisMonth: number;
}

export function StaffDashboardScreen() {
  const navigation = useNavigation<any>();
  const { selectedStore } = useStoreSelection();
  const profile = useAuthStore((s) => s.profile);
  const isAdmin = profile?.role === 'admin';
  const [stats, setStats] = useState<Stats>({
    todayBookings: 0, pendingOrders: 0, totalCustomers: 0,
    newCustomersThisMonth: 0, pendingCounseling: 0,
    unreadNotes: 0, lowStock: 0, birthdaysThisMonth: 0,
  });
  const [todayBookings, setTodayBookings] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchAll(); }, [selectedStore]);

  async function fetchAll() {
    setRefreshing(true);
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const thisMonth = new Date().getMonth() + 1;

    const [
      bookingsRes, ordersRes, customersRes, newCustRes, counselingRes, todayBookRes,
      notesRes, noteReadsRes, productsRes, birthdayRes,
    ] = await Promise.all([
      supabase.from('app_bookings').select('id', { count: 'exact', head: true })
        .eq('store_id', selectedStore).gte('starts_at', `${today}T00:00:00`).lte('starts_at', `${today}T23:59:59`).neq('status', 'cancelled'),
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'customer').gte('created_at', monthStart),
      supabase.from('counseling_sheets').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('app_bookings').select('*, treatment_menu:treatment_menus(name), profile:user_id(full_name, phone)')
        .eq('store_id', selectedStore).gte('starts_at', `${today}T00:00:00`).lte('starts_at', `${today}T23:59:59`)
        .neq('status', 'cancelled').order('starts_at'),
      supabase.from('staff_notes').select('id').order('created_at', { ascending: false }).limit(50),
      supabase.from('staff_note_reads').select('note_id').eq('staff_id', profile?.id ?? ''),
      supabase.from('products').select('id, stock_quantity, low_stock_threshold').eq('is_active', true),
      supabase.from('profiles').select('date_of_birth').eq('role', 'customer').not('date_of_birth', 'is', null),
    ]);

    // Unread notes count (authored by others, not yet read by me)
    const readIds = new Set((noteReadsRes.data ?? []).map((r: any) => r.note_id));
    const unreadNotes = (notesRes.data ?? []).filter((n: any) => !readIds.has(n.id)).length;

    // Low stock count
    const lowStock = (productsRes.data ?? []).filter((p: any) =>
      p.stock_quantity <= (p.low_stock_threshold ?? 5)
    ).length;

    // Birthdays this month
    const birthdaysThisMonth = (birthdayRes.data ?? []).filter((p: any) =>
      p.date_of_birth && (new Date(p.date_of_birth).getMonth() + 1) === thisMonth
    ).length;

    setStats({
      todayBookings: bookingsRes.count ?? 0,
      pendingOrders: ordersRes.count ?? 0,
      totalCustomers: customersRes.count ?? 0,
      newCustomersThisMonth: newCustRes.count ?? 0,
      pendingCounseling: counselingRes.count ?? 0,
      unreadNotes,
      lowStock,
      birthdaysThisMonth,
    });
    setTodayBookings(todayBookRes.data ?? []);
    setRefreshing(false);
  }

  const statCards: { label: string; value: number; icon: string; color: string; onPress?: () => void }[] = [
    { label: '本日の予約', value: stats.todayBookings, icon: 'calendar', color: COLORS.accent, onPress: () => navigation.navigate('BookingPrep', {}) },
    { label: '未処理の注文', value: stats.pendingOrders, icon: 'bag-handle', color: COLORS.warning, onPress: () => navigation.navigate('StaffOrderList') },
    { label: '総顧客数', value: stats.totalCustomers, icon: 'people', color: COLORS.success, onPress: () => navigation.navigate('CustomerList') },
    { label: '今月の新規', value: stats.newCustomersThisMonth, icon: 'person-add', color: COLORS.accentPink },
    { label: '今月の誕生日', value: stats.birthdaysThisMonth, icon: 'gift', color: COLORS.accentPink, onPress: () => navigation.navigate('BirthdayList') },
    { label: '申し送り未読', value: stats.unreadNotes, icon: 'chatbubbles', color: COLORS.accent, onPress: () => navigation.navigate('StaffNotes') },
    { label: '在庫警告', value: stats.lowStock, icon: 'alert-circle', color: stats.lowStock > 0 ? COLORS.error : COLORS.textLight, onPress: () => navigation.navigate('InventoryAlert') },
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

      {/* 予約・受付の管理（予約まわりはすべてここに集約） */}
      <Text style={styles.sectionHead}>予約・受付の管理</Text>
      <Text style={styles.sectionNote}>予約の確認・受付枠の設定はすべてこちら</Text>
      <View style={styles.quickActions}>
        <ActionCard icon="list-outline" label="予約一覧・確認" onPress={() => navigation.navigate('StaffBookingList')} />
        <ActionCard icon="today-outline" label="本日の準備シート" onPress={() => navigation.navigate('BookingPrep', {})} />
        <ActionCard icon="calendar-outline" label="週カレンダー" onPress={() => navigation.navigate('WeekCalendar')} />
        <ActionCard icon="time-outline" label="営業時間・定休日" onPress={() => navigation.navigate('StoreHours')} />
        <ActionCard icon="ban-outline" label="入れ替え・予定ブロック" onPress={() => navigation.navigate('StaffUnavailability')} />
        <ActionCard icon="people-circle-outline" label="スタッフ店舗配属" onPress={() => navigation.navigate('StaffRoster')} />
        <ActionCard icon="moon-outline" label="時間外リクエスト" onPress={() => navigation.navigate('AfterHoursAdmin')} />
        <ActionCard icon="card-outline" label="事前決済（前金）" onPress={() => navigation.navigate('DepositAdmin')} />
      </View>

      {/* Primary actions */}
      <Text style={styles.sectionHead}>業務メニュー</Text>
      <View style={styles.quickActions}>
        <ActionCard icon="chatbubbles-outline" label="申し送り" onPress={() => navigation.navigate('StaffNotes')} />
        <ActionCard icon="clipboard-outline" label="日次レポート" onPress={() => navigation.navigate('DailyReport', {})} />
        <ActionCard icon="book-outline" label="施術教材" onPress={() => navigation.navigate('PilatesLibrary')} />
      </View>

      <Text style={styles.sectionHead}>顧客・販促</Text>
      <View style={styles.quickActions}>
        <ActionCard icon="search-outline" label="顧客検索" onPress={() => navigation.navigate('CustomerList')} />
        <ActionCard icon="gift-outline" label="誕生日" onPress={() => navigation.navigate('BirthdayList')} />
        <ActionCard icon="person-remove-outline" label="離脱顧客" onPress={() => navigation.navigate('InactiveCustomers')} />
        <ActionCard icon="megaphone-outline" label="お知らせ" onPress={() => navigation.navigate('AnnouncementList')} />
        <ActionCard icon="ticket-outline" label="クーポン" onPress={() => navigation.navigate('CouponManagement')} />
        <ActionCard icon="share-social-outline" label="紹介管理" onPress={() => navigation.navigate('ReferralAdmin')} />
      </View>

      <Text style={styles.sectionHead}>売上・会計</Text>
      <View style={styles.quickActions}>
        <ActionCard icon="cash-outline" label="売上・明細" onPress={() => navigation.navigate('StaffRevenue')} />
        <ActionCard icon="card-outline" label="手売りレジ" onPress={() => navigation.navigate('WalkInSale')} />
        <ActionCard icon="receipt-outline" label="領収書" onPress={() => navigation.navigate('ReceiptList')} />
        <ActionCard icon="bag-outline" label="注文管理" onPress={() => navigation.navigate('StaffOrderList')} />
        <ActionCard icon="cube-outline" label="在庫管理" onPress={() => navigation.navigate('InventoryAlert')} />
        <ActionCard icon="pricetags-outline" label="物販商品管理" onPress={() => navigation.navigate('StaffProductList')} />
        <ActionCard icon="bar-chart-outline" label="メニュー分析" onPress={() => navigation.navigate('MenuAnalytics')} />
        <ActionCard icon="pricetag-outline" label="タグ別料金設定" onPress={() => navigation.navigate('MenuTagPricing')} />
      </View>

      <Text style={styles.sectionHead}>分析・連携</Text>
      <View style={styles.quickActions}>
        <ActionCard icon="stats-chart-outline" label="キャンセル分析" onPress={() => navigation.navigate('CancellationReport')} />
        <ActionCard icon="chatbubble-outline" label="LINE送信履歴" color="#06C755" onPress={() => navigation.navigate('LineNotificationLog')} />
        <ActionCard icon="people-circle-outline" label="グループLINE通知" color="#06C755" onPress={() => navigation.navigate('StaffLineGroup')} />
        <ActionCard icon="sync-outline" label="Airリザーブ" onPress={() => navigation.navigate('AirReserveSources')} />
        {isAdmin && (
          <ActionCard icon="people-outline" label="スタッフ登録" onPress={() => navigation.navigate('StaffRegistration')} />
        )}
      </View>

      {/* Today's bookings list */}
      <View style={styles.section}>
        <View style={styles.sectionTitleRow}>
          <Text style={styles.sectionTitle}>本日の予約</Text>
          <TouchableOpacity onPress={() => navigation.navigate('BookingPrep', {})}>
            <Text style={styles.sectionLink}>準備シート →</Text>
          </TouchableOpacity>
        </View>
        {todayBookings.length === 0 ? (
          <Text style={styles.emptyText}>本日の予約はありません</Text>
        ) : (
          todayBookings.map((b: any) => (
            <TouchableOpacity
              key={b.id}
              style={styles.bookingItem}
              onPress={() => navigation.navigate('BookingPrep', {})}
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

function ActionCard({ icon, label, onPress, color }: { icon: string; label: string; onPress: () => void; color?: string }) {
  return (
    <TouchableOpacity style={styles.quickAction} onPress={onPress}>
      <Ionicons name={icon as any} size={20} color={color ?? COLORS.accent} />
      <Text style={styles.quickActionText}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  heading: { fontSize: 20, fontWeight: '700', color: COLORS.text, paddingHorizontal: 20, marginBottom: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 20 },
  statCard: {
    width: '47%',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  statValue: { fontSize: 24, fontWeight: '700', color: COLORS.text },
  statLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  sectionHead: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, paddingHorizontal: 20, marginTop: 8, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionNote: { fontSize: 11, color: COLORS.textLight, paddingHorizontal: 20, marginTop: -4, marginBottom: 8 },
  quickActions: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8, marginBottom: 16 },
  quickAction: {
    width: '31%',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    paddingVertical: 12, paddingHorizontal: 4,
    alignItems: 'center',
    gap: 4,
    minHeight: 68,
    justifyContent: 'center',
  },
  quickActionText: { fontSize: 11, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  section: { paddingHorizontal: 20, marginBottom: 16 },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  sectionLink: { fontSize: 11, color: COLORS.accent, fontWeight: '600' },
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
