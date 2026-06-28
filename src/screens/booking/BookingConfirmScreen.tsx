import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { CancellationPolicyNotice } from '../../components/CancellationPolicyNotice';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { useAuthStore } from '../../stores/authStore';
import { supabase } from '../../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingStackParamList } from '../../types/navigation';
import type { TreatmentMenu, Coupon } from '../../types/database';

// クーポンの割引額を計算（定額 or 定率）。基準額に対して適用。
function couponDiscount(c: Coupon, base: number): number {
  if (c.discount_amount) return Math.min(c.discount_amount, base);
  if (c.discount_percent) return Math.floor((base * c.discount_percent) / 100);
  return 0;
}

type Props = NativeStackScreenProps<BookingStackParamList, 'BookingConfirm'>;

const BUFFER_MINUTES = 15;

export function BookingConfirmScreen({ route, navigation }: Props) {
  const { menuId, dateTime, isNewCustomer, staffId, couponId } = route.params;
  const { selectedStore } = useStoreSelection();
  // 予約フローで最初に選んだ店舗を最優先（誤店舗予約を防ぐ）
  const storeId = route.params?.storeId ?? selectedStore;
  const { profile } = useAuthStore();
  const [menu, setMenu] = useState<TreatmentMenu | null>(null);
  const [effectivePrice, setEffectivePrice] = useState<number | null>(null);
  const [appliedTag, setAppliedTag] = useState<string | null>(null);
  const [staffName, setStaffName] = useState<string | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null);
  const [request, setRequest] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const startTime = new Date(dateTime);
  const endTime = menu ? new Date(startTime.getTime() + menu.duration_minutes * 60000) : null;

  // 適用後の支払額（タグ価格 → クーポン割引の順）
  const discount = selectedCoupon && effectivePrice != null ? couponDiscount(selectedCoupon, effectivePrice) : 0;
  const finalPrice = effectivePrice != null ? Math.max(0, effectivePrice - discount) : null;

  useEffect(() => { fetchMenu(); fetchCoupons(); }, []);
  useEffect(() => { fetchStaffName(); }, [staffId]);

  // 施術に使える未使用・有効期限内のクーポンを取得
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
    const list = (data as Coupon[]) ?? [];
    setCoupons(list);
    // 最初の画面で選んだクーポンを引き継いで初期選択
    if (couponId) {
      const pre = list.find((c) => c.id === couponId);
      if (pre) setSelectedCoupon(pre);
    }
  }

  // 指名スタッフの表示名を取得（指名なしは「おまかせ」）
  async function fetchStaffName() {
    if (!staffId) { setStaffName(null); return; }
    const { data } = await supabase
      .from('public_staff_roster')
      .select('full_name')
      .eq('staff_id', staffId)
      .eq('store_id', storeId)
      .maybeSingle();
    setStaffName((data as any)?.full_name ?? null);
  }

  // 担当スタッフを確定する。
  // ・指名あり: そのスタッフが「確定の瞬間も」空いているか必ず再確認（埋まっていたら null）
  // ・指名なし: ロスターから空きスタッフを1人選ぶ
  // いずれも 予約(+前後バッファ)・ブロック と重ならないことを確認（二重予約を防ぐ）。
  async function resolveAssignedStaff(s: Date, e: Date): Promise<string | null> {
    // 指名ありなら候補はそのスタッフのみ。指名なしならロスター全員から探す。
    let ids: string[];
    if (staffId) {
      ids = [staffId];
    } else {
      const { data: roster } = await supabase
        .from('public_staff_roster').select('staff_id').eq('store_id', storeId);
      ids = (roster as any[] ?? []).map((r) => r.staff_id);
    }
    if (ids.length === 0) return null;

    const bufS = new Date(s.getTime() - BUFFER_MINUTES * 60000);
    const bufE = new Date(e.getTime() + BUFFER_MINUTES * 60000);
    const dayStart = new Date(s); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(s); dayEnd.setHours(23, 59, 59, 999);

    const [{ data: bk }, { data: un }] = await Promise.all([
      supabase.from('app_bookings')
        .select('staff_id, starts_at, ends_at, buffer_before, buffer_after')
        .eq('store_id', storeId).neq('status', 'cancelled')
        .gte('starts_at', dayStart.toISOString()).lte('starts_at', dayEnd.toISOString()),
      supabase.from('staff_unavailability')
        .select('staff_id, starts_at, ends_at')
        .eq('store_id', storeId)
        .lte('starts_at', dayEnd.toISOString()).gte('ends_at', dayStart.toISOString()),
    ]);

    const busy = new Map<string, { s: number; e: number }[]>();
    const push = (id: string, st: number, en: number) => {
      if (!busy.has(id)) busy.set(id, []);
      busy.get(id)!.push({ s: st, e: en });
    };
    for (const b of (bk as any[] ?? [])) {
      if (!b.staff_id) continue;
      push(b.staff_id,
        new Date(b.starts_at).getTime() - (b.buffer_before ?? BUFFER_MINUTES) * 60000,
        new Date(b.ends_at).getTime() + (b.buffer_after ?? BUFFER_MINUTES) * 60000);
    }
    for (const u of (un as any[] ?? [])) {
      if (!u.staff_id) continue;
      push(u.staff_id, new Date(u.starts_at).getTime(), new Date(u.ends_at).getTime());
    }
    for (const id of ids) {
      const iv = busy.get(id) ?? [];
      const conflict = iv.some((x) => bufS.getTime() < x.e && bufE.getTime() > x.s);
      if (!conflict) return id;
    }
    return null; // 全員埋まっている
  }

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
        .order('price', { ascending: true }) // 複数タグ該当時は最安値を適用
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

  // 予約確定の前に「店舗名を含む内容」を必ず再確認させる
  function handleConfirm() {
    if (!profile || !menu || !endTime) return;
    const storeName = STORES[storeId].name;
    const dt = startTime.toLocaleString('ja-JP', {
      month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit',
    });
    const priceLine = finalPrice != null ? `\n料金: ¥${finalPrice.toLocaleString()}` : '';
    Alert.alert(
      `【${storeName}】でご予約しますか？`,
      `店舗: Moveact ${storeName}\nメニュー: ${menu.name}\n日時: ${dt}\n担当: ${staffName ? staffName + '（指名）' : 'おまかせ'}${priceLine}\n\nお間違いなければ「この内容で予約」を押してください。`,
      [
        { text: '店舗・内容を見直す', style: 'cancel' },
        { text: 'この内容で予約', onPress: submitBooking },
      ],
    );
  }

  async function submitBooking() {
    if (!profile || !menu || !endTime) return;
    setIsSubmitting(true);
    try {
      // 指名なしのときは空きスタッフを自動割当（重複防止）。
      const assignedStaff = await resolveAssignedStaff(startTime, endTime);
      if (!assignedStaff) {
        Alert.alert('満員です', 'この時間は予約が埋まってしまいました。別の時間をお選びください。');
        setIsSubmitting(false);
        return;
      }
      const { data, error } = await supabase
        .from('app_bookings')
        .insert({
          user_id: profile.id,
          store_id: storeId,
          treatment_menu_id: menuId,
          staff_id: assignedStaff,
          starts_at: startTime.toISOString(),
          ends_at: endTime.toISOString(),
          buffer_before: BUFFER_MINUTES,
          buffer_after: BUFFER_MINUTES,
          status: 'confirmed',
          created_by: 'client',
          is_staff_nominated: !!staffId, // 指名ありなら true
          applied_coupon_id: selectedCoupon?.id ?? null,
          customer_request: request.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      // スタッフのグループLINEへ予約通知（非ブロッキング）
      supabase.functions.invoke('notify-staff-group', { body: { bookingId: data.id } }).catch(() => {});

      // 適用したクーポンを使用済みにする
      if (selectedCoupon) {
        await supabase
          .from('coupons')
          .update({ is_used: true, used_at: new Date().toISOString() })
          .eq('id', selectedCoupon.id)
          .eq('user_id', profile.id);
      }

      navigation.replace('BookingComplete', { bookingId: data.id, isNewCustomer });
    } catch (e: any) {
      Alert.alert('エラー', '予約に失敗しました。もう一度お試しください。');
    } finally {
      setIsSubmitting(false);
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
          <View style={[styles.row, styles.storeRow]}>
            <Ionicons name="storefront" size={18} color={COLORS.accent} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>店舗（お間違いないかご確認ください）</Text>
              <Text style={styles.storeRowValue}>Moveact {STORES[storeId].name}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <Ionicons name="person-outline" size={18} color={COLORS.textSecondary} />
            <View style={styles.rowContent}>
              <Text style={styles.rowLabel}>担当スタッフ</Text>
              <Text style={styles.rowValue}>{staffName ? `${staffName}（指名）` : 'おまかせ'}</Text>
            </View>
          </View>
          {effectivePrice != null && (
            <View style={[styles.row, { borderBottomWidth: 0 }]}>
              <Ionicons name="cash-outline" size={18} color={COLORS.textSecondary} />
              <View style={styles.rowContent}>
                <Text style={styles.rowLabel}>料金</Text>
                <View style={styles.priceRow}>
                  <Text style={styles.rowValueAccent}>¥{(finalPrice ?? effectivePrice).toLocaleString()}</Text>
                  {appliedTag && (
                    <View style={styles.priceTagBadge}>
                      <Text style={styles.priceTagBadgeText}>{appliedTag}</Text>
                    </View>
                  )}
                </View>
                {appliedTag && menu && effectivePrice !== menu.price && (
                  <Text style={styles.originalPriceText}>通常料金: ¥{menu.price.toLocaleString()}</Text>
                )}
                {discount > 0 && (
                  <Text style={styles.discountText}>クーポン割引: -¥{discount.toLocaleString()}</Text>
                )}
              </View>
            </View>
          )}
        </View>

        {/* クーポン選択（施術に使える未使用クーポン） */}
        {coupons.length > 0 && (
          <View style={styles.blockCard}>
            <Text style={styles.blockTitle}>クーポンを使う</Text>
            <TouchableOpacity
              style={[styles.couponItem, selectedCoupon === null && styles.couponItemActive]}
              onPress={() => setSelectedCoupon(null)}
            >
              <Ionicons
                name={selectedCoupon === null ? 'radio-button-on' : 'radio-button-off'}
                size={18} color={selectedCoupon === null ? COLORS.accent : COLORS.textLight}
              />
              <Text style={styles.couponItemText}>使用しない</Text>
            </TouchableOpacity>
            {coupons.map((c) => {
              const sel = selectedCoupon?.id === c.id;
              const d = effectivePrice != null ? couponDiscount(c, effectivePrice) : 0;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.couponItem, sel && styles.couponItemActive]}
                  onPress={() => setSelectedCoupon(c)}
                >
                  <Ionicons
                    name={sel ? 'radio-button-on' : 'radio-button-off'}
                    size={18} color={sel ? COLORS.accent : COLORS.textLight}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.couponItemText}>{c.title}</Text>
                    <Text style={styles.couponMeta}>
                      -¥{d.toLocaleString()}・{new Date(c.valid_until).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}まで
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* お客様の要望・連絡事項 */}
        <View style={styles.blockCard}>
          <Text style={styles.blockTitle}>ご要望・ご連絡（任意）</Text>
          <TextInput
            style={styles.requestInput}
            placeholder="気になる症状、肩こり・腰の張り、苦手な施術など"
            placeholderTextColor={COLORS.textLight}
            value={request}
            onChangeText={setRequest}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>


        {/* 注意事項 — 新規/既存で内容を変える */}
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>ご予約に関して</Text>
          {isNewCustomer ? (
            <Text style={styles.noteText}>
              ・予約時間の5分前を目安にお越しください（初回はカウンセリングがございます）{'\n'}
              ・動きやすい服装でお越しいただくとスムーズです{'\n'}
              ・カウンセリングシートは予約後にアプリ内でご記入いただけます
            </Text>
          ) : (
            <Text style={styles.noteText}>
              ・予約時間の5分前を目安にお越しください
            </Text>
          )}
        </View>

        {/* キャンセルポリシー（共通・全画面で統一表示） */}
        <View style={{ marginTop: 16 }}>
          <CancellationPolicyNotice variant="detail" />
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
  storeRow: { backgroundColor: '#FFF8F0' },
  storeRowValue: { fontSize: 16, fontWeight: '700', color: COLORS.accent, marginTop: 1 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceTagBadge: {
    backgroundColor: COLORS.accentPink + '25', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  priceTagBadgeText: { fontSize: 10, fontWeight: '700', color: COLORS.accentPink },
  originalPriceText: { fontSize: 11, color: COLORS.textLight, textDecorationLine: 'line-through', marginTop: 2 },
  discountText: { fontSize: 12, color: COLORS.success, fontWeight: '700', marginTop: 3 },
  blockCard: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 16 },
  blockTitle: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  couponItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.borderLight,
  },
  couponItemActive: {},
  couponItemText: { fontSize: 14, color: COLORS.text, fontWeight: '500' },
  couponMeta: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2 },
  requestInput: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, padding: 12, fontSize: 14, color: COLORS.text, minHeight: 72,
  },
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
