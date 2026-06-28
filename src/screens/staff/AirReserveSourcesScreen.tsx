// Airリザーブ連携ソース一覧
// iCalフィードを登録して定期同期する
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

export function AirReserveSourcesScreen() {
  const navigation = useNavigation<any>();
  const [sources, setSources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('airreserve_sources')
      .select('*, staff:profiles(full_name)')
      .order('created_at', { ascending: false });
    setSources(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  async function handleSync(sourceId?: string) {
    setSyncing(sourceId ?? 'all');
    try {
      const { data, error } = await supabase.functions.invoke('airreserve-sync', {
        body: sourceId ? { source_id: sourceId } : {},
      });
      if (error) throw error;
      const result = data as any;
      Alert.alert(
        '同期完了',
        `処理: ${result?.processed ?? 0}件\n追加: ${result?.inserted ?? 0}件\n更新: ${result?.updated ?? 0}件`,
        [{ text: 'OK', onPress: fetchData }]
      );
    } catch (e: any) {
      Alert.alert('同期エラー', e?.message ?? '同期に失敗しました');
    } finally {
      setSyncing(null);
    }
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('airreserve_sources').update({ is_active: !current }).eq('id', id);
    fetchData();
  }

  async function handleDelete(id: string) {
    Alert.alert('削除確認', 'このiCalソースと関連する全同期イベントを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          await supabase.from('airreserve_sources').delete().eq('id', id);
          fetchData();
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={COLORS.accent} />}
      >
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={18} color={COLORS.accent} />
          <Text style={styles.infoText}>
            Airリザーブ管理画面でカレンダー→「iCal形式で出力」URLをコピーして登録。
            60秒ごとに定期同期され、週カレンダーに統合表示されます。
          </Text>
        </View>

        <View style={styles.syncAllRow}>
          <TouchableOpacity
            style={styles.syncAllBtn}
            onPress={() => handleSync()}
            disabled={syncing === 'all'}
          >
            <Ionicons name="refresh" size={16} color="#FFF" />
            <Text style={styles.syncAllText}>
              {syncing === 'all' ? '同期中...' : '全ソースを同期'}
            </Text>
          </TouchableOpacity>
        </View>

        {sources.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="sync-circle-outline" size={40} color={COLORS.textLight} />
            <Text style={styles.emptyText}>登録されたiCalソースはありません</Text>
            <Text style={styles.emptyText2}>右下の「＋」から追加できます</Text>
          </View>
        ) : (
          sources.map((s) => (
            <View key={s.id} style={[styles.card, !s.is_active && { opacity: 0.5 }]}>
              <TouchableOpacity
                onPress={() => navigation.navigate('AirReserveSourceForm', { sourceId: s.id })}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.label}>{s.label}</Text>
                  <View style={[styles.statusDot, {
                    backgroundColor: s.last_sync_status === 'ok' ? COLORS.success
                      : s.last_sync_status === 'error' ? COLORS.error
                      : COLORS.textLight,
                  }]} />
                </View>
                <Text style={styles.meta}>
                  {(STORES as any)[s.store_id]?.name ?? s.store_id}
                  {s.staff?.full_name ? ` ・ ${s.staff.full_name}` : ''}
                </Text>
                <Text style={styles.urlText} numberOfLines={1}>{s.ical_url}</Text>

                {s.last_synced_at && (
                  <Text style={styles.syncMeta}>
                    最終同期: {new Date(s.last_synced_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    ・ {s.events_count ?? 0}件
                  </Text>
                )}
                {s.last_sync_error && (
                  <Text style={styles.errorText} numberOfLines={2}>
                    ⚠️ {s.last_sync_error}
                  </Text>
                )}
              </TouchableOpacity>

              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleSync(s.id)}
                  disabled={syncing === s.id}
                >
                  <Ionicons name="refresh" size={14} color={COLORS.accent} />
                  <Text style={styles.actionText}>
                    {syncing === s.id ? '同期中' : '同期'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => toggleActive(s.id, s.is_active)}
                >
                  <Ionicons
                    name={s.is_active ? 'pause' : 'play'}
                    size={14}
                    color={s.is_active ? COLORS.warning : COLORS.success}
                  />
                  <Text style={styles.actionText}>{s.is_active ? '停止' : '再開'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: COLORS.error + '12' }]}
                  onPress={() => handleDelete(s.id)}
                >
                  <Ionicons name="trash-outline" size={14} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('AirReserveSourceForm', {})}
      >
        <Ionicons name="add" size={24} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.accent + '12',
    marginHorizontal: 16, marginTop: 12,
    padding: 12, borderRadius: 10,
  },
  infoText: { flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },
  syncAllRow: { paddingHorizontal: 16, marginTop: 12 },
  syncAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.accent, paddingVertical: 10, borderRadius: 10,
  },
  syncAllText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  card: {
    backgroundColor: COLORS.surface, marginHorizontal: 16, marginTop: 10,
    padding: 14, borderRadius: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  meta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 4 },
  urlText: { fontSize: 10, color: COLORS.textLight, marginTop: 4, fontFamily: 'System' },
  syncMeta: { fontSize: 10, color: COLORS.textSecondary, marginTop: 6 },
  errorText: { fontSize: 10, color: COLORS.error, marginTop: 4 },
  actionRow: {
    flexDirection: 'row', gap: 6, marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  actionBtn: {
    flexDirection: 'row', gap: 4, alignItems: 'center',
    backgroundColor: COLORS.backgroundSoft,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  actionText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  emptyCard: { alignItems: 'center', padding: 40, gap: 4, marginTop: 20 },
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
