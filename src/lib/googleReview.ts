// Google レビュー / マップ連携ヘルパー
// =====================================================
// 店舗ごとの Google レビュー URL を取得し、外部ブラウザで開く。
// 重複送信防止のため app_bookings.review_requested_at を更新する。
// =====================================================
import { Linking, Alert } from 'react-native';
import { supabase } from './supabase';
import type { StoreId } from '../types/database';

interface StoreReviewInfo {
  google_review_url: string | null;
  google_maps_url: string | null;
  google_place_id: string | null;
  name?: string;
}

/**
 * 店舗の Google レビュー / マップ情報を取得。
 */
export async function fetchStoreReviewInfo(storeId: StoreId): Promise<StoreReviewInfo | null> {
  const { data } = await supabase
    .from('stores')
    .select('name, google_review_url, google_maps_url, google_place_id')
    .eq('id', storeId)
    .single();
  return (data as StoreReviewInfo) ?? null;
}

/**
 * Google レビュー画面を開く。
 * 優先度: review_url > place_id 生成 > maps_url > 検索フォールバック
 */
export async function openGoogleReview(storeId: StoreId, storeName?: string): Promise<boolean> {
  const info = await fetchStoreReviewInfo(storeId);

  let url: string | null = null;

  if (info?.google_review_url) {
    url = info.google_review_url;
  } else if (info?.google_place_id) {
    url = `https://search.google.com/local/writereview?placeid=${info.google_place_id}`;
  } else if (info?.google_maps_url) {
    url = info.google_maps_url;
  } else {
    // 最終フォールバック: 検索
    const q = encodeURIComponent(`Moveact ${storeName ?? info?.name ?? storeId}`);
    url = `https://www.google.com/maps/search/${q}`;
  }

  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert('エラー', 'Googleマップを開けませんでした');
      return false;
    }
    await Linking.openURL(url);
    return true;
  } catch (e) {
    console.error('openGoogleReview error:', e);
    Alert.alert('エラー', `Googleレビューを開けませんでした: ${(e as Error).message}`);
    return false;
  }
}

/**
 * 予約のレビュー依頼済フラグを更新（次回以降のプロンプト抑止）
 */
export async function markReviewRequested(bookingId: string): Promise<void> {
  await supabase
    .from('app_bookings')
    .update({ review_requested_at: new Date().toISOString() })
    .eq('id', bookingId);
}

/**
 * 過去24時間〜過去14日のうち、レビュー未依頼の完了予約を取得（口コミ依頼候補）。
 */
export async function fetchPendingReviewBookings(userId: string) {
  const now = new Date();
  const cutoffPast = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const cutoffRecent = new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(); // 施術終了から1h以上経過

  const { data } = await supabase
    .from('app_bookings')
    .select('id, store_id, ends_at, treatment_menu:treatment_menus(name)')
    .eq('user_id', userId)
    .in('status', ['confirmed', 'completed'])
    .lte('ends_at', cutoffRecent)
    .gte('ends_at', cutoffPast)
    .is('review_requested_at', null)
    .order('ends_at', { ascending: false })
    .limit(3);

  return data ?? [];
}
