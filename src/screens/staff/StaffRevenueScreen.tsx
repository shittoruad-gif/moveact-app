import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, Share, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';

interface RevenueItem {
  staff_id: string;
  staff_name: string;
  commission_rate: number;
  booking_date: string;
  menu_name: string;
  customer_name: string;
  price: number;
  commission: number;
}

interface StaffSummary {
  staffId: string;
  staffName: string;
  commissionRate: number;
  sessionCount: number;
  grossRevenue: number;
  commissionTotal: number;
}

export function StaffRevenueScreen() {
  const profile = useAuthStore((s) => s.profile);
  const isAdmin = profile?.role === 'admin';

  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [items, setItems] = useState<RevenueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'summary' | 'detail' | 'invoice'>('summary');

  useEffect(() => { fetchRevenue(); }, [year, month, selectedStaff]);

  async function fetchRevenue() {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_staff_revenue', {
      p_staff_id: selectedStaff ?? undefined,
      p_year: year,
      p_month: month,
    });
    if (error) {
      console.error(error);
      setItems([]);
    } else {
      setItems((data as RevenueItem[]) ?? []);
    }
    setLoading(false);
  }

  // Build staff summaries
  const staffMap = new Map<string, StaffSummary>();
  items.forEach((item) => {
    const existing = staffMap.get(item.staff_id);
    if (existing) {
      existing.sessionCount += 1;
      existing.grossRevenue += item.price;
      existing.commissionTotal += item.commission;
    } else {
      staffMap.set(item.staff_id, {
        staffId: item.staff_id,
        staffName: item.staff_name,
        commissionRate: item.commission_rate,
        sessionCount: 1,
        grossRevenue: item.price,
        commissionTotal: item.commission,
      });
    }
  });
  const summaries = Array.from(staffMap.values()).sort((a, b) => b.grossRevenue - a.grossRevenue);

  const totalGross = summaries.reduce((s, x) => s + x.grossRevenue, 0);
  const totalCommission = summaries.reduce((s, x) => s + x.commissionTotal, 0);
  const totalSessions = summaries.reduce((s, x) => s + x.sessionCount, 0);

  // For detail/invoice: filter items by selectedStaff (or show all for admin)
  const detailItems = selectedStaff
    ? items.filter((i) => i.staff_id === selectedStaff)
    : items;

  const selectedSummary = selectedStaff ? staffMap.get(selectedStaff) : null;

  function changeMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setYear(y);
    setMonth(m);
  }

  async function shareInvoice() {
    const target = selectedSummary;
    if (!target) return;

    const lines = [
      `請求書 / 業務委託報酬明細`,
      ``,
      `対象期間: ${year}年${month}月`,
      `スタッフ名: ${target.staffName}`,
      `歩合率: ${Math.round(target.commissionRate * 100)}%`,
      ``,
      `--- 明細 ---`,
      ...detailItems.map((item) => {
        const d = new Date(item.booking_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
        return `${d} | ${item.menu_name} | ${item.customer_name} | ${item.price.toLocaleString()}円 | 報酬 ${item.commission.toLocaleString()}円`;
      }),
      ``,
      `--- 合計 ---`,
      `施術回数: ${target.sessionCount}回`,
      `売上合計: ${target.grossRevenue.toLocaleString()}円`,
      `報酬合計: ${target.commissionTotal.toLocaleString()}円`,
      ``,
      `発行日: ${new Date().toLocaleDateString('ja-JP')}`,
    ];

    try {
      await Share.share({ message: lines.join('\n') });
    } catch {
      Alert.alert('エラー', '共有に失敗しました');
    }
  }

  function renderMonthSelector() {
    return (
      <View style={styles.monthSelector}>
        <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.monthArrow}>
          <Ionicons name="chevron-back" size={20} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.monthText}>{year}年{month}月</Text>
        <TouchableOpacity onPress={() => changeMonth(1)} style={styles.monthArrow}>
          <Ionicons name="chevron-forward" size={20} color={COLORS.text} />
        </TouchableOpacity>
      </View>
    );
  }

  function renderViewTabs() {
    const tabs: { key: typeof viewMode; label: string }[] = [
      { key: 'summary', label: '概要' },
      { key: 'detail', label: '明細' },
      { key: 'invoice', label: '請求書' },
    ];
    return (
      <View style={styles.tabRow}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, viewMode === tab.key && styles.tabActive]}
            onPress={() => setViewMode(tab.key)}
          >
            <Text style={[styles.tabText, viewMode === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function renderStaffFilter() {
    if (!isAdmin) return null;
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        <TouchableOpacity
          style={[styles.filterChip, !selectedStaff && styles.filterChipActive]}
          onPress={() => setSelectedStaff(null)}
        >
          <Text style={[styles.filterChipText, !selectedStaff && styles.filterChipTextActive]}>全員</Text>
        </TouchableOpacity>
        {summaries.map((s) => (
          <TouchableOpacity
            key={s.staffId}
            style={[styles.filterChip, selectedStaff === s.staffId && styles.filterChipActive]}
            onPress={() => setSelectedStaff(s.staffId)}
          >
            <Text style={[styles.filterChipText, selectedStaff === s.staffId && styles.filterChipTextActive]}>
              {s.staffName}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  function renderSummary() {
    const displaySummaries = selectedStaff ? summaries.filter((s) => s.staffId === selectedStaff) : summaries;

    return (
      <View>
        {/* Totals */}
        <View style={styles.totalsCard}>
          <View style={styles.totalItem}>
            <Text style={styles.totalLabel}>売上合計</Text>
            <Text style={styles.totalValue}>{(selectedStaff ? (selectedSummary?.grossRevenue ?? 0) : totalGross).toLocaleString()}円</Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalItem}>
            <Text style={styles.totalLabel}>報酬合計</Text>
            <Text style={[styles.totalValue, { color: COLORS.accent }]}>
              {(selectedStaff ? (selectedSummary?.commissionTotal ?? 0) : totalCommission).toLocaleString()}円
            </Text>
          </View>
          <View style={styles.totalDivider} />
          <View style={styles.totalItem}>
            <Text style={styles.totalLabel}>施術数</Text>
            <Text style={styles.totalValue}>{selectedStaff ? (selectedSummary?.sessionCount ?? 0) : totalSessions}回</Text>
          </View>
        </View>

        {/* Per-staff breakdown (admin only, no filter selected) */}
        {displaySummaries.map((s) => (
          <TouchableOpacity
            key={s.staffId}
            style={styles.staffCard}
            onPress={() => { setSelectedStaff(s.staffId); setViewMode('detail'); }}
          >
            <View style={styles.staffCardHeader}>
              <View style={styles.staffAvatar}>
                <Text style={styles.staffAvatarText}>{s.staffName.charAt(0)}</Text>
              </View>
              <View style={styles.staffCardInfo}>
                <Text style={styles.staffCardName}>{s.staffName}</Text>
                <Text style={styles.staffCardRate}>歩合率: {Math.round(s.commissionRate * 100)}%</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
            </View>
            <View style={styles.staffCardStats}>
              <View style={styles.staffStat}>
                <Text style={styles.staffStatLabel}>売上</Text>
                <Text style={styles.staffStatValue}>{s.grossRevenue.toLocaleString()}円</Text>
              </View>
              <View style={styles.staffStat}>
                <Text style={styles.staffStatLabel}>報酬</Text>
                <Text style={[styles.staffStatValue, { color: COLORS.accent }]}>{s.commissionTotal.toLocaleString()}円</Text>
              </View>
              <View style={styles.staffStat}>
                <Text style={styles.staffStatLabel}>施術数</Text>
                <Text style={styles.staffStatValue}>{s.sessionCount}回</Text>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function renderDetail() {
    if (detailItems.length === 0) {
      return (
        <View style={styles.empty}>
          <Ionicons name="receipt-outline" size={40} color={COLORS.borderLight} />
          <Text style={styles.emptyText}>この月の明細はありません</Text>
        </View>
      );
    }

    return (
      <View>
        {detailItems.map((item, idx) => {
          const d = new Date(item.booking_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
          return (
            <View key={idx} style={styles.detailRow}>
              <View style={styles.detailDate}>
                <Text style={styles.detailDateText}>{d}</Text>
              </View>
              <View style={styles.detailInfo}>
                <Text style={styles.detailMenu}>{item.menu_name}</Text>
                <Text style={styles.detailCustomer}>{item.customer_name ?? '---'}</Text>
                {isAdmin && <Text style={styles.detailStaff}>{item.staff_name}</Text>}
              </View>
              <View style={styles.detailPrices}>
                <Text style={styles.detailPrice}>{item.price.toLocaleString()}円</Text>
                <Text style={styles.detailCommission}>{item.commission.toLocaleString()}円</Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  }

  function renderInvoice() {
    const target = selectedStaff ? selectedSummary : (summaries.length === 1 ? summaries[0] : null);

    if (!target) {
      return (
        <View style={styles.invoicePrompt}>
          <Ionicons name="document-text-outline" size={40} color={COLORS.borderLight} />
          <Text style={styles.invoicePromptText}>
            スタッフを選択して請求書を表示してください
          </Text>
        </View>
      );
    }

    const invoiceItems = selectedStaff
      ? items.filter((i) => i.staff_id === selectedStaff)
      : items;

    return (
      <View>
        {/* Invoice header */}
        <View style={styles.invoiceCard}>
          <Text style={styles.invoiceTitle}>請求書 / 業務委託報酬明細</Text>
          <View style={styles.invoiceMeta}>
            <View style={styles.invoiceMetaRow}>
              <Text style={styles.invoiceMetaLabel}>対象期間</Text>
              <Text style={styles.invoiceMetaValue}>{year}年{month}月</Text>
            </View>
            <View style={styles.invoiceMetaRow}>
              <Text style={styles.invoiceMetaLabel}>スタッフ名</Text>
              <Text style={styles.invoiceMetaValue}>{target.staffName}</Text>
            </View>
            <View style={styles.invoiceMetaRow}>
              <Text style={styles.invoiceMetaLabel}>歩合率</Text>
              <Text style={styles.invoiceMetaValue}>{Math.round(target.commissionRate * 100)}%</Text>
            </View>
            <View style={styles.invoiceMetaRow}>
              <Text style={styles.invoiceMetaLabel}>発行日</Text>
              <Text style={styles.invoiceMetaValue}>{new Date().toLocaleDateString('ja-JP')}</Text>
            </View>
          </View>

          {/* Invoice table header */}
          <View style={styles.invoiceTableHeader}>
            <Text style={[styles.invoiceTableHeaderText, { flex: 1 }]}>日付</Text>
            <Text style={[styles.invoiceTableHeaderText, { flex: 2 }]}>施術内容</Text>
            <Text style={[styles.invoiceTableHeaderText, { flex: 1, textAlign: 'right' }]}>売上</Text>
            <Text style={[styles.invoiceTableHeaderText, { flex: 1, textAlign: 'right' }]}>報酬</Text>
          </View>

          {/* Invoice rows */}
          {invoiceItems.map((item, idx) => {
            const d = new Date(item.booking_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' });
            return (
              <View key={idx} style={styles.invoiceTableRow}>
                <Text style={[styles.invoiceTableCell, { flex: 1 }]}>{d}</Text>
                <Text style={[styles.invoiceTableCell, { flex: 2 }]}>{item.menu_name}</Text>
                <Text style={[styles.invoiceTableCell, { flex: 1, textAlign: 'right' }]}>{item.price.toLocaleString()}</Text>
                <Text style={[styles.invoiceTableCell, { flex: 1, textAlign: 'right' }]}>{item.commission.toLocaleString()}</Text>
              </View>
            );
          })}

          {/* Invoice totals */}
          <View style={styles.invoiceTotalRow}>
            <Text style={styles.invoiceTotalLabel}>施術回数</Text>
            <Text style={styles.invoiceTotalValue}>{target.sessionCount}回</Text>
          </View>
          <View style={styles.invoiceTotalRow}>
            <Text style={styles.invoiceTotalLabel}>売上合計</Text>
            <Text style={styles.invoiceTotalValue}>{target.grossRevenue.toLocaleString()}円</Text>
          </View>
          <View style={[styles.invoiceTotalRow, styles.invoiceGrandTotal]}>
            <Text style={styles.invoiceGrandTotalLabel}>報酬合計（税込）</Text>
            <Text style={styles.invoiceGrandTotalValue}>{target.commissionTotal.toLocaleString()}円</Text>
          </View>
        </View>

        {/* Share button */}
        <TouchableOpacity style={styles.shareBtn} onPress={shareInvoice}>
          <Ionicons name="share-outline" size={18} color="#FFF" />
          <Text style={styles.shareBtnText}>テキストで共有</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FlatList
      data={[1]} // single-item list to enable pull-to-refresh
      keyExtractor={() => 'content'}
      renderItem={() => (
        <View style={styles.content}>
          {renderMonthSelector()}
          {renderStaffFilter()}
          {renderViewTabs()}
          {viewMode === 'summary' && renderSummary()}
          {viewMode === 'detail' && renderDetail()}
          {viewMode === 'invoice' && renderInvoice()}
          <View style={{ height: 40 }} />
        </View>
      )}
      style={styles.container}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchRevenue} tintColor={COLORS.accent} />}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { paddingBottom: 32 },

  // Month selector
  monthSelector: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 20,
  },
  monthArrow: { padding: 8 },
  monthText: { fontSize: 17, fontWeight: '700', color: COLORS.text },

  // Staff filter
  filterScroll: { marginBottom: 8 },
  filterContent: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 20, backgroundColor: COLORS.backgroundSoft,
  },
  filterChipActive: { backgroundColor: COLORS.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  filterChipTextActive: { color: '#FFF' },

  // View tabs
  tabRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 14 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.backgroundSoft, alignItems: 'center' },
  tabActive: { backgroundColor: COLORS.accent },
  tabText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  tabTextActive: { color: '#FFF' },

  // Totals card
  totalsCard: {
    flexDirection: 'row', backgroundColor: COLORS.surface, borderRadius: 14,
    marginHorizontal: 16, padding: 16, marginBottom: 14,
  },
  totalItem: { flex: 1, alignItems: 'center' },
  totalDivider: { width: 0.5, backgroundColor: COLORS.borderLight },
  totalLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 4 },
  totalValue: { fontSize: 18, fontWeight: '700', color: COLORS.text },

  // Staff card
  staffCard: {
    backgroundColor: COLORS.surface, borderRadius: 14,
    marginHorizontal: 16, padding: 16, marginBottom: 10,
  },
  staffCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  staffAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.accentLight,
    justifyContent: 'center', alignItems: 'center',
  },
  staffAvatarText: { fontSize: 16, fontWeight: '500', color: COLORS.accent },
  staffCardInfo: { flex: 1, marginLeft: 12 },
  staffCardName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  staffCardRate: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  staffCardStats: { flexDirection: 'row', gap: 12 },
  staffStat: { flex: 1, backgroundColor: COLORS.backgroundSoft, borderRadius: 10, padding: 10, alignItems: 'center' },
  staffStatLabel: { fontSize: 10, color: COLORS.textSecondary, marginBottom: 4 },
  staffStatValue: { fontSize: 15, fontWeight: '700', color: COLORS.text },

  // Detail rows
  detailRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 10,
    marginHorizontal: 16, padding: 12, marginBottom: 6, gap: 10,
  },
  detailDate: { minWidth: 44, alignItems: 'center' },
  detailDateText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  detailInfo: { flex: 1 },
  detailMenu: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  detailCustomer: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  detailStaff: { fontSize: 10, color: COLORS.textLight, marginTop: 1 },
  detailPrices: { alignItems: 'flex-end' },
  detailPrice: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  detailCommission: { fontSize: 11, color: COLORS.accent, marginTop: 2 },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, color: COLORS.textLight },

  // Invoice prompt
  invoicePrompt: { alignItems: 'center', paddingVertical: 60, gap: 12, paddingHorizontal: 40 },
  invoicePromptText: { fontSize: 14, color: COLORS.textLight, textAlign: 'center' },

  // Invoice card
  invoiceCard: {
    backgroundColor: COLORS.surface, borderRadius: 14,
    marginHorizontal: 16, padding: 20, marginBottom: 14,
  },
  invoiceTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, textAlign: 'center', marginBottom: 16 },
  invoiceMeta: { marginBottom: 16 },
  invoiceMetaRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: COLORS.borderLight,
  },
  invoiceMetaLabel: { fontSize: 13, color: COLORS.textSecondary },
  invoiceMetaValue: { fontSize: 13, fontWeight: '500', color: COLORS.text },
  invoiceTableHeader: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, marginBottom: 4,
  },
  invoiceTableHeaderText: { fontSize: 11, fontWeight: '700', color: COLORS.textSecondary },
  invoiceTableRow: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.borderLight,
  },
  invoiceTableCell: { fontSize: 12, color: COLORS.text },
  invoiceTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 8, paddingHorizontal: 4,
  },
  invoiceTotalLabel: { fontSize: 13, color: COLORS.textSecondary },
  invoiceTotalValue: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  invoiceGrandTotal: {
    borderTopWidth: 1.5, borderTopColor: COLORS.text,
    marginTop: 4, paddingTop: 12,
  },
  invoiceGrandTotalLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  invoiceGrandTotalValue: { fontSize: 18, fontWeight: '700', color: COLORS.accent },

  // Share button
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 12,
    marginHorizontal: 16, paddingVertical: 14,
  },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
