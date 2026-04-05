import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  StyleSheet,
  RefreshControl,
  ScrollView,
  Dimensions,
  TextInput,
  LayoutAnimation,
  UIManager,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { StoreSelector } from '../../components/layout/StoreSelector';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { useCartStore } from '../../stores/cartStore';
import { useAuthStore } from '../../stores/authStore';
import { useFavoritesStore } from '../../stores/favoritesStore';
import { supabase } from '../../lib/supabase';
import type { Product } from '../../types/database';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

const ALL_CATEGORY = 'すべて';
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_GAP = 10;
const CARD_PADDING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - CARD_PADDING * 2 - CARD_GAP) / 2;

type SortOption = 'default' | 'price_asc' | 'price_desc';
const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: 'default', label: '標準' },
  { key: 'price_asc', label: '安い順' },
  { key: 'price_desc', label: '高い順' },
];

const CONCERN_FILTERS: { label: string; keywords: string[] }[] = [
  { label: '髪のダメージ', keywords: ['ドライヤー', 'ヘアアイロン', 'ストレートアイロン', 'カールアイロン', 'リセッター', 'ヘアケア', '髪'] },
  { label: '頭皮ケア', keywords: ['ヘッドスパ', '頭皮', 'ホットドロップ'] },
  { label: 'フェイスケア', keywords: ['カラット', 'カッサ', 'ハイドラ', 'ウォーミー', 'ダーマ', 'ポイント', 'フェイス', 'PLOSION', 'V3', 'SPICARE', 'ファンデ', 'セラム', '美容液', 'クレンジング'] },
  { label: 'ボディケア', keywords: ['フォーボディ', 'ボディ', 'SIXPAD', 'EMS', 'トレーニング', 'PAO'] },
  { label: 'シャワー・バス', keywords: ['ファインバブル', 'シャワー', 'ミスト', 'カートリッジ'] },
  { label: '光美容・脱毛', keywords: ['エピ', '光美容', 'シェーバー'] },
  { label: '姿勢・骨盤', keywords: ['Style', 'スタイル', '骨盤', '姿勢'] },
  { label: '腰・膝サポート', keywords: ['コルセット', 'サポーター', 'bonbone', 'ダイヤ', '膝', '腰', '骨盤ベルト', '外反母趾'] },
  { label: '睡眠・リラックス', keywords: ['NEWPEACE', 'マットレス', '枕', 'ピロー', 'アイマスク', 'リラック'] },
  { label: '足のお悩み', keywords: ['Lafeet', '足袋', '外反母趾', '足指'] },
];

