import React, { useState, useEffect } from 'react';
import { View, Text, SectionList, StyleSheet } from 'react-native';
import { COLORS, TREATMENT_TYPES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
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
  const [sections, setSections] = useState<MenuSection[]>([]);

  useEffect(() => {
    fetchMenus();
  }, []);

  async function fetchMenus() {
    const { data } = await supabase
      .from('treatment_menus')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (!data) return;

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
        renderItem={({ item }) => (
          <View style={styles.menuItem}>
            <View style={styles.menuInfo}>
              <Text style={styles.menuName}>{item.name}</Text>
              {item.description && (
                <Text style={styles.menuDesc} numberOfLines={2}>{item.description}</Text>
              )}
              <Text style={styles.menuDuration}>{item.duration_minutes}分</Text>
            </View>
            <Text style={styles.menuPrice}>
              ¥{item.price.toLocaleString()}
            </Text>
          </View>
        )}
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
});
