import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import { useStoreSelection } from '../stores/storeSelectionStore';
import type { UserTicket, TicketPlan } from '../types/database';

export function useTickets() {
  const { session, profile } = useAuthStore();
  const { selectedStore } = useStoreSelection();
  const [tickets, setTickets] = useState<UserTicket[]>([]);
  const [allPlans, setAllPlans] = useState<TicketPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchTickets = useCallback(async () => {
    if (!session?.user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from('user_tickets')
      .select('*, ticket_plan:ticket_plans(*)')
      .eq('user_id', session.user.id)
      .eq('store_id', selectedStore)
      .eq('status', 'active')
      .order('expires_at', { ascending: true });

    setTickets((data as UserTicket[]) ?? []);
    setIsLoading(false);
  }, [session?.user?.id, selectedStore]);

  const fetchPlans = useCallback(async () => {
    const { data } = await supabase
      .from('ticket_plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');

    setAllPlans((data as TicketPlan[]) ?? []);
  }, []);

  useEffect(() => {
    fetchTickets();
    fetchPlans();
  }, [fetchTickets, fetchPlans]);

  // タグベースのフィルタリング
  // target_tagsが空のプラン → 全員に表示
  // target_tagsが設定されたプラン → ユーザーのtagsと1つ以上一致する場合のみ表示
  const plans = useMemo(() => {
    const userTags = profile?.tags ?? [];
    return allPlans.filter((plan) => {
      const targetTags = plan.target_tags ?? [];
      if (targetTags.length === 0) return true;
      return targetTags.some((tag) => userTags.includes(tag));
    });
  }, [allPlans, profile?.tags]);

  const totalRemainingSessions = tickets.reduce((sum, t) => sum + t.remaining_sessions, 0);

  return {
    tickets,
    plans,
    isLoading,
    totalRemainingSessions,
    refetch: fetchTickets,
  };
}
