import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { supabase } from '../../lib/supabase';
import { formatYen } from '../../lib/format';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ShopStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<ShopStackParamList, 'OrderComplete'>;

interface OrderInfo {
  total: number;
  discount_amount: number | null;
}

export function OrderCompleteScreen({ navigation, route }: Props) {
  const { orderId } = route.params;
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('orders')
        .select('total, discount_amount')
        .eq('id', orderId)
        .single();
      setOrder(data as OrderInfo | null);
      setLoading(false);
    })();
  }, [orderId]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
      </View>
      <Text style={styles.title}>ご注文ありがとうございます</Text>
      <Text style={styles.subtitle}>
        商品の準備が整い次第、{'\n'}通知にてお知らせいたします。
      </Text>

      {order && (
        <View style={styles.summary}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>お支払い方法</Text>
            <Text style={styles.rowValue}>店舗でお支払い</Text>
          </View>
          {order.discount_amount && order.discount_amount > 0 ? (
            <View style={styles.row}>
              <Text style={styles.rowLabel}>クーポン割引</Text>
              <Text style={[styles.rowValue, { color: COLORS.accent }]}>
                -{formatYen(order.discount_amount)}
              </Text>
            </View>
          ) : null}
          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.rowLabelBold}>合計</Text>
            <Text style={styles.rowValueBold}>{formatYen(order.total)}</Text>
          </View>
        </View>
      )}

      <Text style={styles.note}>お支払いと商品お受け取りは店舗にてお願いいたします。</Text>

      <View style={styles.actions}>
        <Button
          title="ホームに戻る"
          onPress={() => navigation.getParent()?.navigate('HomeTab' as never)}
          size="large"
        />
        <Button
          title="ショップに戻る"
          onPress={() => navigation.popToTop()}
          variant="outline"
          size="large"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  iconWrap: { marginBottom: 24 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  summary: {
    width: '100%',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.borderLight,
    marginTop: 6,
    paddingTop: 12,
  },
  rowLabel: { fontSize: 13, color: COLORS.textSecondary },
  rowValue: { fontSize: 14, color: COLORS.text },
  rowLabelBold: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  rowValueBold: { fontSize: 18, fontWeight: '700', color: COLORS.accent },
  note: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 32,
  },
  actions: { width: '100%', gap: 12 },
});
