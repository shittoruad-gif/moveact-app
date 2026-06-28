import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, Dimensions, FlatList, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { useAuthStore } from '../../stores/authStore';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { supabase } from '../../lib/supabase';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ShopStackParamList } from '../../types/navigation';
import type { Product } from '../../types/database';

type Props = NativeStackScreenProps<ShopStackParamList, 'ProductDetail'>;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// カラー名（日本語）→ スウォッチ表示用の代表色。部分一致で判定。
const COLOR_HEX: [string, string][] = [
  ['ブラック', '#222222'], ['ダークグレー', '#555555'], ['ミドルグレー', '#9a9a9a'],
  ['ライトグレー', '#cfcfcf'], ['アッシュグレー', '#b8b8b8'], ['ブルーグレー', '#8c9aa6'], ['グレー', '#a8a8a8'],
  ['アイボリー', '#f4efe2'], ['クリーム', '#f3e9d2'], ['オートミール', '#e2d6bf'],
  ['ライトベージュ', '#e7d8c0'], ['ベージュ', '#d9c3a3'], ['ブラウン', '#8a5a3b'], ['ダークブラウン', '#5b3a26'],
  ['ネイビー', '#27324f'], ['インディゴ', '#34476b'], ['デニム', '#4a6488'], ['ロイヤルブルー', '#2f57c4'],
  ['ターコイズ', '#2bb3b3'], ['サックス', '#9cc3e0'], ['ベビーブルー', '#bcd6ec'], ['オールドブルー', '#6f8aa1'],
  ['ブルー', '#3d6fd0'],
  ['ダークグリーン', '#2f5d3a'], ['カーキグリーン', '#7c7a45'], ['セイジグリーン', '#9cae8a'],
  ['ピスタチオ', '#bcd29a'], ['ミント', '#bfe3cf'], ['ペールミント', '#cfe8d6'], ['ペールアクア', '#bfe0dd'],
  ['グリーン', '#3f8f55'],
  ['フューシャーピンク', '#d6457f'], ['フューシャピンク', '#d6457f'], ['ベビーピンク', '#f3c9d6'],
  ['ペールピンク', '#f0d2da'], ['ダルピンク', '#c98ea0'], ['サーモンピンク', '#f0a88c'], ['ローズミスト', '#cf9aa6'],
  ['ピンク', '#e887ab'], ['マゼンタ', '#c02a73'], ['プラム', '#7c4a64'], ['コスモス', '#cf7ea0'],
  ['ワイン', '#6e2233'], ['ガーネット', '#7a2230'], ['ダークレッド', '#8e2b2b'], ['オータムレッド', '#9e3b2e'],
  ['レッド', '#c0392b'], ['サンタフェ', '#b5694b'], ['オレンジ', '#e07b34'],
  ['レモンイエロー', '#f2e06a'], ['マスタード', '#d6a52f'], ['イエロー', '#f1cf4a'],
  ['パープル', '#7a5aa0'], ['杢', '#bdb2a0'],
];
function colorToHex(name: string): string {
  for (const [k, hex] of COLOR_HEX) if (name.includes(k)) return hex;
  return '#cccccc';
}

