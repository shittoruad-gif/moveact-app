import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { COLORS } from '../../lib/constants';
import { useTickets } from '../../hooks/useTickets';
import { Ionicons } from '@expo/vector-icons';
import type { TicketPlan } from '../../types/database';

export function TicketPurchaseScreen() {
  const { plans } = useTickets();

  function renderPlan({ item }: { item: TicketPlan }) {
    return (
      <View style={styles.planCard}>
        <View style={styles.planHeader}>
          <Text style={styles.planName}>{item.name}</Text>
          {item.bonus_description && (
            <View style={styles.bonusBadge}>
              <Ionicons name="gift-outline" size={12} color={COLORS.accent} />
              <Text style={styles.bonusText}>{item.bonus_description}</Text>
            </View>
          )}
        </View>

        <Text style={styles.universalNote}>全メニュー対応</Text>

        <View style={styles.planDetails}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>回数</Text>
            <Text style={styles.detailValue}>{item.total_sessions}回</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>有効期間</Text>
            <Text style={styles.detailValue}>{item.validity_days}日</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>1回あたり</Text>
            <Text style={styles.detailValue}>¥{item.price_per_session.toLocaleString()}</Text>
          </View>
        </View>

        <View style={styles.planPricing}>
          <Text style={styles.totalPrice}>¥{item.price.toLocaleString()}</Text>
          <Text style={styles.taxNote}>(税込)</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={plans}
        keyExtractor={(item) => item.id}
        renderItem={renderPlan}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <Text style={styles.header}>回数券プラン</Text>
            <Text style={styles.note}>
              どのメニューでもご利用いただける共通回数券です。{'\n'}
              ご購入は店舗にて承っております。
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  list: {
    padding: 16,
  },
  header: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  note: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  planCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  planName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  bonusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FDF5ED',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  bonusText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.accent,
  },
  universalNote: {
    fontSize: 12,
    color: COLORS.success,
    fontWeight: '500',
    marginBottom: 12,
  },
  planDetails: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  detailItem: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: COLORS.textLight,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  planPricing: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  totalPrice: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.primary,
  },
  taxNote: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
});
