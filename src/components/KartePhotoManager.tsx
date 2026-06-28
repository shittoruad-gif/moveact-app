// カルテ写真管理コンポーネント
// =====================================================
// 施術前(before) / 施術後(after) / 経過(progress) ごとに写真を管理。
// カメラ撮影またはライブラリから選択 → Supabase Storage にアップロード → 一覧表示。
// =====================================================
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator,
  Alert, ScrollView, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../lib/constants';
import {
  KarteImage, KarteImageType,
  pickImage, uploadKarteImage, deleteKarteImage, fetchKarteImages,
} from '../lib/karteImageUpload';

interface Props {
  karteId: string;
  uploadedBy?: string;
  canEdit?: boolean; // スタッフは true、顧客は false
}

const TYPE_OPTIONS: { value: KarteImageType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'before',   label: 'Before（施術前）', icon: 'arrow-back-circle-outline' },
  { value: 'after',    label: 'After（施術後）',  icon: 'arrow-forward-circle-outline' },
  { value: 'progress', label: '経過',             icon: 'analytics-outline' },
  { value: 'other',    label: 'その他',           icon: 'image-outline' },
];

export function KartePhotoManager({ karteId, uploadedBy, canEdit = true }: Props) {
  const [images, setImages] = useState<KarteImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewImage, setPreviewImage] = useState<KarteImage | null>(null);
  const [pendingType, setPendingType] = useState<KarteImageType | null>(null);

  useEffect(() => {
    if (karteId) load();
  }, [karteId]);

  async function load() {
    setLoading(true);
    const list = await fetchKarteImages(karteId);
    setImages(list);
    setLoading(false);
  }

  async function handleAddPhoto(type: KarteImageType, source: 'camera' | 'library') {
    setPendingType(null);

    const picked = await pickImage(source);
    if (!picked.permissionGranted) {
      Alert.alert(
        '権限エラー',
        source === 'camera'
          ? 'カメラへのアクセスが許可されていません。設定アプリで許可してください。'
          : '写真ライブラリへのアクセスが許可されていません。',
      );
      return;
    }
    if (picked.cancelled || !picked.uri) return;

    setUploading(true);
    const result = await uploadKarteImage({
      karteId,
      uri: picked.uri,
      imageType: type,
      mimeType: picked.mimeType,
      uploadedBy,
    });
    setUploading(false);

    if (!result.success || !result.image) {
      Alert.alert('アップロード失敗', result.error ?? '画像のアップロードに失敗しました');
      return;
    }
    setImages((prev) => [...prev, result.image!]);
  }

  function confirmAdd(type: KarteImageType) {
    setPendingType(type);
  }

  function handleDelete(image: KarteImage) {
    Alert.alert(
      '写真を削除',
      'この写真を削除します。よろしいですか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteKarteImage(image);
            if (!result.success) {
              Alert.alert('削除失敗', result.error ?? '削除できませんでした');
              return;
            }
            setImages((prev) => prev.filter((i) => i.id !== image.id));
            setPreviewImage(null);
          },
        },
      ],
    );
  }

  const byType = (type: KarteImageType) => images.filter((i) => i.image_type === type);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {TYPE_OPTIONS.map((opt) => {
        const list = byType(opt.value);
        return (
          <View key={opt.value} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name={opt.icon} size={18} color={COLORS.accent} />
              <Text style={styles.sectionTitle}>{opt.label}</Text>
              <Text style={styles.sectionCount}>{list.length}枚</Text>
              {canEdit && (
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => confirmAdd(opt.value)}
                  disabled={uploading}
                >
                  <Ionicons name="add" size={18} color="#FFF" />
                  <Text style={styles.addBtnText}>追加</Text>
                </TouchableOpacity>
              )}
            </View>

            {list.length === 0 ? (
              <Text style={styles.emptyText}>写真はまだありません</Text>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
                {list.map((img) => (
                  <TouchableOpacity
                    key={img.id}
                    onPress={() => setPreviewImage(img)}
                    style={styles.thumbWrap}
                  >
                    <Image source={{ uri: img.image_url }} style={styles.thumb} />
                    <Text style={styles.thumbDate}>
                      {new Date(img.taken_at).toLocaleDateString('ja-JP')}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        );
      })}

      {uploading && (
        <View style={styles.uploadingOverlay}>
          <ActivityIndicator color={COLORS.accent} size="large" />
          <Text style={styles.uploadingText}>アップロード中...</Text>
        </View>
      )}

      {/* カメラ/ライブラリ選択ダイアログ */}
      <Modal
        visible={pendingType !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingType(null)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setPendingType(null)}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>写真を追加</Text>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => pendingType && handleAddPhoto(pendingType, 'camera')}
            >
              <Ionicons name="camera-outline" size={22} color={COLORS.accent} />
              <Text style={styles.modalOptionText}>カメラで撮影</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalOption}
              onPress={() => pendingType && handleAddPhoto(pendingType, 'library')}
            >
              <Ionicons name="images-outline" size={22} color={COLORS.accent} />
              <Text style={styles.modalOptionText}>ライブラリから選択</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalOption, styles.modalCancel]}
              onPress={() => setPendingType(null)}
            >
              <Text style={styles.modalCancelText}>キャンセル</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* プレビュー */}
      <Modal
        visible={previewImage !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setPreviewImage(null)}
      >
        <View style={styles.previewBackdrop}>
          <TouchableOpacity
            style={styles.previewClose}
            onPress={() => setPreviewImage(null)}
          >
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>
          {previewImage && (
            <>
              <Image source={{ uri: previewImage.image_url }} style={styles.previewImage} resizeMode="contain" />
              <Text style={styles.previewDate}>
                {new Date(previewImage.taken_at).toLocaleString('ja-JP')}
              </Text>
              {canEdit && (
                <TouchableOpacity
                  style={styles.previewDelete}
                  onPress={() => previewImage && handleDelete(previewImage)}
                >
                  <Ionicons name="trash-outline" size={18} color="#FFF" />
                  <Text style={styles.previewDeleteText}>削除</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 12 },
  loading: { padding: 20, alignItems: 'center' },

  section: {
    backgroundColor: COLORS.surface,
    padding: 12,
    borderRadius: 10,
    gap: 8,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.text },
  sectionCount: { fontSize: 11, color: COLORS.textLight },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 2,
    backgroundColor: COLORS.accent, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 14,
  },
  addBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },

  emptyText: { fontSize: 11, color: COLORS.textLight, paddingVertical: 8 },

  thumbRow: { gap: 8 },
  thumbWrap: { alignItems: 'center' },
  thumb: { width: 88, height: 88, borderRadius: 8, backgroundColor: COLORS.backgroundSoft },
  thumbDate: { fontSize: 10, color: COLORS.textSecondary, marginTop: 4 },

  uploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  uploadingText: { fontSize: 13, color: COLORS.text },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  modalCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 20,
    width: '100%', maxWidth: 320, gap: 8,
  },
  modalTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 14,
    borderRadius: 10, backgroundColor: COLORS.backgroundSoft,
  },
  modalOptionText: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  modalCancel: { backgroundColor: 'transparent', justifyContent: 'center', marginTop: 4 },
  modalCancelText: { fontSize: 13, color: COLORS.textLight, fontWeight: '600' },

  previewBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center', alignItems: 'center',
  },
  previewClose: { position: 'absolute', top: 60, right: 20, padding: 8 },
  previewImage: { width: '100%', height: '80%' },
  previewDate: { color: '#FFF', fontSize: 12, marginTop: 12 },
  previewDelete: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    position: 'absolute', bottom: 60,
    backgroundColor: COLORS.error, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 24,
  },
  previewDeleteText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
});
