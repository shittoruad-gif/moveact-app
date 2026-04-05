import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Image, TouchableOpacity, StyleSheet, RefreshControl, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { useAuthStore } from '../../stores/authStore';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { supabase } from '../../lib/supabase';
import type { Product } from '../../types/database';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

export function FavoritesScreen() {
  const navigation = useNavigation<any>();
  const { profile } = useAuthStore();
  const { favoriteIds, toggle } = useFavoritesStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchFavorites(); }, [favoriteIds]);

  async function fetchFavorites() {
    if (!profile || favoriteIds.size === 0) {
      setProducts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('products')
      .select('*, images:product_images(*)')
      .in('id', Array.from(favoriteIds));
    setProducts((data as Product[]) ?? []);
    setLoading(false);
  }

  function renderProduct({ item }: { item: Product }) {
    const imageUrl = item.images?.[0]?.image_url;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('ShopTab', {
          screen: 'ProductDetail',
          params: { productId: item.id },
        })}
      >
        <View style={styles.imageWrap}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.image} />
          ) : (
            <Ionicons name="image-outline" size={32} color={COLORS.borderLight} />
          )}
          <TouchableOpacity
            style={styles.heartButton}
            onPress={() => profile && toggle(profile.id, item.id)}
          >
            <Ionicons name="heart" size={20} color={COLORS.error} />
          </TouchableOpacity>
        </View>
        <View style={styles.info}>
          <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
          <Text style={styles.price}>¥{item.price.toLocaleString()}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  const listData = products.length % 2 === 1
    ? [...products, { id: '__spacer__', _isSpacer: true } as any]
    : products;

  return (
    <FlatList
      data={listData}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => item._isSpacer ? <View style={styles.card} /> : renderProduct({ item })}
      numColumns={2}
      columnWrapperStyle={styles.row}
      contentContainerStyle={styles.list}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchFavorites} tintColor={COLORS.accent} />}
      ListEmptyComponent={
        !loading ? (
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={40} color={COLORS.borderLight} />
            <Text style={styles.emptyText}>お気に入りはまだありません</Text>
            <Text style={styles.emptySubtext}>商品のハートマークをタップして追加できます</Text>
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 32 },
  row: { gap: 12, marginBottom: 12 },
  card: {
    flex: 1,
    maxWidth: CARD_WIDTH,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
  },
  imageWrap: {
    width: '100%',
    aspectRatio: 0.85,
    backgroundColor: '#F8F6F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: { width: '100%', height: '100%', resizeMode: 'contain' },
  heartButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { padding: 10, gap: 4 },
  name: { fontSize: 12, fontWeight: '500', color: COLORS.text, lineHeight: 17 },
  price: { fontSize: 15, fontWeight: '700', color: COLORS.accent },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },
  emptySubtext: { fontSize: 12, color: COLORS.textLight },
});
