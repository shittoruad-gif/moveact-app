import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { supabase } from '../../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingStackParamList } from '../../types/navigation';
import type { AppBooking } from '../../types/database';

type Props = NativeStackScreenProps<BookingStackParamList, 'BookingComplete'>;

export function BookingCompleteScreen({ route, navigation }: Props) {
  const { bookingId, isNewCustomer } = route.params;
  const { selectedStore } = useStoreSelection();
  const [booking, setBooking] = useState<AppBooking | null>(null);

  useEffect(() => { fetchBooking(); }, []);

  async function fetchBooking() {
    const { data } = await supabase
      .from('app_bookings')
      .select('*, treatment_menu:treatment_menus(*)')
      .eq('id', bookingId)
      .single();
    setBooking(data as AppBooking);
  }

  const store = STORES[selectedStore];
  const dateStr = booking
    ? new Date(booking.starts_at).toLocaleDateString('ja-JP', {
        month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
      })
    : '';

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
      </View>
      <Text style={styles.title}>ご予約が確定しました</Text>

      {booking && (
        <View style={styles.card}>
          <Text style={styles.menuName}>{booking.treatment_menu?.name}</Text>
          <Text style={styles.dateText}>{dateStr}</Text>
          <Text style={styles.storeText}>{store.name}</Text>
        </View>
      )}

      {isNewCustomer ? (
        <>
          {/* 新規のお客様向け: カウンセリング・店舗案内を促す */}
          <View style={styles.newCustomerSection}>
            <View style={styles.stepItem}>
              <View style={styles.stepNumber}><Text style={styles.stepNumberText}>1</Text></View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>カウンセリングシートを記入</Text>
                <Text style={styles.stepDesc}>事前にご記入いただくと、当日スムーズに施術を始められます</Text>
              </View>
            </View>
            <View style={styles.stepItem}>
              <View style={styles.stepNumber}><Text style={styles.stepNumberText}>2</Text></View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>店舗への行き方を確認</Text>
                <Text style={styles.stepDesc}>アクセス・駐車場・ご来店時のご案内をご確認ください</Text>
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            <Button
              title="カウンセリングシートを記入する"
              onPress={() => navigation.replace('CounselingSheet', { bookingId })}
              size="large"
            />
            <Button
              title="店舗への案内を見る"
              onPress={() => navigation.navigate('StoreGuide', { storeId: selectedStore })}
              variant="outline"
              size="large"
            />
            <Button
              title="ホームに戻る"
              onPress={() => navigation.getParent()?.navigate('HomeTab')}
              variant="outline"
              size="large"
            />
          </View>
        </>
      ) : (
        <>
          {/* 既存のお客様向け: シンプルに完了 */}
          <Text style={styles.notice}>
            ご予約時間の5分前までにお越しください。{'\n'}
            通知にてリマインダーをお送りします。
          </Text>

          <View style={styles.actions}>
            <Button
              title="ホームに戻る"
              onPress={() => navigation.getParent()?.navigate('HomeTab')}
              size="large"
            />
            <Button
              title="予約一覧へ"
              onPress={() => navigation.popToTop()}
              variant="outline"
              size="large"
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconWrap: { marginBottom: 20 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 20,
    width: '100%',
    alignItems: 'center',
    gap: 6,
    marginBottom: 24,
  },
  menuName: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  dateText: { fontSize: 14, color: COLORS.textSecondary },
  storeText: { fontSize: 13, color: COLORS.textLight },

  /* 新規向けステップ */
  newCustomerSection: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 18,
    gap: 16,
    marginBottom: 24,
  },
  stepItem: {
    flexDirection: 'row',
    gap: 12,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  stepContent: { flex: 1 },
  stepTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  stepDesc: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },

  /* 既存向け */
  notice: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  actions: { width: '100%', gap: 10 },
});