export function ProductListScreen() {
  const navigation = useNavigation<any>();
  const { selectedStore } = useStoreSelection();
  const { profile } = useAuthStore();
  const itemCount = useCartStore((s) => s.getItemCount());
  const { favoriteIds, toggle: toggleFavorite, fetch: fetchFavorites } = useFavoritesStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORY);
  const [selectedConcern, setSelectedConcern] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('default');
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());

  useEffect(() => { fetchProducts(); }, [selectedStore]);
  useEffect(() => { if (profile) fetchFavorites(profile.id); }, [profile]);

  async function fetchProducts() {
    setIsLoading(true);
    const { data } = await supabase
      .from('products')
      .select('*, images:product_images(*)')
      .eq('is_active', true)
      .order('category')
      .order('sort_order');
    setProducts((data as Product[]) ?? []);
    setIsLoading(false);
  }

  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => { if (p.category) cats.add(p.category); });
    return [ALL_CATEGORY, ...Array.from(cats).sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (selectedCategory !== ALL_CATEGORY) {
      result = result.filter((p) => p.category === selectedCategory);
    }
    if (selectedConcern) {
      const concern = CONCERN_FILTERS.find((c) => c.label === selectedConcern);
      if (concern) {
        result = result.filter((p) => {
          const text = `${p.name} ${p.description ?? ''} ${p.category ?? ''}`;
          return concern.keywords.some((kw) => text.includes(kw));
        });
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((p) => {
        const text = `${p.name} ${p.description ?? ''} ${p.category ?? ''}`.toLowerCase();
        return text.includes(q);
      });
    }
    if (sortBy === 'price_asc') result = [...result].sort((a, b) => a.price - b.price);
    if (sortBy === 'price_desc') result = [...result].sort((a, b) => b.price - a.price);
    return result;
  }, [products, selectedCategory, selectedConcern, searchQuery, sortBy]);

  const listData = useMemo(() => {
    if (filteredProducts.length % 2 === 1) {
      return [...filteredProducts, { id: '__spacer__', _isSpacer: true } as any];
    }
    return filteredProducts;
  }, [filteredProducts]);

  const handleImageError = useCallback((productId: string) => {
    setImageErrors((prev) => new Set(prev).add(productId));
  }, []);

  function toggleFilters() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setFiltersExpanded(!filtersExpanded);
  }

  const activeFilterCount = (selectedCategory !== ALL_CATEGORY ? 1 : 0) + (selectedConcern ? 1 : 0);

  function renderProduct({ item }: { item: Product & { _isSpacer?: boolean } }) {
    if (item._isSpacer) return <View style={styles.productCard} />;
    const imageUrl = item.images?.[0]?.image_url;
    const hasImageError = imageErrors.has(item.id);
    const isFav = favoriteIds.has(item.id);

    return (
      <TouchableOpacity
        style={styles.productCard}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('ProductDetail', { productId: item.id })}
      >
        <View style={styles.imageContainer}>
          {imageUrl && !hasImageError ? (
            <Image source={{ uri: imageUrl }} style={styles.image} onError={() => handleImageError(item.id)} />
          ) : (
            <View style={styles.imagePlaceholder}>
              <Ionicons name="image-outline" size={36} color={COLORS.borderLight} />
            </View>
          )}
          {/* Favorite button */}
          <TouchableOpacity
            style={styles.favButton}
            onPress={() => profile && toggleFavorite(profile.id, item.id)}
          >
            <Ionicons name={isFav ? 'heart' : 'heart-outline'} size={18} color={isFav ? COLORS.error : COLORS.textLight} />
          </TouchableOpacity>
        </View>
        <View style={styles.productInfo}>
          {item.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText} numberOfLines={1}>{item.category}</Text>
            </View>
          )}
          <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
          {item.description && (
            <Text style={styles.productDesc} numberOfLines={1}>{item.description}</Text>
          )}
          <Text style={styles.productPrice}>¥{item.price.toLocaleString()}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <StoreSelector />

      {/* Search + Filter toggle row */}
      <View style={styles.searchRow}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="商品名で検索"
            placeholderTextColor={COLORS.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <TouchableOpacity style={styles.filterToggle} onPress={toggleFilters}>
          <Ionicons name="options-outline" size={20} color={filtersExpanded ? COLORS.accent : COLORS.textSecondary} />
          {activeFilterCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Cart banner */}
      {itemCount > 0 && (
        <TouchableOpacity style={styles.cartBanner} onPress={() => navigation.navigate('Cart')}>
          <View style={styles.cartBannerLeft}>
            <Ionicons name="bag-outline" size={18} color="#FFF" />
            <Text style={styles.cartBannerText}>カートに {itemCount} 点</Text>
          </View>
          <Text style={styles.cartBannerAction}>確認する</Text>
        </TouchableOpacity>
      )}

      {/* Collapsible filters */}
      {filtersExpanded && (
        <View style={styles.filterPanel}>
          {/* Brand filter */}
          {categories.length > 2 && (
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>ブランド</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {categories.map((cat) => {
                  const sel = selectedCategory === cat;
                  return (
                    <TouchableOpacity key={cat} style={[styles.chip, sel && styles.chipSelected]} onPress={() => setSelectedCategory(cat)}>
                      <Text style={[styles.chipText, sel && styles.chipTextSelected]}>{cat}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
          {/* Concern filter */}
          <View style={styles.filterSection}>
            <Text style={styles.filterLabel}>お悩みから探す</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
              {CONCERN_FILTERS.map((c) => {
                const sel = selectedConcern === c.label;
                return (
                  <TouchableOpacity key={c.label} style={[styles.chip, sel && styles.chipConcernSelected]} onPress={() => setSelectedConcern(sel ? null : c.label)}>
                    <Text style={[styles.chipText, sel && styles.chipTextSelected]}>{c.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      )}

      {/* Sort + count row */}
      <View style={styles.sortRow}>
        <Text style={styles.resultCountText}>{filteredProducts.length}件</Text>
        <View style={styles.sortButtons}>
          {SORT_OPTIONS.map((opt) => (
            <TouchableOpacity key={opt.key} style={[styles.sortChip, sortBy === opt.key && styles.sortChipSelected]} onPress={() => setSortBy(opt.key)}>
              <Text style={[styles.sortChipText, sortBy === opt.key && styles.sortChipTextSelected]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Product grid */}
      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        renderItem={renderProduct}
        numColumns={2}
        contentContainerStyle={styles.list}
        columnWrapperStyle={styles.row}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchProducts} tintColor={COLORS.accent} />}
        ListEmptyComponent={!isLoading ? (
          <View style={styles.emptyState}>
            <Ionicons name="bag-outline" size={32} color={COLORS.success} />
            <Text style={styles.emptyText}>商品準備中です</Text>
          </View>
        ) : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  /* Search row */
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: COLORS.text, padding: 0 },
  filterToggle: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  filterBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: { fontSize: 9, fontWeight: '700', color: '#FFF' },

  /* Cart banner */
  cartBanner: {
    backgroundColor: COLORS.accent,
    marginHorizontal: 16,
    marginBottom: 6,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cartBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cartBannerText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  cartBannerAction: { color: '#FFF', fontSize: 13, fontWeight: '600' },

  /* Collapsible filter panel */
  filterPanel: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
    paddingBottom: 10,
  },
  filterSection: { paddingTop: 10 },
  filterLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textSecondary,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  chipScroll: { paddingHorizontal: 12, gap: 6 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: COLORS.backgroundSoft,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipSelected: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipConcernSelected: { backgroundColor: COLORS.accentPink, borderColor: COLORS.accentPink },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  chipTextSelected: { color: '#FFF' },

  /* Sort row */
  sortRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  resultCountText: { fontSize: 12, color: COLORS.textSecondary, fontWeight: '500' },
  sortButtons: { flexDirection: 'row', gap: 6 },
  sortChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: COLORS.backgroundSoft,
  },
  sortChipSelected: { backgroundColor: COLORS.primary },
  sortChipText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  sortChipTextSelected: { color: '#FFF' },

  /* Product grid */
  list: { paddingHorizontal: CARD_PADDING, paddingTop: 4, paddingBottom: 24 },
  row: { gap: CARD_GAP, marginBottom: CARD_GAP },
  productCard: {
    flex: 1,
    maxWidth: CARD_WIDTH,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 0.9,
    backgroundColor: '#F8F6F4',
  },
  image: { width: '100%', height: '100%', resizeMode: 'contain' },
  imagePlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  favButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfo: { padding: 10, gap: 3 },
  categoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.accentLight,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 1,
  },
  categoryBadgeText: { fontSize: 9, fontWeight: '600', color: COLORS.accent },
  productName: { fontSize: 12, fontWeight: '500', color: COLORS.text, lineHeight: 16 },
  productDesc: { fontSize: 10, color: COLORS.textLight, lineHeight: 14 },
  productPrice: { fontSize: 15, fontWeight: '700', color: COLORS.accent, marginTop: 2 },

  /* Empty */
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyText: { fontSize: 14, color: COLORS.textSecondary },
});
