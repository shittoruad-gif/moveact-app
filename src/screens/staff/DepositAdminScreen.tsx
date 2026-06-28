// 事前決済（前金）の管理
// =====================================================
// ・未入金の予約（初回客／deposit_status='pending'）を一覧 → 入金確認/無料に変更
// ・要確認: お客様がWeb予約で「お支払いが完了しました」を自己申告した予約
//   （deposit_status='paid' かつ deposit_self_reported=true）。Airペイの入金メールと
//   突き合わせて「確認済み」にする（誤申告・未入金の検知用）。
// ・Airペイの「金額固定の決済リンクURL」を金額ごとに登録（Web予約が自動で案内）
// Airペイはオンライン決済APIが無いため、入金確認はメール通知ベースで手動。
// =====================================================
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
  TextInput, ActivityIndicator, RefreshControl, Linking, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';

type Tab = 'pending' | 'verify' | 'links';

interface PendingBooking {
  id: string;
  guest_name: string | null;
  guest_phone: string | null;
  starts_at: string;
  store_id: string;
  deposit_amount: number | null;
  treatment_menu: { name: string } | null;
}

interface SelfReportedBooking extends PendingBooking {
  deposit_paid_at: string | null;
}

interface PayLink {
  id: string;
  label: string | null;
  amount: number;
  url: string;
  store_id: string | null;
  is_active: boolean;
}

const STORE_LABEL: Record<string, string> = { tamashima: '玉島店', kanamitsu: '金光店' };
const yen = (n: number | null | undefined) => `¥${(n ?? 0).toLocaleString('ja-JP')}`;

