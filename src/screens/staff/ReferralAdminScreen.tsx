// 紹介管理画面
// 顧客からの紹介を一覧し、ステータスを管理（紹介者にサンクス、報酬付与など）
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

type StatusFilter = 'all' | 'sent' | 'registered' | 'completed';

const STATUS_LABELS = {
  sent: { label: '紹介送付', color: COLORS.textSecondary, icon: 'paper-plane-outline' },
  registered: { label: '登録済み', color: COLORS.accent, icon: 'person-add' },
  completed: { label: '来店達成', color: COLORS.success, icon: 'checkmark-circle' },
};

export function ReferralAdminScreen() {
  const navigation = useNavigation<any>();
  const [referrals, setReferrals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('referrals')
      .select('*, referrer:profiles!referrals_referrer_user_id_fkey(id, full_name, line_user_id)')
      .order('created_at', { ascending: false })
      .limit(200);
    setReferrals(data ?? []);
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const filtered = useMemo(() => {
    if (filter === 'all') return referrals;
    return referrals.filter((r) => r.status === filter);
  }, [referrals, filter]);

  const counts = useMemo(() => {
    return {
      sent: referrals.filter((r) => r.status === 'sent').length,
      registered: referrals.filter((r) => r.status === 'registered').length,
      completed: referrals.filter((r) => r.status === 'completed').length,
    };
  }, [referrals]);

  async function updateStatus(id: string, status: string) {
    await supabase.from('referrals').update({ status }).eq('id', id);
    fetchData();
  }

  async function sendThanks(referral: any) {
    const referrerId = referral.referrer?.id;
    if (!referrerId) return;
    if (!referral.referrer?.line_user_id) {
      Alert.alert('LINE未連携', '紹介者はLINE連携していません');
      return;
    }
    navigation.navigate('LineMessageCompose', { customerId: referrerId });
  }

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {([
          { id: 'all', label: `全件 (${referrals.length})` },
          { id: 'sent', label: `送付 (${counts.sent})` },
          { id: 'registered', label: `登録 (${counts.registered})` },
          { id: 'completed', label: `達成 (${counts.completed})` },
        ] as { id: StatusFilter; label: string }[]).map((f) => (
          <TouchableOpacity
            key={f.id}
            style={[styles.filterChip, filter === f.id && styles.filterChipActive]}
            onPress={() => setFilter(f.id)}
          >
            <Text style={[styles.filterText, filter === f.id && styles.filterTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchData} tintColor={COLORS.accent} />}
        contentContainerStyle={{ padding: 16 }}
      >
        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={40} color={COLORS.textLight} />
            <Text style={styles.emptyText}>該当する紹介はありません</Text>
          </View>
        ) : (
          filtered.map((r) => {
            const statusDef = STATUS_LABELS[r.status as keyof typeof STATUS_LABELS] ?? STATUS_LABELS.sent;
            return (
              <View key={r.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.statusBadge, { backgroundColor: statusDef.color + '20' }]}>
                    <Ionicons name={statusDef.icon as any} size={10} color={statusDef.color} />
                    <Text style={[styles.statusText, { color: statusDef.color }]}>
                      {statusDef.label}
                    </Text>
                  </View>
                  <Text style={styles.date}>
                    {new Date(r.created_at).toLocaleDateString('ja-JP')}
                  </Text>
                </View>
                <View style={styles.refRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>紹介者</Text>
                    <TouchableOpacity onPress={() => r.referrer?.id && navigation.navigate('CustomerDetail', { userId: r.referrer.id })}>
                      <Text style={styles.referrerName}>
                        {r.referrer?.full_name ?? '---'}
                        {r.referrer?.line_user_id && (
                          <Text style={{ fontSize: 10, color: '#06C755' }}>  LINE</Text>
                        )}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <Ionicons name="arrow-forward" size={14} color={COLORS.textLight} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.label}>紹介先</Text>
                    <Text style={styles.referredName}>{r.referred_name ?? '---'}</Text>
                    {r.referred_phone && (
                      <Text style={styles.referredPhone}>{r.referred_phone}</Text>
                    )}
                  </View>
                </View>
                <Text style={styles.codeText}>コード: {r.referral_code}</Text>

                <View style={styles.actionRow}>
                  {r.status === 'sent' && (
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => updateStatus(r.id, 'registered')}
                    >
                      <Text style={styles.actionText}>登録済にする</Text>
                    </TouchableOpacity>
                  )}
                  {r.status === 'registered' && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: COLORS.success + '15' }]}
                      onPress={() => updateStatus(r.id, 'completed')}
                    >
                      <Text style={[styles.actionText, { color: COLORS.success }]}>来店達成</Text>
                    </TouchableOpacity>
                  )}
                  {r.referrer?.line_user_id && (
                    <TouchableOpacity
                      style={[styles.actionBtn, { backgroundColor: '#06C75515' }]}
                      onPress={() => sendThanks(r)}
                    >
                      <Ionicons name="chatbubble" size={12} color="#06C755" />
                      <Text style={[styles.actionText, { color: '#06C755' }]}>お礼LINE</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  filterRow: {
    flexDirection: 'row', gap: 4, padding: 12, flexWrap: 'wrap',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  filterChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
    backgroundColor: COLORS.backgroundSoft, borderWidth: 1, borderColor: COLORS.border,
  },
  filterChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterText: { fontSize: 11, fontWeight: '600', color: COLORS.textSecondary },
  filterTextActive: { color: '#FFF' },
  card: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, marginBottom: 8,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  statusBadge: {
    flexDirection: 'row', gap: 4, alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
  },
  statusText: { fontSize: 10, fontWeight: '700' },
  date: { fontSize: 10, color: COLORS.textLight },
  refRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontSize: 9, color: COLORS.textLight, marginBottom: 2 },
  referrerName: { fontSize: 14, fontWeight: '600', color: COLORS.accent },
  referredName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  referredPhone: { fontSize: 11, color: COLORS.textSecondary, marginTop: 1 },
  codeText: { fontSize: 10, color: COLORS.textLight, marginTop: 8, textAlign: 'right' },
  actionRow: { flexDirection: 'row', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: COLORS.borderLight },
  actionBtn: {
    flexDirection: 'row', gap: 4, alignItems: 'center',
    backgroundColor: COLORS.accent + '15',
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
  },
  actionText: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  emptyCard: { alignItems: 'center', padding: 40, gap: 10 },
  emptyText: { fontSize: 13, color: COLORS.textLight },
});
