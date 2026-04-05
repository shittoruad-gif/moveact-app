import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Dimensions, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { Button } from '../../components/ui/Button';
import { useCartStore } from '../../stores/cartStore';
import { useAuthStore } from '../../stores/authStore';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { supabase } from '../../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ShopStackParamList } from '../../types/navigation';
import type { Product } from '../../types/database';

type Props = NativeStackScreenProps<ShopStackParamList, 'ProductDetail'>;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function ProductDetailScreen({ route, navigation }: Props) {
  const { productId } = route.params;
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [added, setAdded] = useState(false);
  const addItem = useCartStore((s) => s.addItem);
  const itemCount = useCartStore((s) => s.getItemCount());
  const { profile } = useAuthStore();
  const { isFavorite, toggle: toggleFavorite } = useFavoritesStore();
  const imageListRef = useRef<FlatList>(null);

  useEffect(() => { fetchProduct(); }, [productId]);

  async function fetchProduct() {
    const { data } = await supabase
      .from('products')
      .select('*, images:product_images(*)')
      .eq('id', productId)
      .single();
    const p = data as Product;
    setProduct(p ?? null);

    // Fetch related products from same category
    if (p?.category) {
      const { data: related } = await supabase
        .from('products')
        .select('*, images:product_images(*)')
        .eq('category', p.category)
        .eq('is_active', true)
        .neq('id', productId)
        .limit(6);
      setRelatedProducts((related as Product[]) ?? []);
    }
  }

  function handleAddToCart() {
    if (!product) return;
    addItem(product);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  function handleImageScroll(e: any) {
    const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setSelectedImageIndex(index);
  }

  if (!product) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>...</Text>
      </View>
    );
  }

  const images = product.images?.sort((a, b) => a.sort_order - b.sort_order) ?? [];
  const hasImages = images.length > 0;
  const outOfStock = product.stock_quantity <= 0;
  const isFav = isFavorite(product.id);

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll}>
        {/* Image gallery with horizontal swipe */}
        <View style={styles.imageSection}>
          {hasImages ? (
            <>
              <FlatList
                ref={imageListRef}
                data={images}
                keyExtractor={(img) => img.id}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={handleImageScroll}
                renderItem={({ item: img }) => (
                  <Image source={{ uri: img.image_url }} style={styles.mainImage} />
                )}
              />
              {images.length > 1 && (
                <View style={styles.dots}>
                  {images.map((_, idx) => (
                    <View key={idx} style={[styles.dot, idx === selectedImageIndex && styles.dotActive]} />
                  ))}
                </View>
              )}
            </>
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={48} color={COLORS.borderLight} />
              <Text style={styles.placeholderText}>商品画像準備中</Text>
            </View>
          )}

          {/* Favorite button */}
          <TouchableOpacity
            style={styles.favButton}
            onPress={() => profile && toggleFavorite(profile.id, product.id)}
          >
            <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={22} color={isFav ? COLORS.error : COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Product info */}
        <View style={styles.content}>
          {product.category && <Text style={styles.category}>{product.category}</Text>}
          <Text style={styles.name}>{product.name}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>¥{product.price.toLocaleString()}</Text>
            {product.compare_at_price && product.compare_at_price > product.price && (
              <Text style={styles.comparePrice}>¥{product.compare_at_price.toLocaleString()}</Text>
            )}
            <Text style={styles.taxNote}>(税込)</Text>
          </View>

          {outOfStock && (
            <View style={styles.stockBadge}>
              <Text style={styles.stockBadgeText}>在庫切れ</Text>
            </View>
          )}

          {product.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionTitle}>商品説明</Text>
              <Text style={styles.description}>{product.description}</Text>
            </View>
          )}

          <View style={styles.noteSection}>
            <Ionicons name="storefront-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.noteText}>店舗にてお受け取りいただけます</Text>
          </View>
        </View>

        {/* Related products */}
        {relatedProducts.length > 0 && (
          <View style={styles.relatedSection}>
            <Text style={styles.relatedTitle}>同じブランドの商品</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.relatedScroll}>
              {relatedProducts.map((rp) => {
                const rpImage = rp.images?.[0]?.image_url;
                return (
                  <TouchableOpacity
                    key={rp.id}
                    style={styles.relatedCard}
                    onPress={() => {
                      setProduct(null);
                      setRelatedProducts([]);
                      setSelectedImageIndex(0);
                      navigation.push('ProductDetail', { productId: rp.id });
                    }}
                  >
                    <View style={styles.relatedImageWrap}>
                      {rpImage ? (
                        <Image source={{ uri: rpImage }} style={styles.relatedImage} />
                      ) : (
                        <Ionicons name="image-outline" size={20} color={COLORS.borderLight} />
                      )}
                    </View>
                    <Text style={styles.relatedName} numberOfLines={2}>{rp.name}</Text>
                    <Text style={styles.relatedPrice}>¥{rp.price.toLocaleString()}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        {itemCount > 0 && (
          <TouchableOpacity style={styles.cartLink} onPress={() => navigation.navigate('Cart')}>
            <Ionicons name="bag-outline" size={16} color={COLORS.accent} />
            <Text style={styles.cartLinkText}>カート ({itemCount})</Text>
          </TouchableOpacity>
        )}
        <View style={styles.footerButton}>
          <Button
            title={added ? 'カートに追加しました' : outOfStock ? '在庫切れ' : 'カートに追加'}
            onPress={handleAddToCart}
            disabled={outOfStock || added}
            size="large"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 14, color: COLORS.textSecondary },
  scroll: { flex: 1 },
  imageSection: { backgroundColor: COLORS.backgroundSoft, position: 'relative' },
  mainImage: { width: SCREEN_WIDTH, aspectRatio: 1, resizeMode: 'contain', backgroundColor: '#FFF' },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.borderLight },
  dotActive: { backgroundColor: COLORS.accent, width: 18 },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 1.2,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  placeholderText: { fontSize: 13, color: COLORS.textLight },
  favButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  content: { padding: 20 },
  category: { fontSize: 12, fontWeight: '500', color: COLORS.accent, letterSpacing: 0.5, marginBottom: 6 },
  name: { fontSize: 20, fontWeight: '700', color: COLORS.text, lineHeight: 28, marginBottom: 12 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 16 },
  price: { fontSize: 24, fontWeight: '700', color: COLORS.primary },
  comparePrice: { fontSize: 15, color: COLORS.textLight, textDecorationLine: 'line-through' },
  taxNote: { fontSize: 12, color: COLORS.textSecondary },
  stockBadge: { backgroundColor: '#FDE8E8', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, marginBottom: 16 },
  stockBadgeText: { fontSize: 12, fontWeight: '600', color: COLORS.error },
  descriptionSection: { marginBottom: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  description: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  noteSection: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surfaceWarm, padding: 14, borderRadius: 12 },
  noteText: { fontSize: 13, color: COLORS.textSecondary },

  /* Related products */
  relatedSection: { paddingLeft: 20, paddingTop: 8 },
  relatedTitle: { fontSize: 15, fontWeight: '600', color: COLORS.text, marginBottom: 12 },
  relatedScroll: { gap: 10, paddingRight: 20 },
  relatedCard: {
    width: 130,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    overflow: 'hidden',
  },
  relatedImageWrap: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#F8F6F4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  relatedImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  relatedName: { fontSize: 11, fontWeight: '500', color: COLORS.text, padding: 8, paddingBottom: 2, lineHeight: 15 },
  relatedPrice: { fontSize: 13, fontWeight: '700', color: COLORS.accent, paddingHorizontal: 8, paddingBottom: 8 },

  /* Footer */
  footer: { padding: 16, paddingBottom: 32, backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.border },
  cartLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 },
  cartLinkText: { fontSize: 13, fontWeight: '600', color: COLORS.accent },
  footerButton: { width: '100%' },
});
