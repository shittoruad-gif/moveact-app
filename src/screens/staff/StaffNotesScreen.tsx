// 申し送りボード
// スタッフ間の業務引き継ぎメモ（ピン留め・既読管理）
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';

export function StaffNotesScreen() {
  const navigation = useNavigation<any>();
  const profile = useAuthStore((s) => s.profile);
  const [notes, setNotes] = useState<any[]>([]);
  const [reads, setReads] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [notesRes, readsRes] = await Promise.all([
      supabase
        .from('staff_notes')
        .select('*, author:profiles!staff_notes_author_id_fkey(full_name)')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100),
      supabase
        .from('staff_note_reads')
        .select('note_id')
        .eq('staff_id', profile?.id ?? ''),
    ]);
    setNotes(notesRes.data ?? []);
    setReads(new Set((readsRes.data ?? []).map((r: any) => r.note_id)));
    setLoading(false);
  }, [profile?.id]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  async function markRead(noteId: string) {
    if (!profile?.id || reads.has(noteId)) return;
    await supabase.from('staff_note_reads').upsert({
      note_id: noteId, staff_id: profile.id, read_at: new Date().toISOString(),
    });
    setReads((prev) => new Set([...prev, noteId]));
  }

  async function togglePin(id: string, current: boolean) {
    await supabase.from('staff_notes').update({ is_pinned: !current }).eq('id', id);
    fetchData();
  }

  async function handleDelete(id: string) {
    Alert.alert('削除確認', 'この申し送りを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          await supabase.from('staff_notes').delete().eq('id', id);
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
        {notes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="chatbubbles-outline" size={40} color={COLORS.textLight} />
            <Text style={styles.emptyText}>申し送りはまだありません</Text>
          </View>
        ) : (
          notes.map((n) => {
            const isRead = reads.has(n.id);
            const isMine = n.author_id === profile?.id;
            return (
              <TouchableOpacity
                key={n.id}
                style={[
                  styles.card,
                  n.is_pinned && styles.cardPinned,
                  !isRead && !isMine && styles.cardUnread,
                ]}
                onPress={() => {
                  markRead(n.id);
                  navigation.navigate('StaffNoteForm', { noteId: n.id });
                }}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    {n.is_pinned && (
                      <Ionicons name="pin" size={14} color={COLORS.warning} />
                    )}
                    {!isRead && !isMine && (
                      <View style={styles.unreadDot} />
                    )}
                    {n.title ? (
                      <Text style={styles.cardTitle} numberOfLines={1}>{n.title}</Text>
                    ) : (
                      <Text style={[styles.cardTitle, { color: COLORS.textLight }]}>（無題）</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => togglePin(n.id, n.is_pinned)}>
                    <Ionicons
                      name={n.is_pinned ? 'pin' : 'pin-outline'}
                      size={16}
                      color={n.is_pinned ? COLORS.warning : COLORS.textLight}
                    />
                  </TouchableOpacity>
                </View>
                <Text style={styles.cardBody} numberOfLines={3}>{n.body}</Text>
                {n.tags && n.tags.length > 0 && (
                  <View style={styles.tagRow}>
                    {n.tags.map((t: string) => (
                      <View key={t} style={styles.tag}>
                        <Text style={styles.tagText}>#{t}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.cardFooter}>
                  <Text style={styles.meta}>
                    {n.author?.full_name ?? '---'} ・ {new Date(n.created_at).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  {isMine && (
                    <TouchableOpacity onPress={() => handleDelete(n.id)}>
                      <Ionicons name="trash-outline" size={14} color={COLORS.textLight} />
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 80 }} />
      </ScrollView>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('StaffNoteForm', {})}
      >
        <Ionicons name="create-outline" size={22} color="#FFF" />
        <Text style={styles.fabText}>新規</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14,
    marginHorizontal: 16, marginTop: 10, gap: 6,
  },
  cardPinned: { borderLeftWidth: 3, borderLeftColor: COLORS.warning },
  cardUnread: { backgroundColor: COLORS.accentLight + '30' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.accent },
  cardTitle: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text },
  cardBody: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tag: {
    backgroundColor: COLORS.backgroundSoft,
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
  tagText: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '600' },
  cardFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 4, paddingTop: 6, borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  meta: { fontSize: 10, color: COLORS.textLight },
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