export function DepositAdminScreen() {
  const { profile } = useAuthStore();
  const [tab, setTab] = useState<Tab>('pending');
  const [pending, setPending] = useState<PendingBooking[]>([]);
  const [selfReported, setSelfReported] = useState<SelfReportedBooking[]>([]);
  const [links, setLinks] = useState<PayLink[]>([]);
  const [loading, setLoading] = useState(true);

  // リンク追加フォーム
  const [fAmount, setFAmount] = useState('');
  const [fLabel, setFLabel] = useState('');
  const [fUrl, setFUrl] = useState('');
  const [fStore, setFStore] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: pb }, { data: sr }, { data: pl }] = await Promise.all([
      supabase
        .from('app_bookings')
        .select('id, guest_name, guest_phone, starts_at, store_id, deposit_amount, treatment_menu:treatment_menus(name)')
        .eq('deposit_status', 'pending')
        .neq('status', 'cancelled')
        .order('starts_at', { ascending: true }),
      // お客様がWeb予約で自己申告した「お支払い完了」（Airペイ入金メールと要突合）
      supabase
        .from('app_bookings')
        .select('id, guest_name, guest_phone, starts_at, store_id, deposit_amount, deposit_paid_at, treatment_menu:treatment_menus(name)')
        .eq('deposit_status', 'paid')
        .eq('deposit_self_reported', true)
        .neq('status', 'cancelled')
        .order('deposit_paid_at', { ascending: false }),
      supabase.from('payment_links').select('*').order('amount', { ascending: true }),
    ]);
    setPending((pb as any) ?? []);
    setSelfReported((sr as any) ?? []);
    setLinks((pl as any) ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const markPaid = (b: PendingBooking) => {
    Alert.alert('入金確認', `${b.guest_name ?? 'お客様'}様の事前決済（${yen(b.deposit_amount)}）を「入金済み」にしますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '入金済みにする',
        onPress: async () => {
          await supabase.from('app_bookings').update({
            deposit_status: 'paid', deposit_paid_at: new Date().toISOString(), deposit_paid_by: profile?.id ?? null,
          }).eq('id', b.id);
          fetchAll();
        },
      },
    ]);
  };

  const waive = (b: PendingBooking) => {
    Alert.alert('事前決済を免除', `${b.guest_name ?? 'お客様'}様の事前決済を「免除（不要）」にしますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '免除する',
        onPress: async () => {
          await supabase.from('app_bookings').update({ deposit_status: 'waived' }).eq('id', b.id);
          fetchAll();
        },
      },
    ]);
  };

  // お客様の自己申告（お支払い完了）をAirペイ入金メールと突合 →「確認済み」にする
  const markVerified = (b: SelfReportedBooking) => {
    Alert.alert('入金を確認済みに', `${b.guest_name ?? 'お客様'}様（${yen(b.deposit_amount)}）のAirペイ入金を確認しましたか？確認済みにすると要確認リストから外れます。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '確認済みにする',
        onPress: async () => {
          await supabase.from('app_bookings').update({
            deposit_self_reported: false, deposit_paid_by: profile?.id ?? null,
          }).eq('id', b.id);
          fetchAll();
        },
      },
    ]);
  };

  // 自己申告が誤り（未入金）だった場合 → 仮押さえ（pending）に差し戻す
  const revertToPending = (b: SelfReportedBooking) => {
    Alert.alert('未入金に差し戻す', `${b.guest_name ?? 'お客様'}様の入金が確認できない場合、「入金待ち」に戻します。よろしいですか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '入金待ちに戻す',
        style: 'destructive',
        onPress: async () => {
          await supabase.from('app_bookings').update({
            deposit_status: 'pending', deposit_self_reported: false, deposit_paid_at: null,
          }).eq('id', b.id);
          fetchAll();
        },
      },
    ]);
  };

  const addLink = async () => {
    const amt = parseInt(fAmount, 10);
    if (isNaN(amt) || amt <= 0) { Alert.alert('エラー', '金額を正しく入力してください'); return; }
    if (!/^https?:\/\//.test(fUrl.trim())) { Alert.alert('エラー', 'AirペイのリンクURL（https://〜）を入力してください'); return; }
    await supabase.from('payment_links').insert({
      amount: amt, label: fLabel.trim() || null, url: fUrl.trim(), store_id: fStore,
    });
    setFAmount(''); setFLabel(''); setFUrl(''); setFStore(null);
    fetchAll();
  };

  const toggleLink = async (l: PayLink) => {
    await supabase.from('payment_links').update({ is_active: !l.is_active }).eq('id', l.id);
    fetchAll();
  };

  const deleteLink = (l: PayLink) => {
    Alert.alert('削除', `${yen(l.amount)} のリンクを削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: async () => { await supabase.from('payment_links').delete().eq('id', l.id); fetchAll(); } },
    ]);
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });

  const renderPending = ({ item }: { item: PendingBooking }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.amount}>{yen(item.deposit_amount)}</Text>
        <View style={styles.pendBadge}><Text style={styles.pendBadgeText}>入金待ち</Text></View>
      </View>
      <Text style={styles.name}>{item.guest_name ?? 'お客様'} 様　<Text style={styles.store}>{STORE_LABEL[item.store_id]}</Text></Text>
      <Text style={styles.sub}>{fmtDate(item.starts_at)}・{item.treatment_menu?.name ?? ''}</Text>
      {item.guest_phone ? (
        <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.guest_phone}`)}>
          <Text style={styles.phone}>{item.guest_phone}</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.btnPaid]} onPress={() => markPaid(item)}>
          <Ionicons name="checkmark-circle-outline" size={16} color="#fff" />
          <Text style={styles.btnPaidText}>入金済みにする</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnWaive]} onPress={() => waive(item)}>
          <Text style={styles.btnWaiveText}>免除</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderSelfReported = ({ item }: { item: SelfReportedBooking }) => (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.amount}>{yen(item.deposit_amount)}</Text>
        <View style={styles.verifyBadge}><Text style={styles.verifyBadgeText}>自己申告・要確認</Text></View>
      </View>
      <Text style={styles.name}>{item.guest_name ?? 'お客様'} 様　<Text style={styles.store}>{STORE_LABEL[item.store_id]}</Text></Text>
      <Text style={styles.sub}>{fmtDate(item.starts_at)}・{item.treatment_menu?.name ?? ''}</Text>
      {item.deposit_paid_at ? (
        <Text style={styles.sub}>お客様が完了報告: {fmtDate(item.deposit_paid_at)}</Text>
      ) : null}
      {item.guest_phone ? (
        <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.guest_phone}`)}>
          <Text style={styles.phone}>{item.guest_phone}</Text>
        </TouchableOpacity>
      ) : null}
      <Text style={styles.verifyHint}>Airペイの入金メールで金額・お名前を突き合わせてください。</Text>
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.btnPaid]} onPress={() => markVerified(item)}>
          <Ionicons name="checkmark-done-outline" size={16} color="#fff" />
          <Text style={styles.btnPaidText}>入金を確認済みに</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnWaive]} onPress={() => revertToPending(item)}>
          <Text style={styles.btnWaiveText}>未入金に戻す</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {(['pending', 'verify', 'links'] as Tab[]).map((t) => (
          <TouchableOpacity key={t} style={[styles.tab, tab === t && styles.tabOn]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextOn]}>
              {t === 'pending'
                ? `未入金 ${pending.length > 0 ? `(${pending.length})` : ''}`
                : t === 'verify'
                ? `要確認 ${selfReported.length > 0 ? `(${selfReported.length})` : ''}`
                : '決済リンク設定'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.primary} />
      ) : tab === 'pending' ? (
        <FlatList
          data={pending}
          keyExtractor={(b) => b.id}
          renderItem={renderPending}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={fetchAll} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-outline" size={40} color="#ccc" />
              <Text style={styles.emptyText}>入金待ちの予約はありません</Text>
            </View>
          }
        />
      ) : tab === 'verify' ? (
        <FlatList
          data={selfReported}
          keyExtractor={(b) => b.id}
          renderItem={renderSelfReported}
          contentContainerStyle={{ padding: 12 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={fetchAll} />}
          ListHeaderComponent={
            selfReported.length > 0 ? (
              <View style={styles.help}>
                <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
                <Text style={styles.helpText}>
                  お客様がWeb予約で「お支払いが完了しました」と申告した予約です。
                  Airペイの入金メールで金額・お名前を確認し、「確認済みに」を押してください。
                  入金が確認できない場合は「未入金に戻す」で入金待ちへ差し戻せます。
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="checkmark-done-outline" size={40} color="#ccc" />
              <Text style={styles.emptyText}>要確認の予約はありません</Text>
            </View>
          }
        />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          <View style={styles.help}>
            <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
            <Text style={styles.helpText}>
              Airペイ管理画面（PC/iPad）で「金額固定の決済リンク」を作成し、その金額とURLをここに登録してください。
              初回のお客様のWeb予約で、メニュー価格に一致するリンクが自動でご案内されます。
            </Text>
          </View>

          {/* 追加フォーム */}
          <View style={styles.form}>
            <Text style={styles.formTitle}>リンクを追加</Text>
            <TextInput style={styles.input} placeholder="金額（例：6600）" keyboardType="number-pad" value={fAmount} onChangeText={setFAmount} />
            <TextInput style={styles.input} placeholder="ラベル（任意・例：整体60分）" value={fLabel} onChangeText={setFLabel} />
            <TextInput style={styles.input} placeholder="AirペイリンクURL（https://〜）" autoCapitalize="none" value={fUrl} onChangeText={setFUrl} />
            <View style={styles.storePick}>
              {[null, 'tamashima', 'kanamitsu'].map((s) => (
                <TouchableOpacity key={s ?? 'all'} style={[styles.storeChip, fStore === s && styles.storeChipOn]} onPress={() => setFStore(s)}>
                  <Text style={[styles.storeChipText, fStore === s && styles.storeChipTextOn]}>{s ? STORE_LABEL[s] : '全店共通'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.addBtn} onPress={addLink}>
              <Text style={styles.addBtnText}>追加する</Text>
            </TouchableOpacity>
          </View>

          {links.map((l) => (
            <View key={l.id} style={styles.linkRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.linkAmt}>{yen(l.amount)} <Text style={styles.linkStore}>{l.store_id ? STORE_LABEL[l.store_id] : '全店'}</Text></Text>
                {l.label ? <Text style={styles.linkLabel}>{l.label}</Text> : null}
                <Text style={styles.linkUrl} numberOfLines={1}>{l.url}</Text>
              </View>
              <TouchableOpacity onPress={() => toggleLink(l)} style={{ padding: 6 }}>
                <Ionicons name={l.is_active ? 'eye-outline' : 'eye-off-outline'} size={20} color={l.is_active ? COLORS.success : '#bbb'} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => deleteLink(l)} style={{ padding: 6 }}>
                <Ionicons name="trash-outline" size={19} color={COLORS.error} />
              </TouchableOpacity>
            </View>
          ))}
          {links.length === 0 && <Text style={styles.emptyText}>まだリンクが登録されていません</Text>}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f8f8' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#eee' },
  tab: { flex: 1, paddingVertical: 13, alignItems: 'center', borderBottomWidth: 2, borderColor: 'transparent' },
  tabOn: { borderColor: COLORS.primary },
  tabText: { fontSize: 14, color: '#888' },
  tabTextOn: { color: COLORS.primary, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  amount: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  pendBadge: { backgroundColor: '#FCEFE0', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  pendBadgeText: { fontSize: 11, color: '#C4956A', fontWeight: '700' },
  verifyBadge: { backgroundColor: '#FDECEC', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  verifyBadgeText: { fontSize: 11, color: '#D9534F', fontWeight: '700' },
  verifyHint: { fontSize: 12, color: COLORS.textSecondary, marginTop: 8, lineHeight: 17 },
  name: { fontSize: 15, color: COLORS.text, marginTop: 8, fontWeight: '600' },
  store: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '400' },
  sub: { fontSize: 12.5, color: COLORS.textSecondary, marginTop: 3 },
  phone: { fontSize: 14, color: COLORS.primary, marginTop: 6, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, borderRadius: 10 },
  btnPaid: { flex: 1, backgroundColor: COLORS.success },
  btnPaidText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  btnWaive: { paddingHorizontal: 18, backgroundColor: '#F0EBE7' },
  btnWaiveText: { color: COLORS.textSecondary, fontWeight: '600', fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 70, gap: 10 },
  emptyText: { fontSize: 14, color: '#aaa', textAlign: 'center', marginTop: 16 },
  help: { flexDirection: 'row', gap: 8, backgroundColor: '#FDFAF7', borderRadius: 10, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#F0EBE7' },
  helpText: { flex: 1, fontSize: 12, color: COLORS.textSecondary, lineHeight: 18 },
  form: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16 },
  formTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 10 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 11, marginBottom: 8, fontSize: 14, backgroundColor: '#fff' },
  storePick: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  storeChip: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', alignItems: 'center' },
  storeChipOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '12' },
  storeChipText: { fontSize: 12, color: '#888' },
  storeChipTextOn: { color: COLORS.primary, fontWeight: '700' },
  addBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  linkRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, gap: 4 },
  linkAmt: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  linkStore: { fontSize: 11, color: COLORS.textSecondary, fontWeight: '400' },
  linkLabel: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },
  linkUrl: { fontSize: 11, color: '#aaa', marginTop: 3 },
});
