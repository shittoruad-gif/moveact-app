import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, RefreshControl,
  TouchableOpacity, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import type { LineMessageType, LineNotificationLog } from '../../types/database';

type LogRow = LineNotificationLog & {
  profile?: { full_name: string | null; phone?: string | null } | null;
  booking?: { starts_at: string; store_id: string } | null;
};

const STATUS_FILTERS: Array<'all' | 'sent' | 'failed' | 'skipped'> = [
  'all', 'sent', 'failed', 'skipped',
];

const TYPE_LABELS: Record<LineMessageType, string> = {
  booking_created: '予約作成',
  booking_reminder: 'リマインド',
  booking_cancelled: 'キャンセル',
  booking_rescheduled: '変更',
  custom: 'その他',
};

const STATUS_LABELS: Record<string, string> = {
  sent: '送信済み',
  failed: '失敗',
  skipped: 'スキップ',
};

export function LineNotificationLogScreen() {
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'sent' | 'failed' | 'skipped'>('all');
  const [selected, setSelected] = useState<LogRow | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('line_notification_log')
      .select(`
        *,
        profile:profiles(full_name, phone),
        booking:app_bookings(starts_at, store_id)
      `)
      .order('sent_at', { ascending: false })
      .limit(200);

    if (filter !== 'all') query = query.eq('status', filter);

    const { data } = await query;
    setLogs((data ?? []) as LogRow[]);
    setLoading(false);
  }, [filter]);

  useFocusEffect(
    useCallback(() => {
      fetchLogs();
    }, [fetchLogs])
  );

  useEffect(() => { fetchLogs(); }, [filter, fetchLogs]);

  function renderRow({ item }: { item: LogRow }) {
    const date = new Date(item.sent_at);
    const dateStr = date.toLocaleString('ja-JP', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
    const typeLabel = TYPE_LABELS[item.message_type] ?? item.message_type;

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => setSelected(item)}
        activeOpacity={0.7}
      >
        <View style={[styles.statusPill, pillStyle(item.status)]}>
          <Text style={[styles.statusPillText, pillTextStyle(item.status)]}>
            {STATUS_LABELS[item.status] ?? item.status}
          </Text>
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowHeader}>
            <Text style={styles.customerName}>
              {item.profile?.full_name ?? '（顧客不明）'}
            </Text>
            <Text style={styles.typeLabel}>{typeLabel}</Text>
          </View>
          <Text style={styles.rowDate}>{dateStr}</Text>
          {item.error_message && (
            <Text style={styles.rowError} numberOfLines={1}>
              {item.error_message}
            </Text>
          )}
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
      </TouchableOpacity>
    );
  }

  // Stats at top
  const counts = {
    sent: logs.filter((l) => l.status === 'sent').length,
    failed: logs.filter((l) => l.status === 'failed').length,
    skipped: logs.filter((l) => l.status === 'skipped').length,
  };

  return (
    <View style={styles.container}>
      {/* Stats bar */}
      <View style={styles.statsBar}>
        <StatChip label="送信" value={counts.sent} color="#06C755" />
        <StatChip label="失敗" value={counts.failed} color={COLORS.error} />
        <StatChip label="スキップ" value={counts.skipped} color={COLORS.textLight} />
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f === 'all' ? 'すべて' : STATUS_LABELS[f] ?? f}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={logs}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={fetchLogs} tintColor={COLORS.accent} />
        }
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <Ionicons name="chatbubbles-outline" size={32} color={COLORS.textLight} />
            <Text style={styles.emptyText}>LINE送信履歴はまだありません</Text>
          </View>
        ) : null}
      />

      {/* Detail modal */}
      <Modal
        visible={!!selected}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelected(null)}
      >
        {selected && <DetailModal log={selected} onClose={() => setSelected(null)} />}
      </Modal>
    </View>
  );
}

