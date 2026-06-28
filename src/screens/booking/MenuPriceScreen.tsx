import React, { useState, useEffect } from 'react';
import { View, Text, SectionList, StyleSheet } from 'react-native';
import { COLORS, TREATMENT_TYPES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { Ionicons } from '@expo/vector-icons';
import type { TreatmentMenu, TreatmentType } from '../../types/database';

interface MenuSection {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  data: TreatmentMenu[];
}

const SECTION_CONFIG: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  biyou_hari: { icon: 'sparkles-outline', color: '#D4A5A5' },
  seitai: { icon: 'body-outline', color: COLORS.accent },
  pilates: { icon: 'fitness-outline', color: '#9B7FA7' },
  group_pilates: { icon: 'people-outline', color: '#7BA88E' },
  reflexology: { icon: 'footsteps-outline', color: '#D4A55A' },
};

export function MenuPriceScreen() {
  const { profile } = useAuthStore();
  const [sections, setSections] = useState<MenuSection[]>([]);
  // メニューID → 適用される特別料金（タグ割引）
  const [tagPriceMap, setTagPriceMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    fetchMenus();
  }, [profile?.tags]);

  async function fetchMenus() {
    const { data } = await supabase
      .from('treatment_menus')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (!data) return;

    // ログイン顧客のタグに該当する特別料金を取得（メニューごと最安値）
    const map = new Map<string, number>();
    if (profile?.tags && profile.tags.length > 0) {
      const { data: tpData } = await supabase
        .from('menu_tag_prices')
        .select('treatment_menu_id, price')
        .in('tag', profile.tags);
      for (const tp of (tpData ?? []) as { treatment_menu_id: string; price: number }[]) {
        const cur = map.get(tp.treatment_menu_id);
        if (cur === undefined || tp.price < cur) map.set(tp.treatment_menu_id, tp.price);
      }
    }
    setTagPriceMap(map);

    const grouped: Record<string, TreatmentMenu[]> = {};
    for (const item of data as TreatmentMenu[]) {
      if (!grouped[item.treatment_type]) grouped[item.treatment_type] = [];
      grouped[item.treatment_type].push(item);
    }

    const result: MenuSection[] = Object.entries(grouped).map(([type, items]) => ({
      title: TREATMENT_TYPES[type as TreatmentType] ?? type,
      icon: SECTION_CONFIG[type]?.icon ?? 'medical-outline',
      data: items,
    }));

    setSections(result);
  }

  return (
    <View style={styles.container}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.headerContainer}>
            <Text style={styles.pageTitle}>料金メニュー</Text>
            <Text style={styles.pageNote}>全て税込価格です</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Ionicons
              name={(section as MenuSection).icon}
              size={18}
              color={COLORS.accent}
            />
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => {
          const special = tagPriceMap.get(item.id);
          const hasDiscount = special !== undefined && special < item.price;
          return (
            <View style={styles.menuItem}>
              <View style={styles.menuInfo}>
                <Text style={styles.menuName}>{item.name}</Text>
                {item.description && (
                  <Text style={styles.menuDesc} numberOfLines={2}>{item.description}</Text>
                )}
                <Text style={styles.menuDuration}>{item.duration_minutes}分</Text>
              </View>
              {hasDiscount ? (
                <View style={styles.priceCol}>
                  <View style={styles.memberBadge}>
                    <Text style={styles.memberBadgeText}>会員価格</Text>
                  </View>
                  <Text style={styles.originalPrice}>¥{item.price.toLocaleString()}</Text>
                  <Text style={styles.menuPrice}>¥{special!.toLocaleString()}</Text>
                </View>
              ) : (
                <Text style={styles.menuPrice}>¥{item.price.toLocaleString()}</Text>
              )}
            </View>
          );
        }}
        renderSectionFooter={() => <View style={{ height: 8 }} />}
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
    paddingBottom: 32,
  },
  headerContainer: {
    marginBottom: 16,
  },
  pageTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  pageNote: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  menuItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuInfo: {
    flex: 1,
    marginRight: 12,
  },
  menuName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  menuDesc: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 17,
    marginBottom: 4,
  },
  menuDuration: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  menuPrice: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
  },
  priceCol: {
    alignItems: 'flex-end',
  },
  memberBadge: {
    backgroundColor: COLORS.accentPink + '25',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 2,
  },
  memberBadgeText: { fontSize: 9, fontWeight: '700', color: COLORS.accentPink },
  originalPrice: {
    fontSize: 12, color: COLORS.textLight,
    textDecorationLine: 'line-through',
  },
});
