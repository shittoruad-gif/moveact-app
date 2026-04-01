import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { StoreSelector } from '../../components/layout/StoreSelector';
import { useAuthStore } from '../../stores/authStore';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { useTickets } from '../../hooks/useTickets';
import { useGroupLessons } from '../../hooks/useGroupLessons';
import { supabase } from '../../lib/supabase';
import { ReviewRequestModal } from '../../components/ReviewRequestModal';
import { useReviewRequest } from '../../hooks/useReviewRequest';
import type { Announcement } from '../../types/database';

export function HomeScreen() {
  const navigation = useNavigation<any>();
  const reviewRequest = useReviewRequest();
  const { profile } = useAuthStore();
  const { selectedStore } = useStoreSelection();
  const { totalRemainingSessions, refetch: refetchTickets } = useTickets();
  const { myBookings, refetch: refetchLessons } = useGroupLessons();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const storeName = STORES[selectedStore].name;
  const firstName = profile?.full_name?.split(/\s/)[0] ?? '';

  useEffect(() => {
    fetchAnnouncements();
  }, [selectedStore]);

  async function fetchAnnouncements() {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .eq('is_active', true)
      .or(`store_id.eq.${selectedStore},store_id.is.null`)
      .order('published_at', { ascending: false })
      .limit(5);
    setAnnouncements((data as Announcement[]) ?? []);
  }

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refetchTickets(), refetchLessons(), fetchAnnouncements()]);
    setRefreshing(false);
  }

  const nextBooking = myBookings[0];

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'おはようございます';
    if (h < 18) return 'こんにちは';
    return 'こんばんは';
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.accent} />}
    >
      <StoreSelector />

      {/* Greeting */}
      <View style={styles.greetingSection}>
        <Text style={styles.greeting}>{greeting()}</Text>
        <Text style={styles.userName}>
          {firstName ? `${firstName}さん` : 'ゲストさん'}
        </Text>
      </View>

      {/* Next Booking */}
      {nextBooking?.group_lesson && (
        <TouchableOpacity
          style={styles.bookingCard}
          onPress={() => navigation.navigate('BookingTab', {
            screen: 'GroupLessonDetail',
            params: { lessonId: nextBooking.group_lesson_id },
          })}
        >
          <View style={styles.bookingCardAccent} />
          <View style={styles.bookingCardContent}>
            <Text style={styles.cardLabel}>次のご予約</Text>
            <Text style={styles.bookingTitle}>{nextBooking.group_lesson.title}</Text>
            <View style={styles.bookingDateRow}>
              <Ionicons name="time-outline" size={14} color={COLORS.textSecondary} />
              <Text style={styles.bookingDate}>
                {new Date(nextBooking.group_lesson.starts_at).toLocaleDateString('ja-JP', {
                  month: 'long', day: 'numeric', weekday: 'short',
                  hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      )}

      {/* Ticket Summary */}
      <TouchableOpacity
        style={styles.ticketCard}
        onPress={() => navigation.navigate('TicketTab')}
      >
        <View style={styles.ticketLeft}>
          <Text style={styles.cardLabel}>ご利用可能な回数券</Text>
          <View style={styles.ticketCountRow}>
            <Text style={styles.ticketCount}>{totalRemainingSessions}</Text>
            <Text style={styles.ticketUnit}>回</Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
      </TouchableOpacity>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => navigation.navigate('BookingTab', { screen: 'BookingWebView', params: { storeId: selectedStore } })}
        >
          <View style={[styles.quickIconWrap, { backgroundColor: '#F5EDE5' }]}>
            <Ionicons name="calendar-outline" size={22} color={COLORS.accent} />
          </View>
          <Text style={styles.quickActionText}>施術予約</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => navigation.navigate('BookingTab', { screen: 'GroupLessonList' })}
        >
          <View style={[styles.quickIconWrap, { backgroundColor: '#EDE5F0' }]}>
            <Ionicons name="people-outline" size={22} color="#9B7FA7" />
          </View>
          <Text style={styles.quickActionText}>レッスン</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => navigation.navigate('ShopTab')}
        >
          <View style={[styles.quickIconWrap, { backgroundColor: '#E5EDE8' }]}>
            <Ionicons name="bag-outline" size={22} color={COLORS.success} />
          </View>
          <Text style={styles.quickActionText}>ショップ</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => navigation.navigate('TicketTab', { screen: 'TicketPurchase' })}
        >
          <View style={[styles.quickIconWrap, { backgroundColor: '#F5E8E8' }]}>
            <Ionicons name="ticket-outline" size={22} color={COLORS.accentPink} />
          </View>
          <Text style={styles.quickActionText}>回数券</Text>
        </TouchableOpacity>
      </View>

      {/* Announcements */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>お知らせ</Text>
        {announcements.length === 0 ? (
          <Text style={styles.emptyText}>お知らせはありません</Text>
        ) : (
          announcements.map((a) => (
            <TouchableOpacity key={a.id} style={styles.announcementItem}>
              <Text style={styles.announcementDate}>
                {a.published_at ? new Date(a.published_at).toLocaleDateString('ja-JP') : ''}
              </Text>
              <Text style={styles.announcementTitle} numberOfLines={2}>{a.title}</Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={{ height: 32 }} />

      {/* Review Request Modal */}
      <ReviewRequestModal
        visible={reviewRequest.visible}
        lessonTitle={reviewRequest.lessonTitle}
        onYes={reviewRequest.handleYes}
        onNo={reviewRequest.handleNo}
        onNeverShow={reviewRequest.handleNeverShow}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  greetingSection: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 20,
  },
  greeting: {
    fontSize: 13,
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
  },
  userName: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  bookingCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  bookingCardAccent: {
    width: 4,
    backgroundColor: COLORS.accent,
  },
  bookingCardContent: {
    flex: 1,
    padding: 20,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    marginBottom: 6,
  },
  bookingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  bookingDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bookingDate: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  ticketCard: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  ticketLeft: {
    flex: 1,
  },
  ticketCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  ticketCount: {
    fontSize: 32,
    fontWeight: '300',
    color: COLORS.accent,
  },
  ticketUnit: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  quickActions: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 28,
    gap: 10,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  quickIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionText: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textSecondary,
    letterSpacing: 0.3,
  },
  section: {
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingVertical: 24,
  },
  announcementItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  announcementDate: {
    fontSize: 11,
    color: COLORS.textLight,
    marginBottom: 4,
  },
  announcementTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.text,
    lineHeight: 20,
  },
});
