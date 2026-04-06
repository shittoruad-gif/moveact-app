import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput, StyleSheet,
  RefreshControl, Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

interface CouponWithUser {
  id: string;
  user_id: string;
  code: string;
  type: string;
  title: string;
  description: string | null;
  discount_amount: number | null;
  discount_percent: number | null;
  applicable_to: 'treatment' | 'shop' | 'all';
  valid_from: string;
  valid_until: string;
  is_used: boolean;
  used_at: string | null;
  created_at: string;
  profile?: { full_name: string; phone: string | null };
}

interface CustomerOption {
  id: string;
  full_name: string;
  phone: string | null;
}

const TYPE_OPTIONS: { key: string; label: string; icon: string; color: string }[] = [
  { key: 'campaign', label: 'キャンペーン', icon: 'megaphone-outline', color: COLORS.accent },
  { key: 'birthday', label: 'お誕生日', icon: 'gift-outline', color: COLORS.accentPink },
  { key: 'referral', label: '紹介', icon: 'people-outline', color: COLORS.success },
];

export function CouponManagementScreen() {
  const [coupons, setCoupons] = useState<CouponWithUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState<'active' | 'used' | 'all'>('active');

  // Create form state
  const [couponType, setCouponType] = useState('campaign');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [discountValue, setDiscountValue] = useState('');
  const [validDays, setValidDays] = useState('30');
  const [applicableTo, setApplicableTo] = useState<'all' | 'treatment' | 'shop'>('all');
  const [targetMode, setTargetMode] = useState<'all' | 'individual'>('all');
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomers, setSelectedCustomers] = useState<string[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => { fetchCoupons(); }, [filter]);

  async function fetchCoupons() {
    setLoading(true);
    let query = supabase
      .from('coupons')
      .select('*, profile:profiles!user_id(full_name, phone)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (filter === 'active') {
      query = query.eq('is_used', false).gte('valid_until', new Date().toISOString());
    } else if (filter === 'used') {
      query = query.eq('is_used', true);
    }

    const { data } = await query;
    setCoupons((data as CouponWithUser[]) ?? []);
    setLoading(false);
  }

  async function fetchCustomers() {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, phone')
      .eq('role', 'customer')
      .order('full_name');
    setCustomers((data as CustomerOption[]) ?? []);
  }

  function openCreateForm() {
    setShowCreate(true);
    fetchCustomers();
    resetForm();
  }

  function resetForm() {
    setCouponType('campaign');
    setTitle('');
    setDescription('');
    setDiscountType('amount');
    setDiscountValue('');
    setValidDays('30');
    setApplicableTo('all');
    setTargetMode('all');
    setSelectedCustomers([]);
    setCustomerSearch('');
  }

  function generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'MV-';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  }

  async function handleCreate() {
    if (!title.trim()) { Alert.alert('入力エラー', 'タイトルを入力してください'); return; }
    if (!discountValue.trim()) { Alert.alert('入力エラー', '割引額を入力してください'); return; }

    const targets = targetMode === 'all' ? customers.map((c) => c.id) : selectedCustomers;
    if (targets.length === 0) { Alert.alert('入力エラー', '配信対象を選択してください'); return; }

    setIsSubmitting(true);

    const now = new Date();
    const validFrom = now.toISOString();
    const validUntil = new Date(now.getTime() + parseInt(validDays) * 86400000).toISOString();

    const couponsToInsert = targets.map((userId) => ({
      user_id: userId,
      code: generateCode(),
      type: couponType,
      title: title.trim(),
      description: description.trim() || null,
      discount_amount: discountType === 'amount' ? parseInt(discountValue) : null,
      discount_percent: discountType === 'percent' ? parseInt(discountValue) : null,
      applicable_to: applicableTo,
      valid_from: validFrom,
      valid_until: validUntil,
      is_used: false,
    }));

    const { error } = await supabase.from('coupons').insert(couponsToInsert);
    setIsSubmitting(false);

    if (error) {
      Alert.alert('エラー', 'クーポンの発行に失敗しました');
      return;
    }

    Alert.alert('完了', `${targets.length}名にクーポンを配信しました`);
    setShowCreate(false);
    fetchCoupons();
  }

  async function deleteCoupon(id: string) {
    Alert.alert('削除確認', 'このクーポンを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          await supabase.from('coupons').delete().eq('id', id);
          fetchCoupons();
        },
      },
    ]);
  }

  const filteredCustomers = customerSearch.trim()
    ? customers.filter((c) => {
        const q = customerSearch.trim().toLowerCase();
        return c.full_name?.toLowerCase().includes(q) || c.phone?.includes(q);
      })
    : customers;

  function toggleCustomer(id: string) {
    setSelectedCustomers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function renderCoupon({ item }: { item: CouponWithUser }) {
    const typeInfo = TYPE_OPTIONS.find((t) => t.key === item.type) ?? TYPE_OPTIONS[0];
    const isExpired = new Date(item.valid_until) < new Date();
    const isActive = !item.is_used && !isExpired;

    return (
      <View style={[styles.couponCard, !isActive && styles.couponInactive]}>
        <View style={[styles.couponAccent, { backgroundColor: isActive ? typeInfo.color : COLORS.textLight }]} />
        <View style={styles.couponContent}>
          <View style={styles.couponHeader}>
            <Ionicons name={typeInfo.icon as any} size={14} color={isActive ? typeInfo.color : COLORS.textLight} />
            <Text style={[styles.couponType, { color: isActive ? typeInfo.color : COLORS.textLight }]}>
              {typeInfo.label}
            </Text>
            {item.is_used && <View style={styles.badge}><Text style={styles.badgeText}>使用済</Text></View>}
            {isExpired && !item.is_used && <View style={[styles.badge, styles.expiredBadge]}><Text style={styles.expiredBadgeText}>期限切れ</Text></View>}
          </View>
          <Text style={[styles.couponTitle, !isActive && { color: COLORS.textLight }]}>{item.title}</Text>
          <View style={styles.couponMeta}>
            <Text style={styles.couponCustomer}>{item.profile?.full_name ?? '---'}</Text>
            <Text style={styles.couponDiscount}>
              {item.discount_amount ? `¥${item.discount_amount.toLocaleString()} OFF` : ''}
              {item.discount_percent ? `${item.discount_percent}% OFF` : ''}
            </Text>
          </View>
          <View style={styles.couponFooterRow}>
            {item.applicable_to && (
              <View style={styles.scopeBadge}>
                <Text style={styles.scopeBadgeText}>
                  {item.applicable_to === 'all' ? '施術・商品' : item.applicable_to === 'treatment' ? '施術のみ' : '商品のみ'}
                </Text>
              </View>
            )}
            <Text style={styles.couponExpiry}>
              {new Date(item.valid_from).toLocaleDateString('ja-JP')} ~ {new Date(item.valid_until).toLocaleDateString('ja-JP')}
            </Text>
          </View>
        </View>
        {isActive && (
          <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteCoupon(item.id)}>
            <Ionicons name="trash-outline" size={16} color={COLORS.error} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (showCreate) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.createForm} contentContainerStyle={{ paddingBottom: 40 }}>
          <Text style={styles.formTitle}>クーポン発行</Text>

          {/* Type */}
          <Text style={styles.formLabel}>種類</Text>
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.typeChip, couponType === t.key && { backgroundColor: t.color }]}
                onPress={() => setCouponType(t.key)}
              >
                <Ionicons name={t.icon as any} size={14} color={couponType === t.key ? '#FFF' : t.color} />
                <Text style={[styles.typeChipText, couponType === t.key && { color: '#FFF' }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <Text style={styles.formLabel}>タイトル</Text>
          <TextInput
            style={styles.input}
            placeholder="例: 春のキャンペーン 500円OFF"
            placeholderTextColor={COLORS.textLight}
            value={title}
            onChangeText={setTitle}
          />

          {/* Description */}
          <Text style={styles.formLabel}>説明（任意）</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            placeholder="クーポンの説明文"
            placeholderTextColor={COLORS.textLight}
            value={description}
            onChangeText={setDescription}
            multiline
          />

          {/* Discount */}
          <Text style={styles.formLabel}>割引</Text>
          <View style={styles.discountRow}>
            <TouchableOpacity
              style={[styles.discountTypeBtn, discountType === 'amount' && styles.discountTypeBtnActive]}
              onPress={() => setDiscountType('amount')}
            >
              <Text style={[styles.discountTypeBtnText, discountType === 'amount' && styles.discountTypeBtnTextActive]}>金額</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.discountTypeBtn, discountType === 'percent' && styles.discountTypeBtnActive]}
              onPress={() => setDiscountType('percent')}
            >
              <Text style={[styles.discountTypeBtnText, discountType === 'percent' && styles.discountTypeBtnTextActive]}>%</Text>
            </TouchableOpacity>
            <TextInput
              style={[styles.input, styles.discountInput]}
              placeholder={discountType === 'amount' ? '500' : '10'}
              placeholderTextColor={COLORS.textLight}
              value={discountValue}
              onChangeText={setDiscountValue}
              keyboardType="number-pad"
            />
            <Text style={styles.discountUnit}>{discountType === 'amount' ? '円OFF' : '% OFF'}</Text>
          </View>

          {/* Valid days */}
          <Text style={styles.formLabel}>有効期間</Text>
          <View style={styles.validDaysRow}>
            {['7', '14', '30', '60', '90'].map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.validDayChip, validDays === d && styles.validDayChipActive]}
                onPress={() => setValidDays(d)}
              >
                <Text style={[styles.validDayText, validDays === d && styles.validDayTextActive]}>{d}日</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Applicable to */}
          <Text style={styles.formLabel}>利用範囲</Text>
          <View style={styles.targetRow}>
            {([
              { key: 'all', label: '施術・商品' },
              { key: 'treatment', label: '施術のみ' },
              { key: 'shop', label: '商品のみ' },
            ] as const).map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.targetBtn, applicableTo === opt.key && styles.targetBtnActive]}
                onPress={() => setApplicableTo(opt.key)}
              >
                <Text style={[styles.targetBtnText, applicableTo === opt.key && styles.targetBtnTextActive]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Target */}
          <Text style={styles.formLabel}>配信対象</Text>
          <View style={styles.targetRow}>
            <TouchableOpacity
              style={[styles.targetBtn, targetMode === 'all' && styles.targetBtnActive]}
              onPress={() => setTargetMode('all')}
            >
              <Text style={[styles.targetBtnText, targetMode === 'all' && styles.targetBtnTextActive]}>全顧客 ({customers.length}名)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.targetBtn, targetMode === 'individual' && styles.targetBtnActive]}
              onPress={() => setTargetMode('individual')}
            >
              <Text style={[styles.targetBtnText, targetMode === 'individual' && styles.targetBtnTextActive]}>個別選択</Text>
            </TouchableOpacity>
          </View>

          {targetMode === 'individual' && (
            <View style={styles.customerPicker}>
              <TextInput
                style={styles.customerSearchInput}
                placeholder="名前・電話番号で検索"
                placeholderTextColor={COLORS.textLight}
                value={customerSearch}
                onChangeText={setCustomerSearch}
              />
              <Text style={styles.selectedCount}>{selectedCustomers.length}名選択中</Text>
              <ScrollView style={styles.customerList} nestedScrollEnabled>
                {filteredCustomers.map((c) => {
                  const isSelected = selectedCustomers.includes(c.id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.customerItem, isSelected && styles.customerItemSelected]}
                      onPress={() => toggleCustomer(c.id)}
                    >
                      <Ionicons
                        name={isSelected ? 'checkbox' : 'square-outline'}
                        size={20}
                        color={isSelected ? COLORS.accent : COLORS.textLight}
                      />
                      <Text style={styles.customerItemName}>{c.full_name}</Text>
                      {c.phone && <Text style={styles.customerItemPhone}>{c.phone}</Text>}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Actions */}
          <View style={styles.formActions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreate(false)}>
              <Text style={styles.cancelBtnText}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.submitBtn, isSubmitting && { opacity: 0.5 }]}
              onPress={handleCreate}
              disabled={isSubmitting}
            >
              <Text style={styles.submitBtnText}>{isSubmitting ? '処理中...' : 'クーポンを発行'}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filter tabs */}
      <View style={styles.headerRow}>
        <View style={styles.filterRow}>
          {(['active', 'used', 'all'] as const).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterTab, filter === f && styles.filterTabActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                {f === 'active' ? '有効' : f === 'used' ? '使用済' : 'すべて'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.createBtn} onPress={openCreateForm}>
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.createBtnText}>発行</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={coupons}
        keyExtractor={(item) => item.id}
        renderItem={renderCoupon}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchCoupons} tintColor={COLORS.accent} />}
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <Ionicons name="ticket-outline" size={40} color={COLORS.borderLight} />
            <Text style={styles.emptyText}>クーポンはありません</Text>
          </View>
        ) : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 18, backgroundColor: COLORS.backgroundSoft },
  filterTabActive: { backgroundColor: COLORS.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  filterTextActive: { color: '#FFF' },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.accent, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
  },
  createBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },
  list: { paddingHorizontal: 16, paddingBottom: 32 },

  // Coupon card
  couponCard: {
    backgroundColor: COLORS.surface, borderRadius: 14,
    flexDirection: 'row', overflow: 'hidden', marginBottom: 10,
  },
  couponInactive: { opacity: 0.6 },
  couponAccent: { width: 5 },
  couponContent: { flex: 1, padding: 14, gap: 4 },
  couponHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  couponType: { fontSize: 10, fontWeight: '600' },
  badge: { backgroundColor: COLORS.textLight + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 9, fontWeight: '600', color: COLORS.textLight },
  expiredBadge: { backgroundColor: COLORS.error + '20' },
  expiredBadgeText: { fontSize: 9, fontWeight: '600', color: COLORS.error },
  couponTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  couponMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  couponCustomer: { fontSize: 12, color: COLORS.textSecondary },
  couponDiscount: { fontSize: 14, fontWeight: '700', color: COLORS.accent },
  couponFooterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scopeBadge: { backgroundColor: COLORS.accent + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  scopeBadgeText: { fontSize: 9, fontWeight: '600', color: COLORS.accent },
  couponExpiry: { fontSize: 10, color: COLORS.textLight },
  deleteBtn: { justifyContent: 'center', paddingHorizontal: 14 },

  // Empty
  empty: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, color: COLORS.textLight },

  // Create form
  createForm: { flex: 1, padding: 20 },
  formTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 20 },
  formLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginTop: 16, marginBottom: 8 },
  input: {
    backgroundColor: COLORS.surface, borderRadius: 10, borderWidth: 1, borderColor: COLORS.borderLight,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.text,
  },
  inputMultiline: { minHeight: 70, textAlignVertical: 'top' },

  typeRow: { flexDirection: 'row', gap: 8 },
  typeChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.backgroundSoft,
  },
  typeChipText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },

  discountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  discountTypeBtn: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.backgroundSoft,
  },
  discountTypeBtnActive: { backgroundColor: COLORS.accent },
  discountTypeBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  discountTypeBtnTextActive: { color: '#FFF' },
  discountInput: { flex: 1 },
  discountUnit: { fontSize: 13, color: COLORS.textSecondary, fontWeight: '500' },

  validDaysRow: { flexDirection: 'row', gap: 8 },
  validDayChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: COLORS.backgroundSoft },
  validDayChipActive: { backgroundColor: COLORS.accent },
  validDayText: { fontSize: 12, fontWeight: '600', color: COLORS.textSecondary },
  validDayTextActive: { color: '#FFF' },

  targetRow: { flexDirection: 'row', gap: 8 },
  targetBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.backgroundSoft, alignItems: 'center' },
  targetBtnActive: { backgroundColor: COLORS.accent },
  targetBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  targetBtnTextActive: { color: '#FFF' },

  customerPicker: { marginTop: 10 },
  customerSearchInput: {
    backgroundColor: COLORS.surface, borderRadius: 10, borderWidth: 1, borderColor: COLORS.borderLight,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: COLORS.text, marginBottom: 8,
  },
  selectedCount: { fontSize: 11, color: COLORS.accent, fontWeight: '600', marginBottom: 6 },
  customerList: { maxHeight: 200 },
  customerItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.borderLight,
  },
  customerItemSelected: { backgroundColor: COLORS.accentLight + '30' },
  customerItemName: { fontSize: 14, fontWeight: '500', color: COLORS.text, flex: 1 },
  customerItemPhone: { fontSize: 12, color: COLORS.textLight },

  formActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: COLORS.backgroundSoft,
  },
  cancelBtnText: { fontSize: 15, fontWeight: '600', color: COLORS.textSecondary },
  submitBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    backgroundColor: COLORS.accent,
  },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
