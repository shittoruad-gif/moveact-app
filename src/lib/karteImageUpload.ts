// カルテ写真アップロード用ヘルパー
// Supabase Storage の karte-photos バケットへ画像をアップロード／削除する。
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

export type KarteImageType = 'before' | 'after' | 'progress' | 'other';

export interface KarteImage {
  id: string;
  karte_id: string;
  image_url: string;
  storage_path: string | null;
  image_type: KarteImageType;
  caption: string | null;
  taken_at: string;
  sort_order: number;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface UploadResult {
  success: boolean;
  image?: KarteImage;
  error?: string;
}

/**
 * 画像ピッカーを開いて写真を選択。
 * permissionGranted=false の場合は権限拒否、cancelled=true でユーザーがキャンセル。
 */
export async function pickImage(
  source: 'camera' | 'library' = 'library',
): Promise<{ uri?: string; cancelled: boolean; permissionGranted: boolean; mimeType?: string }> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { cancelled: false, permissionGranted: false };
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return { cancelled: true, permissionGranted: true };
    return {
      uri: result.assets[0].uri,
      mimeType: result.assets[0].mimeType,
      cancelled: false,
      permissionGranted: true,
    };
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { cancelled: false, permissionGranted: false };
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
    });
    if (result.canceled) return { cancelled: true, permissionGranted: true };
    return {
      uri: result.assets[0].uri,
      mimeType: result.assets[0].mimeType,
      cancelled: false,
      permissionGranted: true,
    };
  }
}

/**
 * 選択した画像を Supabase Storage にアップロードし、karte_images に行を作成する。
 */
export async function uploadKarteImage(params: {
  karteId: string;
  uri: string;
  imageType: KarteImageType;
  mimeType?: string;
  caption?: string;
  uploadedBy?: string;
}): Promise<UploadResult> {
  const { karteId, uri, imageType, mimeType, caption, uploadedBy } = params;

  try {
    // ファイル名を生成（karte_id/uuid.ext）
    const ext = (mimeType?.split('/')[1] || uri.split('.').pop() || 'jpg').toLowerCase();
    const filename = `${karteId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    // FileSystem で読み込み → ArrayBuffer に変換
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const arrayBuffer = base64ToArrayBuffer(base64);

    // Storage にアップロード
    const contentType = mimeType ?? `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const { error: uploadErr } = await supabase.storage
      .from('karte-photos')
      .upload(filename, arrayBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadErr) {
      return { success: false, error: uploadErr.message };
    }

    // 公開 URL を取得（バケットは private のため signed URL が必要）
    const { data: signedData, error: signedErr } = await supabase.storage
      .from('karte-photos')
      .createSignedUrl(filename, 60 * 60 * 24 * 365); // 1年

    if (signedErr || !signedData) {
      return { success: false, error: signedErr?.message ?? 'Failed to create signed URL' };
    }

    // karte_images に行を作成
    const { data: row, error: insertErr } = await supabase
      .from('karte_images')
      .insert({
        karte_id: karteId,
        image_url: signedData.signedUrl,
        storage_path: filename,
        image_type: imageType,
        caption: caption ?? null,
        uploaded_by: uploadedBy ?? null,
      })
      .select()
      .single();

    if (insertErr || !row) {
      // ロールバック: アップロード済みの画像を削除
      await supabase.storage.from('karte-photos').remove([filename]);
      return { success: false, error: insertErr?.message ?? 'Failed to insert image record' };
    }

    return { success: true, image: row as KarteImage };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * カルテ写真を削除（Storage + DB 行両方）
 */
export async function deleteKarteImage(image: KarteImage): Promise<{ success: boolean; error?: string }> {
  try {
    if (image.storage_path) {
      await supabase.storage.from('karte-photos').remove([image.storage_path]);
    }
    const { error } = await supabase.from('karte_images').delete().eq('id', image.id);
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (e) {
    return { success: false, error: (e as Error).message };
  }
}

/**
 * カルテに紐づく全画像を取得（sort_order, taken_at 順）
 */
export async function fetchKarteImages(karteId: string): Promise<KarteImage[]> {
  const { data, error } = await supabase
    .from('karte_images')
    .select('*')
    .eq('karte_id', karteId)
    .order('image_type', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('taken_at', { ascending: true });

  if (error) {
    console.error('fetchKarteImages error:', error);
    return [];
  }
  return (data ?? []) as KarteImage[];
}

/**
 * Base64 文字列を ArrayBuffer に変換（React Native では Buffer がデフォルトでないので手動実装）
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = globalThis.atob ? globalThis.atob(base64) : decodeBase64(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// atob fallback (一部の RN 環境で必要)
function decodeBase64(input: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '=') break;
    const v = chars.indexOf(c);
    if (v < 0) continue;
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}
