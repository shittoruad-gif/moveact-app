// タグ別料金設定画面（スタッフ/管理者用）
// =====================================================
// 顧客の格付け（タグ）ごとに、各施術メニューの特別料金を設定する。
// 例: 「VIP」タグの顧客には美容鍼を4,000円（通常5,000円）にする。
//
// 設定した料金は menu_tag_prices テーブルに保存され、
// 予約画面（BookingCalendar / BookingConfirm）で該当タグの顧客に自動適用される。
// =====================================================
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, PRESET_CUSTOMER_TAGS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import type { TreatmentMenu } from '../../types/database';

interface TagPriceRow {
  treatment_menu_id: string;
  tag: string;
  price: number;
}

export function MenuTagPricingScreen() {
  const [menus, setMenus] = useState<TreatmentMenu[]>([]);
  const [tagPrices, setTagPrices] = useState<TagPriceRow[]>([]);
  const [selectedTag, setSelectedTag] = useState<string>(PRESET_CUSTOMER_TAGS[0]);
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // menuId -> 入力中の価格文字列
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [menuRes, priceRes] = await Promise.all([
      supabase.from('treatment_menus').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('menu_tag_prices').select('treatment_menu_id, tag, price'),
    ]);
    setMenus((menuRes.data as TreatmentMenu[]) ?? []);
    setTagPrices((priceRes.data as TagPriceRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // 選択中タグの料金が変わったら下書きを初期化
  useEffect(() => {
    const d: Record<string, string> = {};
    for (const m of menus) {
      const tp = tagPrices.find((t) => t.treatment_menu_id === m.id && t.tag === selectedTag);
      d[m.id] = tp ? String(tp.price) : '';
    }
    setDrafts(d);
  }, [selectedTag, menus, tagPrices]);

  // タグ候補: プリセット + DB に既に存在するタグ
  const allTags = Array.from(new Set<string>([
    ...PRESET_CUSTOMER_TAGS,
    ...tagPrices.map((t) => t.tag),
  ]));

  async function savePrice(menu: TreatmentMenu) {
    const raw = (drafts[menu.id] ?? '').trim();
    setSavingId(menu.id);
    try {
      if (raw === '') {
        // 空欄 → そのタグの特別料金を削除（通常料金に戻す）
        const { error } = await supabase
          .from('menu_tag_prices')
          .delete()
          .eq('treatment_menu_id', menu.id)
          .eq('tag', selectedTag);
        if (error) throw error;
        setTagPrices((prev) => prev.filter(
          (t) => !(t.treatment_menu_id === menu.id && t.tag === selectedTag),
        ));
      } else {
        const price = parseInt(raw, 10);
        if (isNaN(price) || price < 0) {
          Alert.alert('入力エラー', '正しい金額を入力してください');
          setSavingId(null);
          return;
        }
        // upsert（UNIQUE制約: treatment_menu_id + tag）
        const { error } = await supabase
          .from('menu_tag_prices')
          .upsert(
            { treatment_menu_id: menu.id, tag: selectedTag, price },
            { onConflict: 'treatment_menu_id,tag' },
          );
        if (error) throw error;
        setTagPrices((prev) => {
          const filtered = prev.filter(
            (t) => !(t.treatment_menu_id === menu.id && t.tag === selectedTag),
          );
          return [...filtered, { treatment_menu_id: menu.id, tag: selectedTag, price }];
        });
      }
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '保存に失敗しました');
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        {/* 説明 */}
        <View style={styles.banner}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.accent} />
          <Text style={styles.bannerText}>
            格付け（タグ）ごとに特別料金を設定できます。設定すると、そのタグが付いた顧客の予約画面に自動で割引料金が表示されます。空欄にすると通常料金に戻ります。
          </Text>
        </View>

        {/* タグ選択 */}
        <Text style={styles.sectionTitle}>格付け（タグ）を選択</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagRow}>
          {allTags.map((tag) => {
            const active = tag === selectedTag;
            const count = tagPrices.filter((t) => t.tag === tag).length;
            return (
              <TouchableOpacity
                key={tag}
                style={[styles.tagChip, active && styles.tagChipActive]}
                onPress={() => setSelectedTag(tag)}
              >
                <Text style={[styles.tagChipText, active && styles.tagChipTextActive]}>{tag}</Text>
                {count > 0 && (
                  <View style={[styles.tagCount, active && styles.tagCountActive]}>
                    <Text style={[styles.tagCountText, active && styles.tagCountTextActive]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* メニュー別料金設定 */}
        <Text style={styles.sectionTitle}>
          「{selectedTag}」の料金設定
        </Text>
        {menus.map((menu) => {
          const draft = drafts[menu.id] ?? '';
          const hasSpecial = draft !== '' && parseInt(draft, 10) !== menu.price;
          const tp = tagPrices.find((t) => t.treatment_menu_id === menu.id && t.tag === selectedTag);
          const isDirty = (tp ? String(tp.price) : '') !== draft;
          return (
            <View key={menu.id} style={styles.menuCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.menuName}>{menu.name}</Text>
                <Text style={styles.menuMeta}>
                  通常 ¥{menu.price.toLocaleString()} / {menu.duration_minutes}分
                </Text>
              </View>
              <View style={styles.priceInputWrap}>
                <Text style={styles.yen}>¥</Text>
                <TextInput
                  style={[styles.priceInput, hasSpecial && styles.priceInputActive]}
                  value={draft}
                  onChangeText={(v) => setDrafts((d) => ({ ...d, [menu.id]: v.replace(/[^0-9]/g, '') }))}
                  placeholder={String(menu.price)}
                  placeholderTextColor={COLORS.textLight}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={() => savePrice(menu)}
                />
              </View>
              <TouchableOpacity
                style={[styles.saveBtn, !isDirty && { opacity: 0.3 }]}
                onPress={() => savePrice(menu)}
                disabled={!isDirty || savingId === menu.id}
              >
                {savingId === menu.id ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <Ionicons name="checkmark" size={18} color="#FFF" />
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  banner: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: COLORS.accent + '10', margin: 16, padding: 12, borderRadius: 10,
  },
  bannerText: { flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 17 },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: COLORS.text,
    paddingHorizontal: 16, marginTop: 12, marginBottom: 10,
  },
  tagRow: { paddingHorizontal: 16, gap: 8 },
  tagChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1.5, borderColor: COLORS.border,
  },
  tagChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  tagChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  tagChipTextActive: { color: '#FFF' },
  tagCount: {
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: COLORS.accent + '25', justifyContent: 'center', alignItems: 'center',
  },
  tagCountActive: { backgroundColor: 'rgba(255,255,255,0.3)' },
  tagCountText: { fontSize: 10, fontWeight: '700', color: COLORS.accent },
  tagCountTextActive: { color: '#FFF' },

  menuCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.surface, marginHorizontal: 16, marginBottom: 8,
    padding: 14, borderRadius: 12,
  },
  menuName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  menuMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  priceInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.background, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.border, paddingHorizontal: 8,
  },
  yen: { fontSize: 13, color: COLORS.textSecondary },
  priceInput: {
    width: 70, paddingVertical: 8, fontSize: 14, color: COLORS.text, textAlign: 'right',
  },
  priceInputActive: { color: COLORS.accent, fontWeight: '700' },
  saveBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center',
  },
});
