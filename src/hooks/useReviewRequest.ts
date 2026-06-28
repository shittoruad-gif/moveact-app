import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { openGoogleReview, markReviewRequested } from '../lib/googleReview';
import type { StoreId } from '../types/database';

const REVIEW_OPT_OUT_KEY = 'review_opt_out';
const REVIEW_TOOL_URL = 'https://reviewgen-jlu6hskc.manus.space';

type BookingSource = 'group_lesson' | 'app_booking';

export function useReviewRequest() {
  const { session, profile } = useAuthStore();
  const [visible, setVisible] = useState(false);
  const [lessonTitle, setLessonTitle] = useState<string | undefined>();
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [pendingSource, setPendingSource] = useState<BookingSource | null>(null);
  const [pendingStoreId, setPendingStoreId] = useState<StoreId | null>(null);

  // Check if there's a completed booking that needs a review prompt
  const checkForReviewPrompt = useCallback(async () => {
    if (!session?.user) return;

    // Check local opt-out first
    const optedOut = await AsyncStorage.getItem(REVIEW_OPT_OUT_KEY);
    if (optedOut === 'true') return;

    // Check server opt-out
    if (profile?.review_opt_out) return;

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const now = new Date();

    // --- 1. 個別施術予約（app_bookings）を優先チェック ---
    const { data: recentAppBookings } = await supabase
      .from('app_bookings')
      .select('id, store_id, ends_at, treatment_menu:treatment_menus(name)')
      .eq('user_id', session.user.id)
      .in('status', ['confirmed', 'completed'])
      .lte('ends_at', now.toISOString())
      .gte('ends_at', yesterday.toISOString())
      .is('review_requested_at', null)
      .order('ends_at', { ascending: false })
      .limit(1);

    if (recentAppBookings?.length) {
      const b = recentAppBookings[0] as any;
      const promptedKey = `review_prompted_${b.id}`;
      const alreadyPrompted = await AsyncStorage.getItem(promptedKey);
      if (!alreadyPrompted) {
        setLessonTitle(b.treatment_menu?.name);
        setPendingBookingId(b.id);
        setPendingSource('app_booking');
        setPendingStoreId(b.store_id as StoreId);
        setVisible(true);
        return;
      }
    }

    // --- 2. グループレッスンをチェック（既存ロジック） ---
    const { data: recentBookings } = await supabase
      .from('group_lesson_bookings')
      .select('id, group_lesson:group_lessons(title, starts_at)')
      .eq('user_id', session.user.id)
      .in('status', ['confirmed', 'completed'])
      .order('booked_at', { ascending: false })
      .limit(1);

    if (!recentBookings?.length) return;

    const booking = recentBookings[0];
    const lesson = booking.group_lesson as any;
    if (!lesson?.starts_at) return;

    const lessonEnd = new Date(lesson.starts_at);
    lessonEnd.setHours(lessonEnd.getHours() + 1); // Assume 1-hour lesson

    // Show review prompt if lesson ended in the last 24 hours
    if (lessonEnd < yesterday || lessonEnd > now) return;

    // Check if we already prompted for this booking
    const promptedKey = `review_prompted_${booking.id}`;
    const alreadyPrompted = await AsyncStorage.getItem(promptedKey);
    if (alreadyPrompted) return;

    // Show the modal
    setLessonTitle(lesson.title);
    setPendingBookingId(booking.id);
    setPendingSource('group_lesson');
    setVisible(true);
  }, [session?.user?.id, profile?.review_opt_out]);

  useEffect(() => {
    // Delay the check slightly so the home screen loads first
    const timer = setTimeout(checkForReviewPrompt, 2000);
    return () => clearTimeout(timer);
  }, [checkForReviewPrompt]);

  async function handleYes() {
    setVisible(false);
    // Mark as prompted
    if (pendingBookingId) {
      await AsyncStorage.setItem(`review_prompted_${pendingBookingId}`, 'true');
      if (pendingSource === 'app_booking') {
        await markReviewRequested(pendingBookingId);
      }
    }
    // Open review generation tool
    try {
      await Linking.openURL(REVIEW_TOOL_URL);
    } catch {
      // Fallback
    }
  }

  // Google レビュー直接投稿
  async function handleGoogleReview() {
    setVisible(false);
    if (pendingBookingId) {
      await AsyncStorage.setItem(`review_prompted_${pendingBookingId}`, 'true');
      if (pendingSource === 'app_booking') {
        await markReviewRequested(pendingBookingId);
      }
    }
    if (pendingStoreId) {
      await openGoogleReview(pendingStoreId);
    }
  }

  function handleNo() {
    setVisible(false);
    // Mark as prompted so we don't ask again for this booking
    if (pendingBookingId) {
      AsyncStorage.setItem(`review_prompted_${pendingBookingId}`, 'true');
    }
  }

  async function handleNeverShow() {
    setVisible(false);
    // Save opt-out locally
    await AsyncStorage.setItem(REVIEW_OPT_OUT_KEY, 'true');
    // Save opt-out on server (so push notifications also stop)
    if (session?.user) {
      await supabase
        .from('profiles')
        .update({ review_opt_out: true })
        .eq('id', session.user.id);
    }
  }

  return {
    visible,
    lessonTitle,
    handleYes,
    handleGoogleReview,
    handleNo,
    handleNeverShow,
    showGoogleReviewButton: pendingSource === 'app_booking' && !!pendingStoreId,
  };
}
