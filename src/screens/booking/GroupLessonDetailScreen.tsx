import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TouchableOpacity, Linking } from 'react-native';
import { COLORS } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';
import { useGroupLessons } from '../../hooks/useGroupLessons';
import { useTickets } from '../../hooks/useTickets';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingStackParamList } from '../../types/navigation';
import type { GroupLesson } from '../../types/database';

// 回数券購入リンク（後ほど正式URLに差し替え）
const TICKET_PURCHASE_URL = '';

type Props = NativeStackScreenProps<BookingStackParamList, 'GroupLessonDetail'>;

export function GroupLessonDetailScreen({ route, navigation }: Props) {
  const { lessonId } = route.params;
  const [lesson, setLesson] = useState<GroupLesson | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'ticket' | 'payment' | null>(null);
  const { bookLesson, myBookings } = useGroupLessons();
  const { tickets } = useTickets();

  const isBooked = myBookings.some((b) => b.group_lesson_id === lessonId);

  // Find eligible ticket: universal (treatment_type null) or group_pilates/pilates specific
  const eligibleTicket = lesson?.is_ticket_eligible
    ? tickets.find((t) =>
        t.remaining_sessions > 0 &&
        (t.ticket_plan?.treatment_type === null ||
         t.ticket_plan?.treatment_type === 'pilates' ||
         t.ticket_plan?.treatment_type === 'group_pilates')
      )
    : undefined;

  useEffect(() => {
    fetchLesson();
  }, [lessonId]);

  async function fetchLesson() {
    const { data } = await supabase
      .from('group_lessons')
      .select('*')
      .eq('id', lessonId)
      .single();
    setLesson((data as GroupLesson) ?? null);
  }

  async function handleBookWithTicket() {
    if (!lesson || !eligibleTicket) return;

    Alert.alert(
      '予約確認',
      `回数券を1回分使用して予約しますか？\n（残り ${eligibleTicket.remaining_sessions} 回 → ${eligibleTicket.remaining_sessions - 1} 回）`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '予約する',
          onPress: async () => {
            setLoading(true);
            const { error } = await bookLesson(lesson.id, 'ticket', eligibleTicket.id);
            setLoading(false);
            if (error) {
              Alert.alert('エラー', '予約に失敗しました');
            } else {
              Alert.alert('予約完了', 'レッスンを予約しました', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            }
          },
        },
      ]
    );
  }

  async function handleBookWithPayment() {
    if (!lesson) return;

    Alert.alert(
      '事前決済で予約',
      `¥${lesson.price.toLocaleString()}（税込）をお支払いして予約しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '決済して予約する',
          onPress: async () => {
            setLoading(true);
            const { error } = await bookLesson(lesson.id, 'payment');
            setLoading(false);
            if (error) {
              Alert.alert('エラー', '予約に失敗しました');
            } else {
              Alert.alert('予約完了', 'レッスンを予約しました。\n決済はレッスン当日に店舗にて承ります。', [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            }
          },
        },
      ]
    );
  }

  if (!lesson) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>読み込み中...</Text>
      </View>
    );
  }

  const spotsLeft = lesson.max_capacity - lesson.current_bookings;
  const isFull = spotsLeft <= 0;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>{lesson.title}</Text>
        <Text style={styles.instructor}>{lesson.instructor_name}</Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>日時</Text>
            <Text style={styles.infoValue}>
              {new Date(lesson.starts_at).toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'short',
              })}
              {'\n'}
              {new Date(lesson.starts_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
              {' - '}
              {new Date(lesson.ends_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>料金</Text>
            <Text style={styles.infoValue}>¥{lesson.price.toLocaleString()}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>空き状況</Text>
            <Text style={[styles.infoValue, isFull && { color: COLORS.error }]}>
              {isFull ? '満席' : `残り ${spotsLeft} / ${lesson.max_capacity} 席`}
            </Text>
          </View>
        </View>

        {lesson.description && (
          <View style={styles.descriptionSection}>
            <Text style={styles.sectionTitle}>レッスン内容</Text>
            <Text style={styles.description}>{lesson.description}</Text>
          </View>
        )}

        {/* Booking section */}
        {isBooked ? (
          <View style={styles.bookedSection}>
            <View style={styles.bookedBadge}>
              <Ionicons name="checkmark-circle" size={20} color={COLORS.success} />
              <Text style={styles.bookedText}>予約済み</Text>
            </View>
          </View>
        ) : isFull ? (
          <View style={styles.buttonSection}>
            <Button title="満席" onPress={() => {}} disabled />
          </View>
        ) : (
          <View style={styles.paymentSection}>
            <Text style={styles.sectionTitle}>予約方法を選択</Text>

            {/* Ticket option */}
            {lesson.is_ticket_eligible && eligibleTicket && (
              <TouchableOpacity
                style={[
                  styles.paymentOption,
                  paymentMethod === 'ticket' && styles.paymentOptionSelected,
                ]}
                onPress={() => setPaymentMethod('ticket')}
              >
                <View style={styles.paymentOptionLeft}>
                  <View style={[styles.radioCircle, paymentMethod === 'ticket' && styles.radioSelected]}>
                    {paymentMethod === 'ticket' && <View style={styles.radioDot} />}
                  </View>
                  <View>
                    <Text style={styles.paymentOptionTitle}>
                      回数券で予約
                    </Text>
                    <Text style={styles.paymentOptionNote}>
                      残り {eligibleTicket.remaining_sessions} 回 → {eligibleTicket.remaining_sessions - 1} 回
                    </Text>
                  </View>
                </View>
                <Text style={styles.paymentOptionPrice}>
                  ¥0
                </Text>
              </TouchableOpacity>
            )}

            {/* No ticket - show purchase link */}
            {lesson.is_ticket_eligible && !eligibleTicket && (
              <View style={styles.noTicketBox}>
                <View style={styles.noTicketHeader}>
                  <Ionicons name="ticket-outline" size={18} color={COLORS.textSecondary} />
                  <Text style={styles.noTicketTitle}>回数券をお持ちでありません</Text>
                </View>
                <Text style={styles.noTicketNote}>
                  回数券をご購入いただくとお得にレッスンをご予約いただけます。
                </Text>
                <TouchableOpacity
                  style={styles.purchaseLink}
                  onPress={() => {
                    if (TICKET_PURCHASE_URL) {
                      Linking.openURL(TICKET_PURCHASE_URL);
                    } else {
                      navigation.navigate('BookingChoice');
                      Alert.alert('準備中', '回数券のオンライン購入は準備中です。\n店舗にてお買い求めください。');
                    }
                  }}
                >
                  <Text style={styles.purchaseLinkText}>回数券を購入する</Text>
                  <Ionicons name="chevron-forward" size={16} color={COLORS.accent} />
                </TouchableOpacity>
              </View>
            )}

            {/* Direct payment option */}
            <TouchableOpacity
              style={[
                styles.paymentOption,
                paymentMethod === 'payment' && styles.paymentOptionSelected,
              ]}
              onPress={() => setPaymentMethod('payment')}
            >
              <View style={styles.paymentOptionLeft}>
                <View style={[styles.radioCircle, paymentMethod === 'payment' && styles.radioSelected]}>
                  {paymentMethod === 'payment' && <View style={styles.radioDot} />}
                </View>
                <View>
                  <Text style={styles.paymentOptionTitle}>都度払いで予約</Text>
                  <Text style={styles.paymentOptionNote}>当日店舗にてお支払い</Text>
                </View>
              </View>
              <Text style={styles.paymentOptionPrice}>
                ¥{lesson.price.toLocaleString()}
              </Text>
            </TouchableOpacity>

            <View style={styles.buttonSection}>
              <Button
                title={
                  paymentMethod === 'ticket' ? '回数券で予約する' :
                  paymentMethod === 'payment' ? `¥${lesson.price.toLocaleString()} で予約する` :
                  '予約方法を選択してください'
                }
                onPress={() => {
                  if (paymentMethod === 'ticket') handleBookWithTicket();
                  else if (paymentMethod === 'payment') handleBookWithPayment();
                }}
                loading={loading}
                disabled={!paymentMethod}
                size="large"
              />
            </View>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  content: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  instructor: {
    fontSize: 15,
    color: COLORS.textSecondary,
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: COLORS.text,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
    marginLeft: 16,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  descriptionSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 22,
  },
  bookedSection: {
    paddingBottom: 32,
    alignItems: 'center',
  },
  bookedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  bookedText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.success,
  },
  paymentSection: {
    marginBottom: 16,
  },
  paymentOption: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentOptionSelected: {
    borderColor: COLORS.accent,
    backgroundColor: '#FDF9F6',
  },
  paymentOptionDisabled: {
    opacity: 0.5,
  },
  paymentOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioSelected: {
    borderColor: COLORS.accent,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accent,
  },
  paymentOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  paymentOptionNote: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  paymentOptionPrice: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.primary,
    marginLeft: 12,
  },
  disabledText: {
    color: COLORS.textLight,
  },
  buttonSection: {
    paddingTop: 12,
    paddingBottom: 32,
  },
  noTicketBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  noTicketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  noTicketTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  noTicketNote: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 18,
    marginBottom: 12,
  },
  purchaseLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FDF5ED',
    paddingVertical: 10,
    borderRadius: 10,
  },
  purchaseLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.accent,
  },
});