function DetailModal({ log, onClose }: { log: LogRow; onClose: () => void }) {
  const date = new Date(log.sent_at);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={styles.modalHeader}>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <Ionicons name="close" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.modalTitle}>送信詳細</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }}>
        <DetailRow label="顧客" value={log.profile?.full_name ?? '（不明）'} />
        <DetailRow label="タイプ" value={TYPE_LABELS[log.message_type] ?? log.message_type} />
        <DetailRow
          label="ステータス"
          value={STATUS_LABELS[log.status] ?? log.status}
          valueColor={log.status === 'sent' ? '#06C755' : log.status === 'failed' ? COLORS.error : COLORS.textLight}
        />
        <DetailRow label="送信日時" value={date.toLocaleString('ja-JP')} />
        {log.booking && (
          <DetailRow
            label="対象予約"
            value={new Date(log.booking.starts_at).toLocaleString('ja-JP')}
          />
        )}
        {log.line_user_id && (
          <DetailRow label="LINE User ID" value={log.line_user_id} monospace />
        )}
        {log.error_message && (
          <View style={styles.errorBlock}>
            <Text style={styles.errorBlockLabel}>エラー内容</Text>
            <Text style={styles.errorBlockText}>{log.error_message}</Text>
          </View>
        )}
        {log.payload && (
          <View style={styles.payloadBlock}>
            <Text style={styles.payloadLabel}>送信ペイロード</Text>
            <Text style={styles.payloadText}>
              {JSON.stringify(log.payload, null, 2)}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function DetailRow({
  label, value, valueColor, monospace,
}: { label: string; value: string; valueColor?: string; monospace?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          valueColor ? { color: valueColor } : null,
          monospace ? { fontFamily: 'monospace' as any, fontSize: 11 } : null,
        ]}
        selectable
      >
        {value}
      </Text>
    </View>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statChip}>
      <View style={[styles.statDot, { backgroundColor: color }]} />
      <Text style={styles.statChipLabel}>{label}</Text>
      <Text style={[styles.statChipValue, { color }]}>{value}</Text>
    </View>
  );
}

function pillStyle(status: string) {
  switch (status) {
    case 'sent': return { backgroundColor: '#06C75515' };
    case 'failed': return { backgroundColor: COLORS.error + '15' };
    case 'skipped': return { backgroundColor: COLORS.textLight + '15' };
    default: return {};
  }
}
function pillTextStyle(status: string) {
  switch (status) {
    case 'sent': return { color: '#06C755' };
    case 'failed': return { color: COLORS.error };
    case 'skipped': return { color: COLORS.textLight };
    default: return {};
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  statsBar: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12, gap: 8,
  },
  statChip: {
    flex: 1, backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 10, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statChipLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  statChipValue: { fontSize: 16, fontWeight: '700', marginLeft: 'auto' },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: COLORS.surface,
  },
  filterChipActive: { backgroundColor: COLORS.accent },
  filterChipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  filterChipTextActive: { color: '#FFF' },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: 12,
    padding: 12, marginBottom: 8, gap: 10,
  },
  statusPill: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, minWidth: 60, alignItems: 'center',
  },
  statusPillText: { fontSize: 10, fontWeight: '700' },
  rowBody: { flex: 1 },
  rowHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  customerName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  typeLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '500' },
  rowDate: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  rowError: { fontSize: 11, color: COLORS.error, marginTop: 3 },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 13, color: COLORS.textLight },

  // Modal
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  detailRow: {
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  detailLabel: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 3 },
  detailValue: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  errorBlock: {
    marginTop: 16, backgroundColor: COLORS.error + '10',
    borderRadius: 10, padding: 12,
  },
  errorBlockLabel: { fontSize: 11, color: COLORS.error, fontWeight: '700', marginBottom: 4 },
  errorBlockText: { fontSize: 13, color: COLORS.text, lineHeight: 18 },
  payloadBlock: {
    marginTop: 16, backgroundColor: COLORS.backgroundSoft,
    borderRadius: 10, padding: 12,
  },
  payloadLabel: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '700', marginBottom: 6 },
  payloadText: { fontSize: 10, color: COLORS.text, fontFamily: 'monospace' as any, lineHeight: 14 },
});
