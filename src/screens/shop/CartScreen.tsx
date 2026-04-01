import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { useCartStore, CartItem } from '../../stores/cartStore';

export function CartScreen() {
  const navigation = useNavigation<any>();
  const { items, updateQuantity, removeItem, getTotal } = useCartStore();
  const total = getTotal();

  function renderItem({ item }: { item: CartItem }) {
    return (
      <View style={styles.cartItem}>
        <View style={styles.itemInfo}>
          <Text style={styles.itemName}>{item.product.name}</Text>
          <Text style={styles.itemPrice}>¥{item.product.price.toLocaleString()}</Text>
        </View>
        <View style={styles.quantityControl}>
          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => updateQuantity(item.product.id, item.quantity - 1)}
          >
            <Text style={styles.qtyButtonText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.quantity}>{item.quantity}</Text>
          <TouchableOpacity
            style={styles.qtyButton}
            onPress={() => updateQuantity(item.product.id, item.quantity + 1)}
          >
            <Text style={styles.qtyButtonText}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.subtotal}>
          ¥{(item.product.price * item.quantity).toLocaleString()}
        </Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>🛒</Text>
        <Text style={styles.emptyTitle}>カートが空です</Text>
        <Button
          title="ショップへ戻る"
          onPress={() => navigation.goBack()}
          variant="outline"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.product.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>合計</Text>
          <Text style={styles.totalPrice}>¥{total.toLocaleString()}</Text>
        </View>
        <Button
          title="レジに進む"
          onPress={() => navigation.navigate('Checkout')}
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
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: COLORS.background,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  list: {
    padding: 16,
  },
  cartItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  itemPrice: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  quantityControl: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    gap: 12,
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.primary,
  },
  quantity: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    minWidth: 24,
    textAlign: 'center',
  },
  subtotal: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.primary,
    minWidth: 70,
    textAlign: 'right',
  },
  separator: {
    height: 8,
  },
  footer: {
    padding: 16,
    paddingBottom: 32,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalPrice: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
  },
});
