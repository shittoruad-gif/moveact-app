import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingStackParamList } from '../../types/navigation';
import type { TreatmentMenu } from '../../types/database';

type Props = NativeStackScreenProps<BookingStackParamList, 'BookingConfirm'>;

const BUFFER_MINUTES = 15;

// 事前決済URL（後日設定）
const PREPAYMENT_URL = '';

export function BookingConfirmScreen({ route, navigation }: Props) {
  const { menuId, dateTime, isNewCustomer } = route.params;
  const { selectedStore } = useStoreSelection();
  const { profile } = useAuthStore();
  const [menu, setMenu] = useState<TreatmentMenu | null>(null);
  const [effectivePrice, setEffectivePrice] = useState<number | null>(null);
  const [appliedTag, setAppliedTag] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const startTime = new Date(dateTime);
  const endTime = menu ? new Date(startTime.getTime() + menu.duration_minutes * 60000) : null;

  useEffect(() => { fetchMenu(); }, []);

  async function fetchMenu() {
    const { data } = await supabase
      .from('treatment_menus')
      .select('*')
      .eq('id', menuId)
      .single();
    const menuData = data as TreatmentMenu;
    setMenu(menuData);

    // Check tag-based pricing
    if (profile?.tags && profile.tags.length > 0 && menuData) {
      const { data: tpData } = await supabase
        .from('menu_tag_prices')
        .select('tag, price')
        .eq('treatment_menu_id', menuId)
        .in('tag', profile.tags)
        .limit(1);
      if (tpData && tpData.length > 0) {
        setEffectivePrice(tpData[0].price);
        setAppliedTag(tpData[0].tag);
      } else {
        setEffectivePrice(menuData.price);
      }
    } else if (menuData) {
      setEffectivePrice(menuData.price);
    }
  }

  async function handleConfirm() {
    if (!profile || !menu || !endTime) return;
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('app_bookings')
        .insert({
          user_id: profile.id,
          store_id: selectedStore,
          treatment_menu_id: menuId,
          starts_at: startTime.toISOString(),
          ends_at: endTime.toISOString(),
          buffer_before: BUFFER_MINUTES,
          buffer_after: BUFFER_MINUTES,
          status: 'confirmed',
          created_by: 'client',
        })
        .select()
        .single();

      if (error) throw error;
      navigation.replace('BookingComplete', { bookingId: data.id, isNewCustomer });
    } catch (e: any) {
      Alert.alert('エラー', '予約に失敗しました。もう一度お試しください。');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handlePrepayment() {
    if (PREPAYMENT_URL) {
      Linking.openURL(PREPAYMENT_URL);
    } else {
      Alert.alert('準備中', '事前決済は現在準備中です。店舗にてお支払いをお願いいたします。');
    }
  }

  const dateLabel = startTime.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
  });
  const timeLabel = startTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  const endTimeLabel = endTime?.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerIcon}>
          <Ionicons name="calendar-outline" size={32} color={COLORS.accent} />
        </View>
        <Text style={styles.title}>ご予約内容の確認</Text>

        {/* 新規のお客様向けバナー */}
        {isNewCustomer && (
          <View style={styles.newCustomerBanner}>
            <Ionicons name="sparkles-outline" size={18} color={COLORS.accent} />
            <Text style={styles.newCustomerText}>
              初めてのご来店ありがとうございます。予約確定後、カウンセリングシートのご記入をお願いいたします。
            </Text>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="medical-outline" size={18} color={COLORS.textSecondary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>メニュー</Text>
              <Text style={styles.rowValue}>{menu?.name ?? '...'}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Ionicons name="calendar-outline" size={18} color={COLORS.textSecondary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>日時</Text>
              <Text style={styles.rowValue}>{dateLabel}</Text>
              <Text style={styles.rowSubvalue}>{timeLabel} - {endTimeLabel}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Ionicons name="time-outline" size={18} color={COLORS.textSecondary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>施術時間</Text>
              <Text style={styles.rowValue}>{menu?.duration_minutes ?? '-'}分</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Ionicons name="storefront-outline" size={18} color={COLORS.textSecondary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>店舗</Text>
              <Text style={styles.rowValue}>{STORES[selectedStore].name}</Text>
            </View>
          </View>
          {effectivePrice != null && (
            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <Ionicons name="cash-outline" size={18} color={COLORS.textSecondary} />
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>料金</Text>
                <View style={styles.priceRow}>
                  <Text style={styles.rowValueAccent}>¥{effectivePrice.toLocaleString()}</Text>
                  {appliedTag && (
                    <View style={styles.priceTagBadge}>
                      <Text style={styles.priceTagBadgeText}>{appliedTag}</Text>
                    </View>
                  )}
                </View>
                {appliedTag && menu && effectivePrice !== menu.price && (
                  <Text style={styles.originalPriceText}>通常料金: ¥{menu.price.toLocaleString()}</Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* 事前決済推奨カード */}
        <View style={styles.prepayCard}>
          <View style={styles.prepayHeader}>
            <Ionicons name="card-outline" size={20} color={COLORS.accent} />
            <Text style={styles.prepayTitle}>事前決済のご案内</Text>
          </View>
          <Text style={styles.prepayText}>
            事前にお支払いいただくと、当日の受付がスムーズになります。ぜひご利用ください。
          </Text>
          <Button
            title="事前決済はこちら"
            onPress={handlePrepayment}
            variant="outline"
          />
        </View>

        {/* 注意事項 — 新規/既存で内容を変える */}
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>ご予約に関して</Text>
          {isNewCustomer ? (
            <Text style={styles.noteText}>
              ・予約時間の5分前を目安にお越しください（初回はカウンセリングがございます）{'\n'}
              ・動きやすい服装でお越しいただくとスムーズです{'\n'}
              ・カウンセリングシートは予約後にアプリ内でご記入いただけます{'\n'}
              ・当日キャンセルの場合、施術料金の100%のキャンセル料が発生いたします
            </Text>
          ) : (
            <Text style={styles.noteText}>
              ・予約時間の5分前を目安にお越しください{'\n'}
              ・当日キャンセルの場合、施術料金の100%のキャンセル料が発生いたします
            </Text>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title={isSubmitting ? '処理中...' : '予約を確定する'}
          onPress={handleConfirm}
          disabled={isSubmitting || !menu}
          size="large"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 24 },
  headerIcon: { alignItems: 'center', marginBottom: 12, marginTop: 8 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 20,
  },
  newCustomerBanner: {
    flexDirection: 'row',
    backgroundColor: '#FFF8F0',
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.accentLight,
  },
  newCustomerText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 20,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
    gap: 12,
  },
  rowContent: { flex: 1 },
  rowLabel: { fontSize: 11, color: COLORS.textLight, marginBottom: 2 },
  rowValue: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  rowSubvalue: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },
  rowValueAccent: { fontSize: 18, fontWeight: '700', color: COLORS.accent },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceTagBadge: {
    backgroundColor: COLORS.accentPink + '25', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  priceTagBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.accentPink },
  originalPriceText: { fontSize: 11, color: COLORS.textLight, textDecorationLine: 'line-through', marginTop: 2 },
  prepayCard: {
    backgroundColor: '#FFF8F0',
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.accentLight,
    gap: 10,
  },
  prepayHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prepayTitle: { fontSize: 15, fontWeight: '700', color: COLORS.accent },
  prepayText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 20 },
  noteCard: {
    backgroundColor: COLORS.surfaceWarm,
    borderRadius: 12,
    padding: 16,
  },
  noteTitle: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  noteText: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 20 },
  footer: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
});
