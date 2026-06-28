// 申し送りメモ作成・編集
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useStoreSelection } from '../../stores/storeSelectionStore';

const QUICK_TAGS = ['重要', '顧客対応', '在庫', '設備', 'シフト', 'イベント'];

export function StaffNoteFormScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const profile = useAuthStore((s) => s.profile);
  const { selectedStore } = useStoreSelection();
  const noteId: string | undefined = route.params?.noteId;
  const isEdit = !!noteId;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isPinned, setIsPinned] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const { data } = await supabase
        .from('staff_notes').select('*').eq('id', noteId).single();
      if (data) {
        setTitle(data.title ?? '');
        setBody(data.body);
        setIsPinned(data.is_pinned);
        setTags(data.tags ?? []);
      }
      setLoading(false);
    })();
  }, [noteId, isEdit]);

  function toggleTag(t: string) {
    setTags((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]);
  }

  async function handleSave() {
    if (!body.trim()) {
      Alert.alert('エラー', '本文を入力してください');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        title: title.trim() || null,
        body: body.trim(),
        is_pinned: isPinned,
        tags: tags.length > 0 ? tags : null,
      };
      if (isEdit) {
        const { error } = await supabase
          .from('staff_notes')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', noteId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('staff_notes')
          .insert({ ...payload, author_id: profile?.id, store_id: selectedStore });
        if (error) throw error;
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.label}>タイトル（任意）</Text>
      <TextInput
        style={styles.input}
        placeholder="例: 明日の機材点検について"
        placeholderTextColor={COLORS.textLight}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>本文 *</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        multiline
        placeholder="申し送り内容..."
        placeholderTextColor={COLORS.textLight}
        value={body}
        onChangeText={setBody}
        textAlignVertical="top"
      />

      <Text style={styles.label}>タグ</Text>
      <View style={styles.tagRow}>
        {QUICK_TAGS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tagChip, tags.includes(t) && styles.tagChipActive]}
            onPress={() => toggleTag(t)}
          >
            <Text style={[styles.tagChipText, tags.includes(t) && styles.tagChipTextActive]}>
              #{t}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.toggleLabel}>ピン留め</Text>
          <Text style={styles.toggleSub}>重要な申し送りを上部に固定します</Text>
        </View>
        <Switch
          value={isPinned}
          onValueChange={setIsPinned}
          trackColor={{ true: COLORS.warning, false: COLORS.border }}
          thumbColor="#FFF"
        />
      </View>

      <TouchableOpacity
        style={[styles.saveBtn, saving && { opacity: 0.5 }]}
        onPress={handleSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <>
            <Ionicons name="save" size={16} color="#FFF" />
            <Text style={styles.saveBtnText}>{isEdit ? '更新' : '投稿'}</Text>
          </>
        )}
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: COLORS.text,
  },
  textarea: { minHeight: 160 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tagChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  tagChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  tagChipText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  tagChipTextActive: { color: '#FFF' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, padding: 14, borderRadius: 10, marginTop: 14, gap: 12,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  toggleSub: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: 12,
    marginTop: 24,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
