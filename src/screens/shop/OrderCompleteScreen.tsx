import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ShopStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<ShopStackParamList, 'OrderComplete'>;

export function OrderCompleteScreen({ navigation }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.iconWrap}>
        <Ionicons name="checkmark-circle" size={64} color={COLORS.success} />
      </View>
      <Text style={styles.title}>ご注文ありがとうございます</Text>
      <Text style={styles.subtitle}>
        商品の準備が整い次第、{'\n'}通知にてお知らせいたします。
      </Text>
      <Text style={styles.note}>
        お受け取りは店舗にてお願いいたします。
      </Text>
      <View style={styles.actions}>
        <Button
          title="ホームに戻る"
          onPress={() => navigation.getParent()?.navigate('HomeTab')}
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
    marginBottom: 8,
  },
  note: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
    marginBottom: 40,
  },
  actions: { width: '100%', gap: 12 },
});
