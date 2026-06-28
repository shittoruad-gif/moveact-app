// 顧客向け 領収書表示/ダウンロード画面
// 注文に紐付く領収書を表示し、宛名の編集・PDF共有に対応
import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal,
  KeyboardAvoidingView, Platform, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';

type StoreInfo = { name: string; address: string; phone: string };

function getStoreInfo(storeId: string | null | undefined): StoreInfo {
  const store = storeId ? (STORES as any)[storeId] : null;
  return {
    name: store?.name ?? 'Moveact',
    address: store?.address ?? '',
    phone: store?.phone ?? '',
  };
}

function formatPhone(phone: string): string {
  // "07022318300" → "070-2231-8300"
  const d = (phone ?? '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

export function CustomerReceiptScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { profile } = useAuthStore();
  const insets = useSafeAreaInsets();
  const orderId: string = route.params.orderId;

  const [receipt, setReceipt] = useState<any>(null);
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    // 注文情報
    const { data: orderData } = await supabase
      .from('orders')
      .select('*, items:order_items(*, product:products(name))')
      .eq('id', orderId)
      .single();
    setOrder(orderData);

    // 既存の領収書を取得（自動生成されているはず）
    const { data: receiptData } = await supabase
      .from('receipts')
      .select('*')
      .eq('source_type', 'order')
      .eq('source_id', orderId)
      .maybeSingle();

    setReceipt(receiptData);
    setNameInput(receiptData?.issued_to_name ?? profile?.full_name ?? '');
    setLoading(false);
  }, [orderId, profile?.full_name]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSaveName() {
    if (!receipt) return;
    const trimmed = nameInput.trim();
    if (!trimmed) {
      Alert.alert('入力エラー', '宛名を入力してください');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('receipts')
      .update({ issued_to_name: trimmed })
      .eq('id', receipt.id);
    setSaving(false);
    if (error) {
      Alert.alert('エラー', '宛名の更新に失敗しました');
      return;
    }
    setReceipt({ ...receipt, issued_to_name: trimmed });
    setEditingName(false);
  }

  async function handleShare() {
    if (!receipt) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Print = require('expo-print');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Sharing = require('expo-sharing');
      const html = receiptHtml(receipt);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, {
        dialogTitle: `領収書 ${receipt.receipt_number}`,
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
      });
    } catch {
      Alert.alert(
        'PDF出力について',
        'この端末ではPDF出力が利用できません。画面のスクリーンショットを保存してご利用ください。'
      );
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  if (!receipt) {
    return (
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={COLORS.accent} />}
      >
        <Ionicons name="receipt-outline" size={48} color={COLORS.textLight} />
        <Text style={styles.emptyTitle}>領収書はまだ発行されていません</Text>
        <Text style={styles.emptyText}>
          ご注文のお支払いが完了すると、こちらから領収書をダウンロードできます。{'\n\n'}
          お支払いが完了しているのに表示されない場合は、画面を下に引っ張って更新してみてください。解消しない場合は店舗までお問合せください。
        </Text>
        <TouchableOpacity
          style={[styles.backBtn, { marginTop: 12, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }]}
          onPress={fetchData}
        >
          <Text style={[styles.backBtnText, { color: COLORS.text }]}>再読み込み</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>戻る</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const store = getStoreInfo(receipt.store_id);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* 注文サマリー */}
        {order && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>対象の注文</Text>
            <Text style={styles.summaryOrderDate}>
              {new Date(order.created_at).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })}
            </Text>
            {(order.items ?? []).slice(0, 3).map((oi: any, i: number) => (
              <Text key={i} style={styles.summaryItem} numberOfLines={1}>
                ・{oi.product?.name ?? '商品'} × {oi.quantity}
              </Text>
            ))}
            {(order.items ?? []).length > 3 && (
              <Text style={styles.summaryItem}>ほか {(order.items ?? []).length - 3}点</Text>
            )}
          </View>
        )}

        {/* 領収書プレビュー */}
        <View style={styles.receiptCard}>
          <Text style={styles.receiptTitle}>領 収 書</Text>
          <View style={styles.divider} />

          <View style={styles.topRow}>
            <View>
              <Text style={styles.numberLabel}>No.</Text>
              <Text style={styles.numberText}>{receipt.receipt_number}</Text>
            </View>
            <Text style={styles.dateText}>
              {new Date(receipt.issued_at).toLocaleDateString('ja-JP')}
            </Text>
          </View>

          <View style={styles.toRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toLabel}>宛名</Text>
              <Text style={styles.toName}>{receipt.issued_to_name}</Text>
            </View>
            <TouchableOpacity
              style={styles.editNameBtn}
              onPress={() => {
                setNameInput(receipt.issued_to_name ?? '');
                setEditingName(true);
              }}
            >
              <Ionicons name="pencil" size={14} color={COLORS.accent} />
              <Text style={styles.editNameText}>宛名変更</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>金 額</Text>
            <Text style={styles.amountValue}>¥ {(receipt.amount ?? 0).toLocaleString()}</Text>
          </View>

          <Text style={styles.provisoLabel}>但し書き</Text>
          <Text style={styles.provisoText}>
            {receipt.proviso ?? '商品代として'}
          </Text>
          <Text style={styles.footnote}>上記正に領収いたしました。</Text>

          {receipt.tax > 0 && (
            <Text style={styles.taxText}>（内消費税 ¥{receipt.tax.toLocaleString()}）</Text>
          )}

          <View style={styles.storeBox}>
            <Text style={styles.storeName}>Moveact {store.name}</Text>
            {!!store.address && (
              <Text style={styles.storeLine} numberOfLines={2}>{store.address}</Text>
            )}
            {!!store.phone && (
              <Text style={styles.storeLine}>TEL: {formatPhone(store.phone)}</Text>
            )}
          </View>
        </View>

        <View style={styles.hintCard}>
          <Ionicons name="information-circle-outline" size={14} color={COLORS.textLight} style={{ marginTop: 1 }} />
          <Text style={styles.hint}>
            宛名は「宛名変更」ボタンから修正できます。変更後に「PDF保存 / 共有」を押すと、更新された内容でPDFが発行されます。
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: 16 + insets.bottom }]}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={16} color={COLORS.text} />
          <Text style={[styles.actionBtnText, { color: COLORS.text }]}>戻る</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
          <Ionicons name="download-outline" size={16} color="#FFF" />
          <Text style={styles.actionBtnText}>PDF保存 / 共有</Text>
        </TouchableOpacity>
      </View>

      {/* 宛名編集モーダル */}
      <Modal
        visible={editingName}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingName(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => !saving && setEditingName(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>宛名を変更</Text>
            <Text style={styles.modalHint}>
              会社名・屋号での発行の場合はこちらに入力してください。
            </Text>
            <TextInput
              style={styles.modalInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="例：株式会社〇〇 / 山田太郎"
              placeholderTextColor={COLORS.textLight}
              autoFocus
              maxLength={60}
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.backgroundSoft }]}
                onPress={() => setEditingName(false)}
                disabled={saving}
              >
                <Text style={[styles.modalBtnText, { color: COLORS.text }]}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.accent }]}
                onPress={handleSaveName}
                disabled={saving}
              >
                <Text style={[styles.modalBtnText, { color: '#FFF' }]}>
                  {saving ? '保存中…' : '保存'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function receiptHtml(r: any): string {
  const store = getStoreInfo(r.store_id);
  return `
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: -apple-system, 'Hiragino Sans', sans-serif; padding: 40px; color: #222; }
        .title { text-align: center; font-size: 28px; letter-spacing: 8px; margin: 20px 0; }
        .divider { border-top: 2px solid #333; margin: 10px 0 30px; }
        .num { font-size: 12px; color: #666; }
        .num-val { font-size: 14px; font-weight: bold; }
        .to { border-bottom: 1px solid #999; padding: 20px 0 10px; font-size: 22px; font-weight: bold; }
        .amount-box { border: 3px solid #333; padding: 24px; text-align: center; margin: 30px 0; }
        .amount-val { font-size: 36px; font-weight: bold; margin: 10px 0; letter-spacing: 2px; }
        .proviso { margin: 20px 0; padding: 12px; background: #f5f0e8; }
        .store { margin-top: 60px; text-align: right; font-size: 13px; line-height: 1.8; }
        .store-name { font-size: 18px; font-weight: bold; }
        .store-line { color: #333; }
      </style>
    </head>
    <body>
      <div class="title">領 収 書</div>
      <div class="divider"></div>
      <div style="display:flex; justify-content:space-between;">
        <div><span class="num">No.</span> <span class="num-val">${r.receipt_number}</span></div>
        <div>${new Date(r.issued_at).toLocaleDateString('ja-JP')}</div>
      </div>
      <div class="to">${r.issued_to_name} 様</div>
      <div class="amount-box">
        <div>金 額</div>
        <div class="amount-val">¥ ${(r.amount ?? 0).toLocaleString()}</div>
        ${r.tax > 0 ? `<div style="font-size:11px;color:#666;">（内消費税 ¥${r.tax.toLocaleString()}）</div>` : ''}
      </div>
      <div class="proviso">但し書き: ${r.proviso ?? '商品代として'}</div>
      <div>上記正に領収いたしました。</div>
      <div class="store">
        <div class="store-name">Moveact ${store.name}</div>
        ${store.address ? `<div class="store-line">${store.address}</div>` : ''}
        ${store.phone ? `<div class="store-line">TEL: ${formatPhone(store.phone)}</div>` : ''}
      </div>
    </body>
    </html>
  `;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  summaryCard: {
    backgroundColor: COLORS.surface, borderRadius: 10,
    padding: 14, marginBottom: 14,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  summaryLabel: { fontSize: 10, color: COLORS.textLight, marginBottom: 4 },
  summaryOrderDate: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  summaryItem: { fontSize: 12, color: COLORS.textSecondary, marginBottom: 2 },
  receiptCard: {
    backgroundColor: '#FFF', borderRadius: 14, padding: 24,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  receiptTitle: {
    fontSize: 28, fontWeight: '700', textAlign: 'center',
    letterSpacing: 8, marginVertical: 8,
  },
  divider: { borderTopWidth: 2, borderTopColor: '#333', marginVertical: 14 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  numberLabel: { fontSize: 10, color: COLORS.textSecondary },
  numberText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  dateText: { fontSize: 13, color: COLORS.text },
  toRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 20 },
  toLabel: { fontSize: 10, color: COLORS.textSecondary, marginBottom: 4 },
  toName: {
    fontSize: 22, fontWeight: '700', color: COLORS.text,
    borderBottomWidth: 1, borderBottomColor: '#999',
    paddingBottom: 8,
  },
  editNameBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    backgroundColor: COLORS.accent + '15',
    marginLeft: 8,
  },
  editNameText: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  amountBox: {
    borderWidth: 3, borderColor: '#333', padding: 20,
    alignItems: 'center', marginVertical: 20,
  },
  amountLabel: { fontSize: 13, color: COLORS.text, marginBottom: 4 },
  amountValue: { fontSize: 36, fontWeight: '700', color: COLORS.text, letterSpacing: 2 },
  provisoLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 16 },
  provisoText: {
    fontSize: 14, color: COLORS.text,
    backgroundColor: (COLORS as any).accentLight ? (COLORS as any).accentLight + '40' : '#f5f0e8',
    padding: 10, borderRadius: 6, marginTop: 4,
  },
  footnote: { fontSize: 12, color: COLORS.textSecondary, marginTop: 12, textAlign: 'center' },
  taxText: { fontSize: 10, color: COLORS.textLight, textAlign: 'center', marginTop: 4 },
  storeBox: { marginTop: 30, gap: 2 },
  storeName: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 2, textAlign: 'right' },
  storeLine: { fontSize: 11, color: COLORS.textSecondary, textAlign: 'right' },
  hintCard: {
    flexDirection: 'row', gap: 6,
    marginTop: 16, padding: 10,
    backgroundColor: COLORS.surface, borderRadius: 8,
  },
  hint: { flex: 1, fontSize: 11, color: COLORS.textLight, lineHeight: 17 },
  actionBar: {
    flexDirection: 'row', gap: 8, padding: 16,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.borderLight,
  },
  actionBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.accent, paddingVertical: 12, borderRadius: 10,
  },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginTop: 12 },
  emptyText: {
    fontSize: 13, color: COLORS.textSecondary, textAlign: 'center',
    marginTop: 8, lineHeight: 20,
  },
  backBtn: {
    marginTop: 24, backgroundColor: COLORS.accent,
    paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10,
  },
  backBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', padding: 24,
  },
  modalCard: {
    backgroundColor: COLORS.surface, borderRadius: 14, padding: 20,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  modalHint: { fontSize: 11, color: COLORS.textLight, marginBottom: 12 },
  modalInput: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  modalBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10,
    alignItems: 'center',
  },
  modalBtnText: { fontSize: 13, fontWeight: '700' },
});
