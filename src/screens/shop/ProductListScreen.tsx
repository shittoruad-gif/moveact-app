import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { StoreSelector } from '../../components/layout/StoreSelector';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { useCartStore } from '../../stores/cartStore';
import { supabase } from '../../lib/supabase';
import type { Product } from '../../types/database';

export function ProductListScreen() {
  const navigation = useNavigation<any>();
  const { selectedStore } = useStoreSelection();
  const itemCount = useCartStore((s) => s.getItemCount());
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => { fetchProducts(); }, [selectedStore]);

  async function fetchProducts() {
    setIsLoading(true);
    const { data } = await supabase
      .from('products')
      .select('*, images:product_images(*)')
      .eq('is_active', true)
      .order('sort_order');
    setProducts((data as Product[]) ?? []);
    setIsLoading(false);
  }

  function renderProduct({ item }: { item: Product }) {
    const imageUrl = item.images?.[0]?.image_url;
    return (
      <TouchableOpacity
        style={styles.productCard}
        onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
      >
        <View style={styles.imageContainer}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.image} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={28} color={COLORS.borderLight} />
            </View>
          )}
        </View>
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.productPrice}>{item.price.toLocaleString()}円</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <StoreSelector />
      {itemCount > 0 && (
        <TouchableOpacity style={styles.cartBanner} onPress={() => navigation.navigate('Cart')}>
          <View style={styles.cartBannerLeft}>
            <Ionicons name="bag-outline" size={18} color={COLORS.surface} />
            <Text style={styles.cartBannerText}>カートに {itemCount} 点</Text>
          </View>
          <Text style={styles.cartBannerAction}>確認する</Text>
        </TouchableOpacity>
      )}
      <FlatList
        data={products}
        keyExtractor={(item) => item.id}
        renderItem={renderProduct}
        numColumns={2}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.row}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchProducts} tintColor={COLORS.accent} />}
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconWrap}>
                <Ionicons name="bag-outline" size={32} color={COLORS.success} />
              </View>
              <Text style={styles.emptyText}>商品準備中です</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  cartBanner: {
    backgroundColor: COLORS.accent,
    marginHorizontal: 20,
    marginBottom: 8,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cartBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartBannerText: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  cartBannerAction: { color: '#FFF', fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  list: { padding: 20 },
  row: { gap: 12, marginBottom: 12 },
  productCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    overflow: 'hidden',
  },
  imageContainer: { aspectRatio: 1, backgroundColor: COLORS.backgroundSoft },
  image: { width: '100%', height: '100%', resizeMode: 'cover' },
  imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  productInfo: { padding: 12 },
  productName: { fontSize: 13, fontWeight: '500', color: COLORS.text, marginBottom: 6, lineHeight: 18 },
  productPrice: { fontSize: 15, fontWeight: '600', color: COLORS.accent, letterSpacing: 0.3 },
  emptyState: { alignItems: 'center', paddingVertical: 48 },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: '#E5EDE8', justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },
});
