// お知らせ一覧（スタッフ用）
// 作成・編集・LINE一斉配信
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
  Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

export function AnnouncementListScreen() {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false });
    setItems(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  async function toggleActive(id: string, current: boolean) {
    await supabase.from('announcements').update({ is_active: !current }).eq('id', id);
    fetchData();
  }

  async function handleBroadcast(item: any) {
    Alert.alert(
      'LINE一斉配信',
      `「${item.title}」をLINE連携済みの全顧客に配信しますか？\n（配信後は取り消せません）`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '配信する',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data, error } = await supabase.functions.invoke('broadcast-line-announcement', {
                body: { announcement_id: item.id },
              });
              if (error) throw error;
              const sent = (data as any)?.sent ?? 0;
              Alert.alert('配信完了', `${sent}人に配信しました`, [
                { text: 'OK', onPress: fetchData },
              ]);
            } catch (e: any) {
              Alert.alert('エラー', e?.message ?? '配信に失敗しました');
            }
          },
        },
      ]
    );
  }

  async function handleDelete(id: string) {
    Alert.alert('削除確認', 'このお知らせを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('announcements').delete().eq('id', id);
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
        {items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="megaphone-outline" size={40} color={COLORS.textLight} />
            <Text style={styles.emptyText}>お知らせはまだありません</Text>
          </View>
        ) : (
          items.map((a) => (
            <View key={a.id} style={styles.card}>
              <TouchableOpacity
                style={styles.cardBody}
                onPress={() => navigation.navigate('AnnouncementForm', { announcementId: a.id })}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{a.title}</Text>
                  <View style={styles.badges}>
                    {!a.is_active && (
                      <View style={[styles.badge, { backgroundColor: COLORS.textLight + '20' }]}>
                        <Text style={[styles.badgeText, { color: COLORS.textSecondary }]}>非公開</Text>
                      </View>
                    )}
                    {a.line_broadcast_at && (
                      <View style={[styles.badge, { backgroundColor: '#06C75520' }]}>
                        <Ionicons name="chatbubble" size={10} color="#06C755" />
                        <Text style={[styles.badgeText, { color: '#06C755' }]}>{a.line_broadcast_count ?? 0}配信</Text>
                      </View>
                    )}
                  </View>
                </View>
                {a.body && (
                  <Text style={styles.cardBodyText} numberOfLines={2}>{a.body}</Text>
                )}
                <Text style={styles.cardMeta}>
                  {new Date(a.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {a.store_id ? ` ・ ${(STORES as any)[a.store_id]?.name ?? a.store_id}` : ' ・ 全店'}
                </Text>
              </TouchableOpacity>
              <View style={styles.cardActions}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => toggleActive(a.id, a.is_active)}
                >
                  <Ionicons
                    name={a.is_active ? 'eye' : 'eye-off'}
                    size={16}
                    color={a.is_active ? COLORS.success : COLORS.textLight}
                  />
                  <Text style={styles.actionText}>{a.is_active ? '公開中' : '非公開'}</Text>
                </TouchableOpacity>
                {!a.line_broadcast_at && (
                  <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: '#06C75515' }]}
                    onPress={() => handleBroadcast(a)}
                  >
                    <Ionicons name="send" size={14} color="#06C755" />
                    <Text style={[styles.actionText, { color: '#06C755' }]}>LINE配信</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: COLORS.error + '12' }]}
                  onPress={() => handleDelete(a.id)}
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
        onPress={() => navigation.navigate('AnnouncementForm', {})}
      >
        <Ionicons name="add" size={24} color="#FFF" />
        <Text style={styles.fabText}>新規作成</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  card: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 16, marginTop: 12,
    borderRadius: 12, overflow: 'hidden',
  },
  cardBody: { padding: 14 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  badges: { flexDirection: 'row', gap: 4 },
  badge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
  cardBodyText: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  cardMeta: { fontSize: 10, color: COLORS.textLight, marginTop: 6 },
  cardActions: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingBottom: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  actionBtn: {
    flexDirection: 'row', gap: 4, alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: COLORS.backgroundSoft,
  },
  actionText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  emptyCard: { alignItems: 'center', padding: 40, gap: 10, marginTop: 40 },
  emptyText: { fontSize: 13, color: COLORS.textLight },
  fab: {
    position: 'absolute', bottom: 24, right: 16,
    backgroundColor: COLORS.accent, borderRadius: 28,
    paddingHorizontal: 18, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    elevation: 4, shadowColor: '#000', shadowOpacity: 0.15,
    shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  fabText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
});
