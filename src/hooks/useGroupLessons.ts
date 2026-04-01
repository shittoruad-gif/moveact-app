import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useStoreSelection } from '../stores/storeSelectionStore';
import { useAuthStore } from '../stores/authStore';
import type { GroupLesson, GroupLessonBooking } from '../types/database';

export function useGroupLessons() {
  const { selectedStore } = useStoreSelection();
  const { session } = useAuthStore();
  const [lessons, setLessons] = useState<GroupLesson[]>([]);
  const [myBookings, setMyBookings] = useState<GroupLessonBooking[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLessons = useCallback(async () => {
    setIsLoading(true);
    const now = new Date().toISOString();
    const { data } = await supabase
      .from('group_lessons')
      .select('*')
      .eq('store_id', selectedStore)
      .eq('is_cancelled', false)
      .gte('starts_at', now)
      .order('starts_at');

    setLessons((data as GroupLesson[]) ?? []);
    setIsLoading(false);
  }, [selectedStore]);

  const fetchMyBookings = useCallback(async () => {
    if (!session?.user) return;
    const { data } = await supabase
      .from('group_lesson_bookings')
      .select('*, group_lesson:group_lessons(*)')
      .eq('user_id', session.user.id)
      .eq('status', 'confirmed')
      .order('booked_at', { ascending: false });

    setMyBookings((data as GroupLessonBooking[]) ?? []);
  }, [session?.user?.id]);

  useEffect(() => {
    fetchLessons();
    fetchMyBookings();

    // Realtime subscription for live capacity updates
    const channel = supabase
      .channel('group_lessons_changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'group_lessons', filter: `store_id=eq.${selectedStore}` },
        (payload) => {
          setLessons((prev) =>
            prev.map((l) => (l.id === payload.new.id ? { ...l, ...payload.new } as GroupLesson : l))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchLessons, fetchMyBookings, selectedStore]);

  async function bookLesson(lessonId: string, paymentMethod: string, ticketId?: string) {
    if (!session?.user) return { error: new Error('Not authenticated') };

    const { data, error } = await supabase
      .from('group_lesson_bookings')
      .insert({
        user_id: session.user.id,
        group_lesson_id: lessonId,
        status: 'confirmed',
        payment_method: paymentMethod,
        user_ticket_id: ticketId ?? null,
        booked_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (!error) {
      // Increment current_bookings
      await supabase.rpc('increment_lesson_bookings', { lesson_id: lessonId });
      // If using ticket, deduct a session
      if (ticketId) {
        await supabase.rpc('deduct_ticket_session', {
          p_ticket_id: ticketId,
          p_reason: 'booking_used',
          p_booking_id: data?.id,
        });
      }
      fetchLessons();
      fetchMyBookings();
    }

    return { data, error };
  }

  async function cancelBooking(bookingId: string) {
    const { error } = await supabase
      .from('group_lesson_bookings')
      .update({ status: 'cancelled_by_user', cancelled_at: new Date().toISOString() })
      .eq('id', bookingId);

    if (!error) {
      fetchLessons();
      fetchMyBookings();
    }

    return { error };
  }

  return {
    lessons,
    myBookings,
    isLoading,
    bookLesson,
    cancelBooking,
    refetch: () => { fetchLessons(); fetchMyBookings(); },
  };
}
