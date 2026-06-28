// 物販商品 新規登録・編集（スタッフ用）
// B Happy URL / 店頭販売フラグ / 仕入値 / ブランドなど
import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Switch, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, PRODUCT_BRANDS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

export function StaffProductFormScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const productId: string | undefined = route.params?.productId;
  const isEdit = !!productId;

  const [name, setName] = useState('');
  const [brand, setBrand] = useState<string | null>(null);
  const [category, setCategory] = useState('');
  const [sku, setSku] = useState('');
  const [description, setDescription] = useState('');
  const [priceText, setPriceText] = useState('');
  const [wholesalePriceText, setWholesalePriceText] = useState('');
  const [compareAtPriceText, setCompareAtPriceText] = useState('');
  const [stockText, setStockText] = useState('0');
  const [thresholdText, setThresholdText] = useState('5');
  const [bhappyUrl, setBhappyUrl] = useState('');
  const [availableInStore, setAvailableInStore] = useState(true);
  const [isActive, setIsActive] = useState(true);
  const [imageUrl, setImageUrl] = useState('');
  const [existingImages, setExistingImages] = useState<{ id: string; image_url: string }[]>([]);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('*, images:product_images(id, image_url, sort_order)')
        .eq('id', productId)
        .single();
      if (data) {
        setName(data.name ?? '');
        setBrand(data.brand ?? null);
        setCategory(data.category ?? '');
        setSku(data.sku ?? '');
        setDescription(data.description ?? '');
        setPriceText(String(data.price ?? ''));
        setWholesalePriceText(data.wholesale_price != null ? String(data.wholesale_price) : '');
        setCompareAtPriceText(data.compare_at_price != null ? String(data.compare_at_price) : '');
        setStockText(String(data.stock_quantity ?? 0));
        setThresholdText(String(data.low_stock_threshold ?? 5));
        setBhappyUrl(data.bhappy_url ?? '');
        setAvailableInStore(data.available_in_store !== false);
        setIsActive(!!data.is_active);
        const imgs = (data.images ?? []) as { id: string; image_url: string; sort_order: number }[];
        setExistingImages(
          imgs.sort((a, b) => a.sort_order - b.sort_order).map(({ id, image_url }) => ({ id, image_url })),
        );
      }
      setLoading(false);
    })();
  }, [productId, isEdit]);

  function autoCalcWholesale() {
    const p = parseInt(priceText, 10);
    if (!isNaN(p) && p > 0) {
      setWholesalePriceText(String(Math.round(p * 0.7)));
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      Alert.alert('エラー', '商品名を入力してください');
      return;
    }
    const price = parseInt(priceText, 10);
    if (isNaN(price) || price < 0) {
      Alert.alert('エラー', '販売価格を正しく入力してください');
      return;
    }
    if (bhappyUrl.trim() && !bhappyUrl.trim().startsWith('http')) {
      Alert.alert('エラー', 'B Happy URLはhttp/httpsで始まる必要があります');
      return;
    }
    if (!bhappyUrl.trim() && !availableInStore) {
      Alert.alert('エラー', 'B Happyか店頭販売の少なくとも一方を有効にしてください');
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        name: name.trim(),
        brand: brand,
        category: category.trim() || null,
        sku: sku.trim() || null,
        description: description.trim() || null,
        price,
        compare_at_price: compareAtPriceText ? parseInt(compareAtPriceText, 10) : null,
        wholesale_price: wholesalePriceText ? parseInt(wholesalePriceText, 10) : null,
        stock_quantity: parseInt(stockText, 10) || 0,
        low_stock_threshold: parseInt(thresholdText, 10) || 5,
        bhappy_url: bhappyUrl.trim() || null,
        available_in_store: availableInStore,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      let savedId = productId;
      if (isEdit) {
        const { error } = await supabase.from('products').update(payload).eq('id', productId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('products').insert(payload).select('id').single();
        if (error) throw error;
        savedId = data.id;
      }

      // Add new image if URL provided
      if (imageUrl.trim() && savedId) {
        const nextOrder = existingImages.length;
        await supabase
          .from('product_images')
          .insert({ product_id: savedId, image_url: imageUrl.trim(), sort_order: nextOrder });
      }

      Alert.alert('保存完了', '商品を保存しました', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveImage(imgId: string) {
    await supabase.from('product_images').delete().eq('id', imgId);
    setExistingImages((prev) => prev.filter((i) => i.id !== imgId));
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  const priceNum = parseInt(priceText, 10);
  const wholesaleNum = parseInt(wholesalePriceText, 10);
  const margin =
    !isNaN(priceNum) && !isNaN(wholesaleNum) && priceNum > 0
      ? Math.round(((priceNum - wholesaleNum) / priceNum) * 100)
      : null;
  const grossProfit =
    !isNaN(priceNum) && !isNaN(wholesaleNum) ? priceNum - wholesaleNum : null;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ padding: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>商品名 *</Text>
        <TextInput
          style={styles.input}
          placeholder="例: ReFa CARAT"
          placeholderTextColor={COLORS.textLight}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.label}>ブランド</Text>
        <View style={styles.row}>
          {PRODUCT_BRANDS.map((b) => (
            <TouchableOpacity
              key={b}
              style={[styles.chip, brand === b && styles.chipActive]}
              onPress={() => setBrand(brand === b ? null : b)}
            >
              <Text style={[styles.chipText, brand === b && styles.chipTextActive]}>{b}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>カテゴリ（任意）</Text>
        <TextInput
          style={styles.input}
          placeholder="例: 美容家電、フィットネス"
          placeholderTextColor={COLORS.textLight}
          value={category}
          onChangeText={setCategory}
        />

        <Text style={styles.label}>SKU（任意）</Text>
        <TextInput
          style={styles.input}
          placeholder="例: MTG-RF-001"
          placeholderTextColor={COLORS.textLight}
          value={sku}
          onChangeText={setSku}
          autoCapitalize="characters"
        />

        <Text style={styles.label}>商品説明</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          multiline
          placeholder="商品の特徴・使い方・仕様など"
          placeholderTextColor={COLORS.textLight}
          value={description}
          onChangeText={setDescription}
          textAlignVertical="top"
        />

        {/* Price */}
        <Text style={styles.sectionHeader}>価格</Text>
        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>販売価格（税込）*</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="25800"
              placeholderTextColor={COLORS.textLight}
              value={priceText}
              onChangeText={(v) => setPriceText(v.replace(/[^0-9]/g, ''))}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>参考価格（取消線）</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="任意"
              placeholderTextColor={COLORS.textLight}
              value={compareAtPriceText}
              onChangeText={(v) => setCompareAtPriceText(v.replace(/[^0-9]/g, ''))}
            />
          </View>
        </View>

        <View style={styles.twoCol}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>仕入値（B Happy 70%）</Text>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="18060"
              placeholderTextColor={COLORS.textLight}
              value={wholesalePriceText}
              onChangeText={(v) => setWholesalePriceText(v.replace(/[^0-9]/g, ''))}
            />
          </View>
          <View style={{ flex: 1, justifyContent: 'flex-end' }}>
            <TouchableOpacity style={styles.autoBtn} onPress={autoCalcWholesale}>
              <Ionicons name="calculator-outline" size={14} color={COLORS.accent} />
              <Text style={styles.autoBtnText}>自動計算（×0.7）</Text>
            </TouchableOpacity>
          </View>
        </View>

        {margin !== null && grossProfit !== null && (
          <View style={styles.marginCard}>
            <Ionicons name="trending-up" size={16} color={COLORS.success} />
            <Text style={styles.marginText}>
              粗利 <Text style={styles.marginValue}>¥{grossProfit.toLocaleString()}</Text>（{margin}%）
            </Text>
          </View>
        )}

        {/* 購入ルート（スタッフ手動選択） */}
        <Text style={styles.sectionHeader}>購入ルート</Text>
        <Text style={styles.helpText}>
          B Happy（オンライン）と店頭販売は自由に組み合わせて有効化できます（少なくとも1つは必要）
        </Text>

        {/* 店頭販売 */}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>店頭で購入</Text>
            <Text style={styles.toggleSub}>来店時にスタッフから購入可能</Text>
          </View>
          <Switch
            value={availableInStore}
            onValueChange={setAvailableInStore}
            trackColor={{ true: COLORS.accent, false: COLORS.border }}
            thumbColor="#FFF"
          />
        </View>

        {/* B Happy URL */}
        <Text style={styles.label}>B Happy 商品URL（オンライン購入用）</Text>
        <TextInput
          style={[styles.input, { fontSize: 11 }]}
          placeholder="https://www.bhappy-platform.jp/shop/..."
          placeholderTextColor={COLORS.textLight}
          value={bhappyUrl}
          onChangeText={setBhappyUrl}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />
        <Text style={styles.helpText}>
          顧客アプリから外部ブラウザでB Happyを開いて購入します（入力時のみ表示）
        </Text>

        {/* 在庫（店頭販売ON時のみ表示） */}
        {availableInStore && (
          <>
            <Text style={styles.sectionHeader}>在庫（店頭販売時）</Text>
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>在庫数</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={stockText}
                  onChangeText={(v) => setStockText(v.replace(/[^0-9]/g, ''))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>少量在庫の閾値</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={thresholdText}
                  onChangeText={(v) => setThresholdText(v.replace(/[^0-9]/g, ''))}
                />
              </View>
            </View>
          </>
        )}

        {/* 画像 */}
        <Text style={styles.sectionHeader}>画像</Text>
        {existingImages.length > 0 && (
          <View style={styles.imageList}>
            {existingImages.map((img) => (
              <View key={img.id} style={styles.imageRow}>
                <Text style={styles.imageUrl} numberOfLines={1}>{img.image_url}</Text>
                <TouchableOpacity onPress={() => handleRemoveImage(img.id)}>
                  <Ionicons name="close-circle" size={18} color={COLORS.error} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.label}>画像URL追加</Text>
        <TextInput
          style={[styles.input, { fontSize: 11 }]}
          placeholder="https://..."
          placeholderTextColor={COLORS.textLight}
          value={imageUrl}
          onChangeText={setImageUrl}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={styles.helpText}>保存時に商品画像として登録されます（複数追加する場合は保存後に再度開いて追加）</Text>

        {/* 公開 */}
        <View style={styles.toggleRow}>
          <View>
            <Text style={styles.toggleLabel}>公開</Text>
            <Text style={styles.toggleSub}>アプリで顧客に表示します</Text>
          </View>
          <Switch
            value={isActive}
            onValueChange={setIsActive}
            trackColor={{ true: COLORS.success, false: COLORS.border }}
            thumbColor="#FFF"
          />
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Ionicons name="save" size={16} color="#FFF" />
              <Text style={styles.saveBtnText}>{isEdit ? '更新' : '登録'}</Text>
            </>
          )}
        </TouchableOpacity>
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textSecondary, marginTop: 12, marginBottom: 6 },
  sectionHeader: {
    fontSize: 11, fontWeight: '700', color: COLORS.accent,
    marginTop: 24, marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase',
  },
  input: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 13, color: COLORS.text,
  },
  textarea: { minHeight: 100 },
  helpText: { fontSize: 10, color: COLORS.textLight, marginTop: 4, lineHeight: 14 },
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  twoCol: { flexDirection: 'row', gap: 10 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
  },
  chipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  chipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  chipTextActive: { color: '#FFF' },
  autoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.accent + '15',
    paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8,
    alignSelf: 'flex-start',
  },
  autoBtnText: { fontSize: 11, fontWeight: '600', color: COLORS.accent },
  marginCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.success + '12', padding: 12, borderRadius: 10, marginTop: 10,
  },
  marginText: { fontSize: 12, color: COLORS.textSecondary },
  marginValue: { fontWeight: '700', color: COLORS.success },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, padding: 14, borderRadius: 10, marginTop: 14, gap: 12,
  },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  toggleSub: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  routeInfoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, borderRadius: 10, marginTop: 4,
  },
  routeInfoTitle: { fontSize: 13, fontWeight: '700' },
  routeInfoDesc: { fontSize: 11, color: COLORS.textSecondary, marginTop: 2, lineHeight: 15 },
  imageList: { marginBottom: 8 },
  imageRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, padding: 10, borderRadius: 8, marginBottom: 4,
  },
  imageUrl: { flex: 1, fontSize: 11, color: COLORS.textSecondary },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: 12,
    marginTop: 28,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
