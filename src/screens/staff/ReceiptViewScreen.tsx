// 領収書表示画面（印刷用プレビュー）
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useStoreSelection } from '../../stores/storeSelectionStore';

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
  const d = (phone ?? '').replace(/\D/g, '');
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

export function ReceiptViewScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { selectedStore } = useStoreSelection();
  const receiptId: string = route.params.receiptId;
  const [receipt, setReceipt] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('receipts')
        .select('*, issued_by_profile:profiles!receipts_issued_by_fkey(full_name)')
        .eq('id', receiptId)
        .single();
      setReceipt(data);
      setLoading(false);
    })();
  }, [receiptId]);

  async function handlePrint() {
    // Lazy require (expo-print / expo-sharing optional - install to enable printing)
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Print = require('expo-print');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const Sharing = require('expo-sharing');
      const html = receiptHtml(receipt);
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { dialogTitle: `領収書 ${receipt.receipt_number}` });
    } catch {
      Alert.alert(
        '印刷機能は未セットアップ',
        'expo-print と expo-sharing をインストールすると直接印刷・PDF共有が可能になります。現在はスクリーンショットをご利用ください。'
      );
    }
  }

  if (loading || !receipt) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  const store = getStoreInfo(receipt.store_id);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        {/* Receipt visual */}
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

          <Text style={styles.toLabel}>宛名</Text>
          <Text style={styles.toName}>{receipt.issued_to_name}</Text>

          <View style={styles.amountBox}>
            <Text style={styles.amountLabel}>金 額</Text>
            <Text style={styles.amountValue}>¥ {(receipt.amount ?? 0).toLocaleString()}</Text>
          </View>

          <Text style={styles.provisoLabel}>但し書き</Text>
          <Text style={styles.provisoText}>
            {receipt.proviso ?? '施術代として'}
          </Text>
          <Text style={styles.footnote}>上記正に領収いたしました。</Text>

          {receipt.tax > 0 && (
            <Text style={styles.taxText}>（内消費税 ¥{receipt.tax.toLocaleString()}）</Text>
          )}

          <View style={styles.storeBox}>
            <Text style={styles.storeName}>Moveact {store.name}</Text>
            {!!store.address && <Text style={styles.storeLine}>{store.address}</Text>}
            {!!store.phone && <Text style={styles.storeLine}>TEL: {formatPhone(store.phone)}</Text>}
            <Text style={styles.storeInfo}>
              発行者: {receipt.issued_by_profile?.full_name ?? '---'}
            </Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.actionBar}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border }]}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={16} color={COLORS.text} />
          <Text style={[styles.actionBtnText, { color: COLORS.text }]}>戻る</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={handlePrint}>
          <Ionicons name="share-outline" size={16} color="#FFF" />
          <Text style={styles.actionBtnText}>印刷 / 共有</Text>
        </TouchableOpacity>
      </View>
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
        body { font-family: -apple-system, 'Hiragino Sans', sans-serif; padding: 40px; }
        .title { text-align: center; font-size: 28px; letter-spacing: 8px; margin: 20px 0; }
        .divider { border-top: 2px solid #333; margin: 10px 0 30px; }
        .num { font-size: 12px; color: #666; }
        .num-val { font-size: 14px; font-weight: bold; }
        .to { border-bottom: 1px solid #999; padding: 20px 0 10px; font-size: 20px; font-weight: bold; }
        .amount-box { border: 3px solid #333; padding: 24px; text-align: center; margin: 30px 0; }
        .amount-val { font-size: 36px; font-weight: bold; margin: 10px 0; }
        .proviso { margin: 20px 0; padding: 12px; background: #f5f0e8; }
        .store { margin-top: 60px; text-align: right; font-size: 13px; line-height: 1.8; }
        .store-name { font-size: 18px; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="title">領 収 書</div>
      <div class="divider"></div>
      <div style="display:flex; justify-content:space-between;">
        <div><span class="num">No.</span> <span class="num-val">${r.receipt_number}</span></div>
        <div>${new Date(r.issued_at).toLocaleDateString('ja-JP')}</div>
      </div>
      <div class="to">${r.issued_to_name}</div>
      <div class="amount-box">
        <div>金 額</div>
        <div class="amount-val">¥ ${(r.amount ?? 0).toLocaleString()}</div>
        ${r.tax > 0 ? `<div style="font-size:11px;color:#666;">（内消費税 ¥${r.tax.toLocaleString()}）</div>` : ''}
      </div>
      <div class="proviso">但し書き: ${r.proviso ?? '施術代として'}</div>
      <div>上記正に領収いたしました。</div>
      <div class="store">
        <div class="store-name">Moveact ${store.name}</div>
        ${store.address ? `<div>${store.address}</div>` : ''}
        ${store.phone ? `<div>TEL: ${formatPhone(store.phone)}</div>` : ''}
      </div>
    </body>
    </html>
  `;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
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
  toLabel: { fontSize: 10, color: COLORS.textSecondary, marginTop: 8 },
  toName: {
    fontSize: 22, fontWeight: '700', color: COLORS.text,
    borderBottomWidth: 1, borderBottomColor: '#999',
    paddingBottom: 8, marginBottom: 20,
  },
  amountBox: {
    borderWidth: 3, borderColor: '#333', padding: 20,
    alignItems: 'center', marginVertical: 20,
  },
  amountLabel: { fontSize: 13, color: COLORS.text, marginBottom: 4 },
  amountValue: { fontSize: 36, fontWeight: '700', color: COLORS.text, letterSpacing: 2 },
  provisoLabel: { fontSize: 11, color: COLORS.textSecondary, marginTop: 16 },
  provisoText: {
    fontSize: 14, color: COLORS.text,
    backgroundColor: COLORS.accentLight + '40',
    padding: 10, borderRadius: 6, marginTop: 4,
  },
  footnote: { fontSize: 12, color: COLORS.textSecondary, marginTop: 12, textAlign: 'center' },
  taxText: { fontSize: 10, color: COLORS.textLight, textAlign: 'center', marginTop: 4 },
  storeBox: { marginTop: 30, alignItems: 'flex-end', gap: 2 },
  storeName: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  storeLine: { fontSize: 11, color: COLORS.textSecondary },
  storeInfo: { fontSize: 11, color: COLORS.textSecondary, marginTop: 6 },
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
});
