import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { INTEREST_OPTIONS } from '../../lib/interests';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import type { Profile } from '../../types/database';

export function OnboardingInterestsScreen() {
  const { session, setProfile } = useAuthStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleSubmit() {
    if (!session?.user?.id) return;
    setSaving(true);
    try {
      const interests = Array.from(selected);
      const { data, error } = await supabase
        .from('profiles')
        .update({ interests })
        .eq('id', session.user.id)
        .select()
        .single();

      if (error) {
        console.error('Failed to save interests:', error);
      } else if (data) {
        setProfile(data as Profile);
      }
    } catch (e) {
      console.error('Error saving interests:', e);
    } finally {
      setSaving(false);
    }
  }

  async function handleSkip() {
    if (!session?.user?.id) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ interests: ['_skipped'] })
        .eq('id', session.user.id)
        .select()
        .single();

      if (error) {
        console.error('Failed to skip interests:', error);
      } else if (data) {
        setProfile(data as Profile);
      }
    } catch (e) {
      console.error('Error skipping interests:', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>興味のあるカテゴリを{'\n'}教えてください</Text>
          <Text style={styles.subtitle}>
            選択に合わせておすすめ商品をご紹介します
          </Text>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.grid}
          showsVerticalScrollIndicator={false}
        >
          {INTEREST_OPTIONS.map((option) => {
            const isSelected = selected.has(option.id);
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => toggle(option.id)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, isSelected && styles.iconWrapSelected]}>
                  <Ionicons
                    name={option.icon as any}
                    size={24}
                    color={isSelected ? '#FFFFFF' : COLORS.accent}
                  />
                </View>
                <Text style={[styles.cardLabel, isSelected && styles.cardLabelSelected]}>
                  {option.label}
                </Text>
                <Text style={styles.cardDesc} numberOfLines={2}>
                  {option.description}
                </Text>
                {isSelected && (
                  <View style={styles.checkBadge}>
                    <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitButton, selected.size === 0 && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={selected.size === 0 || saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.submitText}>
                {selected.size > 0
                  ? `${selected.size}件選択して始める`
                  : 'カテゴリを選んでください'}
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSkip} disabled={saving} style={styles.skipButton}>
            <Text style={styles.skipText}>スキップする</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    lineHeight: 34,
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
    letterSpacing: 0.3,
  },
  scrollArea: {
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 10,
  },
  card: {
    width: '47.5%',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  cardSelected: {
    borderColor: COLORS.accent,
    backgroundColor: '#FDF8F3',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F5EDE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  iconWrapSelected: {
    backgroundColor: COLORS.accent,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  cardLabelSelected: {
    color: COLORS.accent,
  },
  cardDesc: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15,
  },
  checkBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 12,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.borderLight,
  },
  submitButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: COLORS.accentLight,
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  skipButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  skipText: {
    fontSize: 13,
    color: COLORS.textLight,
    letterSpacing: 0.3,
  },
});
