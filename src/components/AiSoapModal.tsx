// AI SOAP 生成モーダル
// =====================================================
// スタッフが「その時の症状・施術内容」を自由入力し、
// 施術種類に応じた選択肢（経穴 / ピラティスエクササイズ / お悩み）をチップで選ぶ。
// 「AIで生成」→ Edge Function generate-karte-soap → SOAP下書きを親に返す。
// 親（KarteForm）側で各SOAP欄が編集可能になる。
// =====================================================
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, Modal, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../lib/constants';
import { supabase } from '../lib/supabase';
import {
  ACUPOINTS, PILATES_EXERCISES, BODY_CONCERNS, BEAUTY_CONCERNS,
} from '../lib/karteOptions';
import type { TreatmentType } from '../types/database';

// ピラティス系の施術種類でDB（書籍由来ライブラリ）からエクササイズ名を取得
const PILATES_TYPES: (TreatmentType | null)[] = ['pilates', 'group_pilates'];

export interface GeneratedSoap {
  subjective: string;
  objective: string;
  assessment: string;
  treatmentContent: string;
  treatmentPlan: string;
  homeCareAdvice: string;
}

interface Props {
  visible: boolean;
  treatmentType: TreatmentType | null;
  onClose: () => void;
  onGenerated: (soap: GeneratedSoap) => void;
}

export function AiSoapModal({ visible, treatmentType, onClose, onGenerated }: Props) {
  const [rawText, setRawText] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  // 書籍由来のピラティスエクササイズ名（DBから取得）
  const [dbExercises, setDbExercises] = useState<string[]>([]);

  useEffect(() => {
    if (!visible) return;
    if (!PILATES_TYPES.includes(treatmentType)) return;
    (async () => {
      const { data } = await supabase
        .from('pilates_exercises')
        .select('name_ja')
        .eq('is_active', true)
        .order('sort_order');
      const names = Array.from(new Set(((data ?? []) as { name_ja: string }[]).map((r) => r.name_ja)));
      setDbExercises(names);
    })();
  }, [visible, treatmentType]);

  function toggle(item: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }

  function reset() {
    setRawText('');
    setSelected(new Set());
  }

  async function handleGenerate() {
    const items = Array.from(selected);
    if (!rawText.trim() && items.length === 0) {
      Alert.alert('入力してください', '症状・施術内容を入力するか、項目を選択してください');
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-karte-soap', {
        body: {
          rawText: rawText.trim(),
          treatmentType: treatmentType ?? '',
          selectedItems: items,
        },
      });
      if (error) throw error;
      if (!data?.success || !data?.soap) {
        throw new Error(data?.error ?? 'AI生成に失敗しました');
      }
      onGenerated(data.soap as GeneratedSoap);
      reset();
      onClose();
    } catch (e: any) {
      Alert.alert('生成エラー', e?.message ?? 'AI生成に失敗しました');
    } finally {
      setGenerating(false);
    }
  }

  // 施術種類に応じた選択肢グループ
  const chipGroups = getChipGroups(treatmentType, dbExercises);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={8}>
            <Text style={styles.cancel}>キャンセル</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>AIでカルテ作成</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={styles.banner}>
            <Ionicons name="sparkles" size={16} color={COLORS.accent} />
            <Text style={styles.bannerText}>
              症状や施術内容を入力し、関連する項目を選んで「AIで生成」を押すと、SOAP形式のカルテ下書きが自動作成されます。生成後も自由に編集できます。
            </Text>
          </View>

          {/* 自由入力 */}
          <Text style={styles.label}>その時の症状・施術内容</Text>
          <TextInput
            style={styles.textArea}
            value={rawText}
            onChangeText={setRawText}
            placeholder="例) 右肩のこりと頭痛の訴え。肩甲骨周りの筋緊張が強い。肩井・風池に置鍼し、首肩の可動域が改善。"
            placeholderTextColor={COLORS.textLight}
            multiline
            textAlignVertical="top"
          />

          {/* チップ選択 */}
          {chipGroups.map((group) => (
            <View key={group.title} style={styles.chipSection}>
              <Text style={styles.chipSectionTitle}>{group.title}</Text>
              <View style={styles.chipWrap}>
                {group.items.map((item) => {
                  const active = selected.has(item);
                  return (
                    <TouchableOpacity
                      key={item}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => toggle(item)}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{item}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {selected.size > 0 && (
            <Text style={styles.selectedNote}>選択中: {selected.size}件</Text>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.generateBtn, generating && { opacity: 0.6 }]}
            onPress={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="sparkles" size={18} color="#FFF" />
                <Text style={styles.generateBtnText}>AIで生成</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function getChipGroups(type: TreatmentType | null, dbExercises: string[] = []): { title: string; items: string[] }[] {
  if (type === 'biyou_hari') {
    return [
      ...ACUPOINTS.filter((g) => ['頭・顔', '首・肩'].includes(g.category)).map((g) => ({ title: `経穴（${g.category}）`, items: g.points })),
      { title: 'お悩み', items: BEAUTY_CONCERNS },
    ];
  }
  if (type === 'pilates' || type === 'group_pilates') {
    // 書籍由来のライブラリがあればそれを優先（多数あるので先頭60件程度）。無ければ内蔵リスト。
    const exerciseGroup = dbExercises.length > 0
      ? [{ title: `エクササイズ（教材ライブラリ ${dbExercises.length}件）`, items: dbExercises.slice(0, 80) }]
      : PILATES_EXERCISES.map((g) => ({ title: `エクササイズ（${g.category}）`, items: g.items }));
    return [
      ...exerciseGroup,
      { title: 'お悩み', items: BODY_CONCERNS },
    ];
  }
  if (type === 'reflexology') {
    return [
      ...ACUPOINTS.filter((g) => ['脚・足'].includes(g.category)).map((g) => ({ title: `経穴（${g.category}）`, items: g.points })),
      { title: 'お悩み', items: BODY_CONCERNS },
    ];
  }
  // 整体・その他（鍼灸含む）: 全経穴 + 身体の悩み
  return [
    ...ACUPOINTS.map((g) => ({ title: `経穴（${g.category}）`, items: g.points })),
    { title: 'お悩み', items: BODY_CONCERNS },
  ];
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
    backgroundColor: COLORS.surface,
  },
  cancel: { fontSize: 14, color: COLORS.textSecondary },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  container: { flex: 1, backgroundColor: COLORS.background },

  banner: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: COLORS.accent + '10', margin: 16, padding: 12, borderRadius: 10,
  },
  bannerText: { flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 17 },

  label: { fontSize: 13, fontWeight: '700', color: COLORS.text, paddingHorizontal: 16, marginBottom: 8 },
  textArea: {
    marginHorizontal: 16, backgroundColor: COLORS.surface, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.borderLight,
    padding: 14, fontSize: 14, color: COLORS.text, minHeight: 110,
  },

  chipSection: { marginTop: 18, paddingHorizontal: 16 },
  chipSectionTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
    backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },
  chipTextActive: { color: '#FFF', fontWeight: '700' },

  selectedNote: { fontSize: 12, color: COLORS.accent, paddingHorizontal: 16, marginTop: 16, fontWeight: '600' },

  footer: {
    padding: 16, paddingBottom: 32,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  generateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, borderRadius: 14, paddingVertical: 15,
  },
  generateBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