export function ProductDetailScreen({ route, navigation }: Props) {
  const { productId } = route.params;
  const [product, setProduct] = useState<Product | null>(null);
  const [relatedProducts, setRelatedProducts] = useState<Product[]>([]);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
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

  async function openExternal(
    url: string,
    title: string,
    message: string,
  ) {
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert('エラー', 'このURLを開けませんでした');
        return;
      }
      Alert.alert(title, message, [
        { text: 'キャンセル', style: 'cancel' },
        { text: '開く', onPress: () => Linking.openURL(url) },
      ]);
    } catch {
      Alert.alert('エラー', 'リンクを開けませんでした');
    }
  }

  async function handleOpenBhappy() {
    if (!product?.bhappy_url) return;
    await openExternal(
      product.bhappy_url,
      'B Happyで購入',
      'B Happy公式サイトを開きます。購入手続きはB Happyのページで完了します。',
    );
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
  const hasBhappy = !!product.bhappy_url;
  // Default to store available=true for legacy products where the flag has not been set
  const storeAvailable = product.available_in_store !== false;

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
          {product.brand ? (
            <Text style={styles.category}>{product.brand}</Text>
          ) : (
            product.category && <Text style={styles.category}>{product.category}</Text>
          )}
          <Text style={styles.name}>{product.name}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>¥{product.price.toLocaleString()}</Text>
            {product.compare_at_price && product.compare_at_price > product.price && (
              <Text style={styles.comparePrice}>¥{product.compare_at_price.toLocaleString()}</Text>
            )}
            <Text style={styles.taxNote}>(税込)</Text>
          </View>

          {storeAvailable && outOfStock && (
            <View style={styles.stockBadge}>
              <Text style={styles.stockBadgeText}>店頭在庫切れ</Text>
            </View>
          )}

          {/* サイズ展開 */}
          {product.sizes && product.sizes.length > 0 && (
            <View style={styles.variationSection}>
              <Text style={styles.sectionTitle}>サイズ展開</Text>
              <View style={styles.chipWrap}>
                {product.sizes.map((s) => (
                  <View key={s} style={styles.sizeChip}>
                    <Text style={styles.sizeChipText}>{s}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* カラー展開 */}
          {product.colors && product.colors.length > 0 && (
            <View style={styles.variationSection}>
              <Text style={styles.sectionTitle}>カラー展開（全{product.colors.length}色）</Text>
              <View style={styles.chipWrap}>
                {product.colors.map((c) => (
                  <View key={c} style={styles.colorChip}>
                    <View style={[styles.colorDot, { backgroundColor: colorToHex(c) }]} />
                    <Text style={styles.colorChipText}>{c}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.variationNote}>※ 在庫状況により、ご用意できない色・サイズがございます。</Text>
            </View>
          )}

          {product.description && (
            <View style={styles.descriptionSection}>
              <Text style={styles.sectionTitle}>商品説明</Text>
              <Text style={styles.description}>{product.description}</Text>
            </View>
          )}

          {/* Purchase route summary */}
          <View style={styles.routeSection}>
            <Text style={styles.sectionTitle}>ご購入方法</Text>
            {storeAvailable && (
              <View style={styles.routeItem}>
                <View style={[styles.routeIcon, { backgroundColor: COLORS.accent + '15' }]}>
                  <Ionicons name="storefront-outline" size={18} color={COLORS.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeTitle}>店頭で購入</Text>
                  <Text style={styles.routeDesc}>
                    次回来店時にスタッフへお声がけください。実際に触れてお試しいただけます
                  </Text>
                </View>
              </View>
            )}
            {hasBhappy && (
              <View style={styles.routeItem}>
                <View style={[styles.routeIcon, { backgroundColor: '#FF2D5515' }]}>
                  <Ionicons name="globe-outline" size={18} color="#FF2D55" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.routeTitle}>B Happyで購入</Text>
                  <Text style={styles.routeDesc}>
                    MTG公式ショップ「B Happy」でオンライン購入できます
                  </Text>
                </View>
              </View>
            )}
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
        <View style={styles.ctaStack}>
          {/* メイン購入ボタン（店頭受取・店頭支払い） */}
          {storeAvailable && (
            <TouchableOpacity
              style={[
                styles.ctaBtn,
                styles.storeBtn,
                outOfStock && { opacity: 0.5 },
              ]}
              onPress={() => navigation.navigate('ProductCheckout', { productId: product.id })}
              disabled={outOfStock}
              activeOpacity={0.85}
            >
              <Ionicons name="cart-outline" size={16} color="#FFF" />
              <Text style={styles.ctaBtnText}>
                {outOfStock ? '店頭在庫切れ' : '購入する'}
              </Text>
            </TouchableOpacity>
          )}

          {/* B Happy誘導は外部リンクのため別ボタンで残す */}
          {hasBhappy && (
            <TouchableOpacity
              style={[styles.ctaBtn, styles.bhappyBtn]}
              onPress={handleOpenBhappy}
              activeOpacity={0.85}
            >
              <Ionicons name="globe-outline" size={16} color="#FFF" />
              <Text style={styles.ctaBtnText}>B Happyで購入</Text>
            </TouchableOpacity>
          )}
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
  variationSection: { marginBottom: 18 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sizeChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    backgroundColor: COLORS.backgroundSoft, borderWidth: 1, borderColor: COLORS.border,
  },
  sizeChipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  colorChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  colorDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 0.5, borderColor: 'rgba(0,0,0,0.15)' },
  colorChipText: { fontSize: 12, color: COLORS.text },
  variationNote: { fontSize: 11, color: COLORS.textLight, marginTop: 8 },
  description: { fontSize: 14, color: COLORS.textSecondary, lineHeight: 22 },
  noteSection: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.surfaceWarm, padding: 14, borderRadius: 12 },
  noteText: { fontSize: 13, color: COLORS.textSecondary },

  /* Purchase routes */
  routeSection: { marginTop: 8 },
  routeItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: COLORS.surfaceWarm,
    padding: 14, borderRadius: 12, marginBottom: 8,
  },
  routeIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  routeTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  routeDesc: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 18, marginTop: 2 },

  /* Multi-route CTA stack */
  ctaStack: { gap: 8 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 14, borderRadius: 12,
  },
  storeBtn: { backgroundColor: COLORS.accent },
  bhappyBtn: { backgroundColor: '#FF2D55' },
  ctaBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },

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
