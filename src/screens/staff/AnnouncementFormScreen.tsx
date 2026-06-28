// お知らせ作成・編集（スタッフ用）
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';

export function AnnouncementFormScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const profile = useAuthStore((s) => s.profile);
  const announcementId: string | undefined = route.params?.announcementId;
  const isEdit = !!announcementId;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [broadcastNow, setBroadcastNow] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [alreadyBroadcast, setAlreadyBroadcast] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const { data } = await supabase
        .from('announcements').select('*').eq('id', announcementId).single();
      if (data) {
        setTitle(data.title);
        setBody(data.body ?? '');
        setImageUrl(data.image_url ?? '');
        setStoreId(data.store_id);
        setIsActive(data.is_active);
        setAlreadyBroadcast(!!data.line_broadcast_at);
      }
      setLoading(false);
    })();
  }, [announcementId, isEdit]);

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('エラー', 'タイトルを入力してください');
      return;
    }
    setSaving(true);
    try {
      let savedId = announcementId;
      const payload: any = {
        title: title.trim(),
        body: body.trim() || null,
        image_url: imageUrl.trim() || null,
        store_id: storeId,
        is_active: isActive,
        published_at: new Date().toISOString(),
      };

      if (isEdit) {
        const { error } = await supabase
          .from('announcements').update(payload).eq('id', announcementId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('announcements').insert(payload).select('id').single();
        if (error) throw error;
        savedId = data.id;
      }

      // Optional broadcast
      if (broadcastNow && savedId && !alreadyBroadcast) {
        try {
          const { data, error } = await supabase.functions.invoke('broadcast-line-announcement', {
            body: { announcement_id: savedId },
          });
          if (error) throw error;
          const sent = (data as any)?.sent ?? 0;
          Alert.alert('保存・配信完了', `保存しました。${sent}人にLINE配信しました`, [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          return;
        } catch (e: any) {
          Alert.alert(
            '保存しましたが配信に失敗',
            e?.message ?? '一覧画面から再配信できます',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
          return;
        }
      }

      Alert.alert('保存完了', 'お知らせを保存しました', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
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
      <Text style={styles.label}>タイトル *</Text>
      <TextInput
        style={styles.input}
        placeholder="例: 年末年始の営業について"
        placeholderTextColor={COLORS.textLight}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={styles.label}>本文</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        multiline
        placeholder="お知らせの詳細..."
        placeholderTextColor={COLORS.textLight}
        value={body}
        onChangeText={setBody}
        textAlignVertical="top"
      />

      <Text style={styles.label}>画像URL（任意）</Text>
      <TextInput
        style={styles.input}
        placeholder="https://..."
        placeholderTextColor={COLORS.textLight}
        value={imageUrl}
        onChangeText={setImageUrl}
        autoCapitalize="none"
      />

      <Text style={styles.label}>対象店舗</Text>
      <View style={styles.storeRow}>
        {[
          { id: null as string | null, label: '全店' },
          { id: 'kanamitsu' as string | null, label: STORES.kanamitsu.name },
          { id: 'tamashima' as string | null, label: STORES.tamashima.name },
        ].map((s) => (
          <TouchableOpacity
            key={s.id ?? 'all'}
            style={[styles.chip, storeId === s.id && styles.chipActive]}
            onPress={() => setStoreId(s.id)}
          >
            <Text style={[styles.chipText, storeId === s.id && styles.chipTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.toggleRow}>
        <View>
          <Text style={styles.toggleLabel}>公開</Text>
          <Text style={styles.toggleSub}>アプリ上で顧客に表示します</Text>
        </View>
        <Switch
          value={isActive}
          onValueChange={setIsActive}
          trackColor={{ true: COLORS.accent, false: COLORS.border }}
          thumbColor="#FFF"
        />
      </View>

      {!alreadyBroadcast && (
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>保存時にLINE一斉配信</Text>
            <Text style={styles.toggleSub}>LINE連携済みの全顧客に配信します</Text>
          </View>
          <Switch
            value={broadcastNow}
            onValueChange={setBroadcastNow}
            trackColor={{ true: '#06C755', false: COLORS.border }}
            thumbColor="#FFF"
          />
        </View>
      )}

      {alreadyBroadcast && (
        <View style={styles.alreadyCard}>
          <Ionicons name="checkmark-circle" size={16} color="#06C755" />
          <Text style={styles.alreadyText}>
            このお知らせは既にLINE配信済みです（重複配信はできません）
          </Text>
        </View>
      )}

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
            <Text style={styles.saveBtnText}>
              {broadcastNow ? '保存してLINE配信' : isEdit ? '更新' : '作成'}
            </Text>
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
  textarea: { minHeight: 140 },
  storeRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive: { color: '#FFF' },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, padding: 14, borderRadius: 10, marginTop: 14, gap: 12,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  toggleSub: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  alreadyCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#06C75512', padding: 12, borderRadius: 10, marginTop: 14,
  },
  alreadyText: { flex: 1, fontSize: 11, color: '#06C755', fontWeight: '600' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: 12,
    marginTop: 24,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
