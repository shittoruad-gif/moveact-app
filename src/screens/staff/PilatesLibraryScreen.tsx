// 施術教材ライブラリ（スタッフ専用）
// =====================================================
// 書籍から抽出した施術技術・エクササイズ・指導法・適応する悩みを閲覧する。
// 分野: ピラティス / 鍼灸 / リハビリ / 解剖 / トレーニング
// クライアントには表示されない（RLSでスタッフ/管理者のみ）。
// 分野・悩み・キーワードで絞り込み、タップで詳細を表示。
// =====================================================
import React, { useEffect, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator, ScrollView, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { BODY_CONCERNS } from '../../lib/karteOptions';
import type { PilatesExercise } from '../../types/database';

const DISCIPLINE_FILTERS = ['すべて', 'ピラティス', '鍼灸', 'リハビリ', '解剖', 'トレーニング', '筋膜', 'テーピング', '美容'];

export function PilatesLibraryScreen() {
  const [exercises, setExercises] = useState<PilatesExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [discipline, setDiscipline] = useState('すべて');
  const [concern, setConcern] = useState<string | null>(null);
  const [detail, setDetail] = useState<PilatesExercise | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('pilates_exercises')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      setExercises((data as PilatesExercise[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exercises.filter((e) => {
      if (discipline !== 'すべて' && e.discipline !== discipline) return false;
      if (concern && !(e.concerns ?? []).includes(concern)) return false;
      if (q) {
        const hay = `${e.name_ja} ${e.name_en ?? ''} ${e.category ?? ''} ${e.purpose ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [exercises, search, discipline, concern]);

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator color={COLORS.accent} /></View>;
  }

  return (
    <View style={styles.container}>
      {/* 検索 */}
      <View style={styles.searchBar}>
        <Ionicons name="search" size={16} color={COLORS.textLight} />
        <TextInput
          style={styles.searchInput}
          placeholder="種目名・部位・目的で検索"
          placeholderTextColor={COLORS.textLight}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={COLORS.textLight} />
          </TouchableOpacity>
        )}
      </View>

      {/* 分野フィルタ */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={styles.filterContent}>
        {DISCIPLINE_FILTERS.map((d) => (
          <TouchableOpacity
            key={d}
            style={[styles.filterChip, discipline === d && styles.filterChipActive]}
            onPress={() => setDiscipline(d)}
          >
            <Text style={[styles.filterChipText, discipline === d && styles.filterChipTextActive]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 悩みフィルタ */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow2} contentContainerStyle={styles.filterContent}>
        <TouchableOpacity
          style={[styles.concernChip, !concern && styles.concernChipActive]}
          onPress={() => setConcern(null)}
        >
          <Text style={[styles.concernChipText, !concern && styles.concernChipTextActive]}>悩み: 全て</Text>
        </TouchableOpacity>
        {BODY_CONCERNS.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.concernChip, concern === c && styles.concernChipActive]}
            onPress={() => setConcern(concern === c ? null : c)}
          >
            <Text style={[styles.concernChipText, concern === c && styles.concernChipTextActive]}>{c}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.countText}>{filtered.length}件</Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.empty}>該当する種目がありません</Text>}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => setDetail(item)}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{item.name_ja}</Text>
              {item.name_en ? <Text style={styles.cardNameEn}>{item.name_en}</Text> : null}
              {item.purpose ? <Text style={styles.cardPurpose} numberOfLines={2}>{item.purpose}</Text> : null}
              <View style={styles.cardMetaRow}>
                <View style={styles.discBadge}><Text style={styles.discBadgeText}>{item.discipline}</Text></View>
                {item.equipment && item.equipment !== '—' ? <View style={styles.metaBadge}><Text style={styles.metaBadgeText}>{item.equipment}</Text></View> : null}
                {item.level ? <View style={styles.metaBadge}><Text style={styles.metaBadgeText}>{item.level}</Text></View> : null}
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
          </TouchableOpacity>
        )}
      />

      {/* 詳細モーダル */}
      <Modal visible={detail !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetail(null)}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle} numberOfLines={1}>{detail?.name_ja}</Text>
          <TouchableOpacity onPress={() => setDetail(null)} hitSlop={8}>
            <Ionicons name="close" size={24} color={COLORS.text} />
          </TouchableOpacity>
        </View>
        {detail && (
          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }}>
            {detail.name_en ? <Text style={styles.detailEn}>{detail.name_en}</Text> : null}
            <View style={styles.detailBadgeRow}>
              {detail.equipment ? <Badge text={detail.equipment} /> : null}
              {detail.level ? <Badge text={detail.level} /> : null}
              {detail.category ? <Badge text={detail.category} /> : null}
            </View>
            <DetailSection icon="flag-outline" title="目的・効果" content={detail.purpose} />
            {detail.concerns?.length > 0 && (
              <View style={styles.detailSection}>
                <View style={styles.detailHead}>
                  <Ionicons name="medkit-outline" size={15} color={COLORS.accent} />
                  <Text style={styles.detailTitle}>こんなお悩みに</Text>
                </View>
                <View style={styles.concernWrap}>
                  {detail.concerns.map((c) => (
                    <View key={c} style={styles.concernTag}><Text style={styles.concernTagText}>{c}</Text></View>
                  ))}
                </View>
              </View>
            )}
            <DetailSection icon="megaphone-outline" title="指導ポイント・キューイング" content={detail.cues} />
            {detail.cautions ? <DetailSection icon="warning-outline" title="禁忌・注意点" content={detail.cautions} warn /> : null}
            {detail.source ? <Text style={styles.source}>出典: {detail.source}</Text> : null}
          </ScrollView>
        )}
      </Modal>
    </View>
  );
}

function Badge({ text }: { text: string }) {
  return <View style={styles.detailBadge}><Text style={styles.detailBadgeText}>{text}</Text></View>;
}

function DetailSection({ icon, title, content, warn }: { icon: any; title: string; content: string | null; warn?: boolean }) {
  if (!content) return null;
  return (
    <View style={styles.detailSection}>
      <View style={styles.detailHead}>
        <Ionicons name={icon} size={15} color={warn ? COLORS.error : COLORS.accent} />
        <Text style={[styles.detailTitle, warn && { color: COLORS.error }]}>{title}</Text>
      </View>
      <Text style={styles.detailText}>{content}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, margin: 12, marginBottom: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text },
  filterRow: { maxHeight: 44, marginBottom: 2 },
  filterRow2: { maxHeight: 44 },
  filterContent: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterChipText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: '#FFF' },
  concernChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  concernChipActive: { backgroundColor: COLORS.accentPink, borderColor: COLORS.accentPink },
  concernChipText: { fontSize: 11, color: COLORS.textSecondary },
  concernChipTextActive: { color: '#FFF', fontWeight: '700' },
  countText: { fontSize: 11, color: COLORS.textLight, paddingHorizontal: 16, paddingVertical: 6 },
  list: { paddingHorizontal: 12, paddingBottom: 24 },
  empty: { textAlign: 'center', color: COLORS.textLight, marginTop: 40, fontSize: 13 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, padding: 14, borderRadius: 12, marginBottom: 8,
  },
  cardName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardNameEn: { fontSize: 11, color: COLORS.textLight, marginTop: 1 },
  cardPurpose: { fontSize: 12, color: COLORS.textSecondary, marginTop: 4, lineHeight: 17 },
  cardMetaRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  metaBadge: { backgroundColor: COLORS.backgroundSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  metaBadgeText: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '600' },
  discBadge: { backgroundColor: COLORS.accent + '18', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  discBadgeText: { fontSize: 10, color: COLORS.accent, fontWeight: '700' },

  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight, backgroundColor: COLORS.surface,
  },
  modalTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: COLORS.text, marginRight: 12 },
  modalBody: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  detailEn: { fontSize: 13, color: COLORS.textLight, marginBottom: 10 },
  detailBadgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
  detailBadge: { backgroundColor: COLORS.accentLight, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  detailBadgeText: { fontSize: 11, color: COLORS.accent, fontWeight: '700' },
  detailSection: { marginBottom: 18 },
  detailHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  detailTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  detailText: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 21 },
  concernWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  concernTag: { backgroundColor: COLORS.accentPink + '20', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  concernTagText: { fontSize: 12, color: COLORS.accentPink, fontWeight: '600' },
  source: { fontSize: 11, color: COLORS.textLight, marginTop: 8, fontStyle: 'italic' },
});
