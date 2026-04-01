import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TREATMENT_TYPES } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { StoreSelector } from '../../components/layout/StoreSelector';
import { useTickets } from '../../hooks/useTickets';
import type { UserTicket } from '../../types/database';

export function TicketDashboardScreen() {
  const navigation = useNavigation<any>();
  const { tickets, isLoading, refetch } = useTickets();

  function renderTicket({ item }: { item: UserTicket }) {
    const treatmentName = item.ticket_plan
      ? TREATMENT_TYPES[item.ticket_plan.treatment_type] ?? item.ticket_plan.treatment_type
      : '';
    const expiresDate = new Date(item.expires_at);
    const daysLeft = Math.ceil((expiresDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const isExpiringSoon = daysLeft <= 14;
    const progress = item.remaining_sessions / item.total_sessions;

    return (
      <View style={styles.ticketCard}>
        <View style={styles.ticketHeader}>
          <Text style={styles.ticketName}>{item.ticket_plan?.name ?? '回数券'}</Text>
          <Text style={styles.treatmentType}>{treatmentName}</Text>
        </View>

        <View style={styles.progressSection}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
          <View style={styles.sessionsRow}>
            <Text style={styles.remainingLabel}>残り</Text>
            <Text style={styles.remainingNumber}>{item.remaining_sessions}</Text>
            <Text style={styles.totalSessions}> / {item.total_sessions}回</Text>
          </View>
        </View>

        <View style={styles.ticketFooter}>
          <Ionicons name="time-outline" size={13} color={isExpiringSoon ? COLORS.warning : COLORS.textLight} />
          <Text style={[styles.expiryText, isExpiringSoon && styles.expiryWarning]}>
            {expiresDate.toLocaleDateString('ja-JP')}まで
            {isExpiringSoon && ` (残り${daysLeft}日)`}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StoreSelector />
      <FlatList
        data={tickets}
        keyExtractor={(item) => item.id}
        renderItem={renderTicket}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={COLORS.accent} />}
        ListHeaderComponent={
          <View style={styles.actions}>
            <Button
              title="回数券を購入"
              onPress={() => navigation.navigate('TicketPurchase')}
              size="medium"
              variant="secondary"
            />
            <Button
              title="サブスクプラン"
              onPress={() => navigation.navigate('Subscription')}
              variant="outline"
              size="medium"
            />
          </View>
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="ticket-outline" size={32} color={COLORS.accentPink} />
              </View>
              <Text style={styles.emptyTitle}>回数券がありません</Text>
              <Text style={styles.emptyText}>
                回数券を購入すると{'\n'}お得にレッスンを受けられます
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: 20 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  ticketCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  ticketName: { fontSize: 16, fontWeight: '600', color: COLORS.text, letterSpacing: 0.3 },
  treatmentType: {
    fontSize: 11,
    color: COLORS.accent,
    fontWeight: '500',
    backgroundColor: COLORS.accentLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    letterSpacing: 0.3,
  },
  progressSection: { marginBottom: 14 },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.backgroundSoft,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: { height: '100%', backgroundColor: COLORS.accent, borderRadius: 3 },
  sessionsRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end' },
  remainingLabel: { fontSize: 12, color: COLORS.textSecondary, marginRight: 4 },
  remainingNumber: { fontSize: 22, fontWeight: '300', color: COLORS.accent },
  totalSessions: { fontSize: 12, color: COLORS.textLight },
  ticketFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.borderLight,
    paddingTop: 12,
  },
  expiryText: { fontSize: 12, color: COLORS.textLight },
  expiryWarning: { color: COLORS.warning, fontWeight: '500' },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#F5E8E8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  emptyText: { fontSize: 13, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 20 },
});
