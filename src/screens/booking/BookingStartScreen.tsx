// 予約の最初のステップ：店舗選択＋クーポン選択
// =====================================================
// ・玉島店 / 金光店 を「必ず」明示的に選んでもらう（迷い・誤予約を防ぐ）
// ・使えるクーポンがあれば最初に選択（AirReserve参考）。割引はこの後の画面に引き継ぐ
// 選択後に BookingCalendar へ storeId / couponId を渡して進む。
// =====================================================
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { CancellationPolicyNotice } from '../../components/CancellationPolicyNotice';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingStackParamList } from '../../types/navigation';
import type { StoreId, Coupon } from '../../types/database';

type Props = NativeStackScreenProps<BookingStackParamList, 'BookingStart'>;

const STORE_LIST: { id: StoreId; name: string; address: string }[] = [
  { id: 'tamashima', name: STORES.tamashima.name, address: STORES.tamashima.address },
  { id: 'kanamitsu', name: STORES.kanamitsu.name, address: STORES.kanamitsu.address },
];

export function BookingStartScreen({ route, navigation }: Props) {
  const isNewCustomer = route.params?.isNewCustomer ?? false;
  const { profile } = useAuthStore();
  const { selectedStore, setSelectedStore } = useStoreSelection();
  // 初期選択はあえて null にして「必ず選ぶ」体験にする
  const [storeId, setStoreId] = useState<StoreId | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [couponId, setCouponId] = useState<string | null>(null);
  const [ticketSessions, setTicketSessions] = useState<number>(0);

  useEffect(() => { fetchCoupons(); fetchTickets(); }, []);

  // 有効な回数券の残回数合計（当日キャンセルで1回消化することを明示するため）
  async function fetchTickets() {
    if (!profile?.id) return;
    const { data } = await supabase
      .from('user_tickets')
      .select('remaining_sessions')
      .eq('user_id', profile.id)
      .eq('status', 'active')
      .gt('remaining_sessions', 0);
    const total = (data ?? []).reduce((sum: number, t: any) => sum + (t.remaining_sessions ?? 0), 0);
    setTicketSessions(total);
  }

  async function fetchCoupons() {
    if (!profile?.id) return;
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from('coupons')
      .select('*')
      .eq('user_id', profile.id)
      .eq('is_used', false)
      .in('applicable_to', ['treatment', 'all'])
      .lte('valid_from', nowIso)
      .gte('valid_until', nowIso)
      .order('valid_until', { ascending: true });
    setCoupons((data as Coupon[]) ?? []);
  }

  function handleNext() {
    if (!storeId) return;
    setSelectedStore(storeId); // アプリ全体の選択店舗も合わせる
    navigation.navigate('BookingCalendar', {
      isNewCustomer,
      storeId,
      couponId: couponId ?? undefined,
    });
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ステップ表示 */}
        <View style={styles.stepRow}>
          <View style={[styles.stepDot, styles.stepDotOn]}><Text style={styles.stepDotText}>1</Text></View>
          <Text style={styles.stepLabelOn}>店舗・クーポン</Text>
          <View style={styles.stepLine} />
          <View style={styles.stepDot}><Text style={styles.stepDotTextOff}>2</Text></View>
          <Text style={styles.stepLabel}>日時</Text>
          <View style={styles.stepLine} />
          <View style={styles.stepDot}><Text style={styles.stepDotTextOff}>3</Text></View>
          <Text style={styles.stepLabel}>確認</Text>
        </View>

        {/* 店舗選択（必須・大きく明確に） */}
        <Text style={styles.sectionTitle}>
          ご予約の店舗を選択してください<Text style={styles.required}> ※必須</Text>
        </Text>
        {STORE_LIST.map((s) => {
          const sel = storeId === s.id;
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.storeCard, sel && styles.storeCardOn]}
              onPress={() => setStoreId(s.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.storeIcon, sel && styles.storeIconOn]}>
                <Ionicons name="storefront" size={24} color={sel ? '#FFF' : COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.storeName, sel && styles.storeNameOn]}>Moveact {s.name}</Text>
                <Text style={styles.storeAddr}>{s.address}</Text>
              </View>
              <Ionicons
                name={sel ? 'checkmark-circle' : 'ellipse-outline'}
                size={24}
                color={sel ? COLORS.accent : COLORS.borderLight}
              />
            </TouchableOpacity>
          );
        })}

        {/* 回数券の残回数（保有者のみ。当日キャンセルで1回消化することを明示） */}
        {ticketSessions > 0 && (
          <View style={styles.ticketCard}>
            <Ionicons name="ticket" size={18} color={COLORS.success} />
            <View style={{ flex: 1 }}>
              <Text style={styles.ticketTitle}>回数券 残り{ticketSessions}回</Text>
              <Text style={styles.ticketNote}>当日キャンセル・無断キャンセルは回数券1回分の消化となります</Text>
            </View>
          </View>
        )}

        {/* クーポン選択（任意・最初に提示） */}
        <Text style={[styles.sectionTitle, { marginTop: 26 }]}>クーポンを使う（任意）</Text>
        {coupons.length === 0 ? (
          <View style={styles.noCoupon}>
            <Ionicons name="ticket-outline" size={18} color={COLORS.textLight} />
            <Text style={styles.noCouponText}>現在お使いいただけるクーポンはありません</Text>
          </View>
        ) : (
          <View style={styles.couponCard}>
            <TouchableOpacity style={styles.couponRow} onPress={() => setCouponId(null)}>
              <Ionicons
                name={couponId === null ? 'radio-button-on' : 'radio-button-off'}
                size={20} color={couponId === null ? COLORS.accent : COLORS.textLight}
              />
              <Text style={styles.couponText}>使用しない</Text>
            </TouchableOpacity>
            {coupons.map((c) => {
              const sel = couponId === c.id;
              const off = c.discount_amount
                ? `¥${c.discount_amount.toLocaleString()} 割引`
                : c.discount_percent ? `${c.discount_percent}% 割引` : '割引';
              return (
                <TouchableOpacity key={c.id} style={styles.couponRow} onPress={() => setCouponId(c.id)}>
                  <Ionicons
                    name={sel ? 'radio-button-on' : 'radio-button-off'}
                    size={20} color={sel ? COLORS.accent : COLORS.textLight}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.couponText}>{c.title}</Text>
                    <Text style={styles.couponMeta}>
                      {off}・{new Date(c.valid_until).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}まで
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* キャンセルポリシーを予約の最初に明示 */}
        <View style={{ marginTop: 26 }}>
          <CancellationPolicyNotice variant="banner" />
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>

      <View style={styles.footer}>
        {!storeId && <Text style={styles.footerHint}>店舗を選択すると次へ進めます</Text>}
        <Button
          title="日時の選択へ進む"
          onPress={handleNext}
          disabled={!storeId}
          size="large"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { padding: 20, paddingBottom: 24 },
  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 22, gap: 4 },
  stepDot: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.backgroundSoft,
    justifyContent: 'center', alignItems: 'center',
  },
  stepDotOn: { backgroundColor: COLORS.accent },
  stepDotText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  stepDotTextOff: { fontSize: 12, fontWeight: '700', color: COLORS.textLight },
  stepLabel: { fontSize: 11, color: COLORS.textLight },
  stepLabelOn: { fontSize: 11, color: COLORS.accent, fontWeight: '700' },
  stepLine: { width: 16, height: 1, backgroundColor: COLORS.borderLight, marginHorizontal: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 12 },
  required: { fontSize: 11, color: COLORS.error, fontWeight: '700' },
  storeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 2, borderColor: COLORS.border,
  },
  storeCardOn: { borderColor: COLORS.accent, backgroundColor: '#FFF8F0' },
  storeIcon: {
    width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(196,149,106,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  storeIconOn: { backgroundColor: COLORS.accent },
  storeName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  storeNameOn: { color: COLORS.accent },
  storeAddr: { fontSize: 11, color: COLORS.textSecondary, marginTop: 3, lineHeight: 16 },
  ticketCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 26,
    backgroundColor: '#EEF6F0', borderRadius: 12, padding: 14,
  },
  ticketTitle: { fontSize: 14, fontWeight: '700', color: COLORS.success },
  ticketNote: { fontSize: 11, color: COLORS.textSecondary, marginTop: 3, lineHeight: 16 },
  noCoupon: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, padding: 16, borderRadius: 12,
  },
  noCouponText: { fontSize: 13, color: COLORS.textSecondary },
  couponCard: { backgroundColor: COLORS.surface, borderRadius: 14, paddingHorizontal: 16 },
  couponRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.borderLight,
  },
  couponText: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  couponMeta: { fontSize: 11, color: COLORS.success, fontWeight: '600', marginTop: 2 },
  footer: {
    padding: 16, paddingBottom: 32, backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  footerHint: { fontSize: 12, color: COLORS.error, textAlign: 'center', marginBottom: 8 },
});
