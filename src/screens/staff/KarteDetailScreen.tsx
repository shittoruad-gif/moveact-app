import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TREATMENT_TYPES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { KartePhotoManager } from '../../components/KartePhotoManager';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { StaffStackParamList } from '../../types/navigation';
import type { Karte, Profile } from '../../types/database';

type Props = NativeStackScreenProps<StaffStackParamList, 'KarteDetail'>;

export function KarteDetailScreen({ route, navigation }: Props) {
  const { karteId } = route.params;
  const profile = useAuthStore((s) => s.profile);
  const [karte, setKarte] = useState<Karte | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { fetchKarte(); }, []);

  async function fetchKarte() {
    setRefreshing(true);
    const { data, error } = await supabase
      .from('kartes')
      .select('*, staff:profiles!kartes_staff_id_fkey(*), customer:profiles!kartes_customer_id_fkey(*)')
      .eq('id', karteId)
      .single();

    if (error) {
      console.error(error);
      Alert.alert('エラー', 'カルテの取得に失敗しました');
      setRefreshing(false);
      return;
    }
    setKarte(data as Karte);
    setRefreshing(false);
  }

  function handleEdit() {
    if (!karte) return;
    navigation.navigate('KarteForm', {
      customerId: karte.customer_id,
      karteId: karte.id,
      bookingId: karte.booking_id ?? undefined,
    });
  }

  async function handleDelete() {
    if (profile?.role !== 'admin') {
      Alert.alert('権限エラー', 'カルテの削除は管理者のみ可能です');
      return;
    }

    Alert.alert('カルテを削除', 'このカルテを完全に削除しますか？この操作は元に戻せません。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('kartes').delete().eq('id', karteId);
          if (error) {
            Alert.alert('エラー', 'カルテの削除に失敗しました');
            return;
          }
          navigation.goBack();
        },
      },
    ]);
  }

  if (!karte) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>読み込み中...</Text>
      </View>
    );
  }

  const treatmentLabel = karte.treatment_type
    ? TREATMENT_TYPES[karte.treatment_type] ?? karte.treatment_type
    : null;

  const formattedDate = new Date(karte.treatment_date + 'T00:00:00').toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchKarte} tintColor={COLORS.accent} />}
    >
      {/* Customer header */}
      {karte.customer && (
        <TouchableOpacity
          style={styles.customerHeader}
          onPress={() => navigation.navigate('CustomerDetail', { userId: karte.customer_id })}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{karte.customer.full_name?.charAt(0) ?? '?'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.customerName}>{karte.customer.full_name}</Text>
            {karte.customer.full_name_kana && (
              <Text style={styles.customerKana}>{karte.customer.full_name_kana}</Text>
            )}
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
        </TouchableOpacity>
      )}

      {/* Meta info */}
      <View style={styles.metaCard}>
        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={16} color={COLORS.textSecondary} />
          <Text style={styles.metaLabel}>施術日</Text>
          <Text style={styles.metaValue}>{formattedDate}</Text>
        </View>
        {treatmentLabel && (
          <View style={styles.metaRow}>
            <Ionicons name="medical-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.metaLabel}>施術種類</Text>
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{treatmentLabel}</Text>
            </View>
          </View>
        )}
        {karte.staff && (
          <View style={[styles.metaRow, { borderBottomWidth: 0 }]}>
            <Ionicons name="person-outline" size={16} color={COLORS.textSecondary} />
            <Text style={styles.metaLabel}>担当</Text>
            <Text style={styles.metaValue}>{karte.staff.full_name}</Text>
          </View>
        )}
      </View>

      {/* SOAP 形式の表示 */}
      {/* S: 主観的情報 */}
      {karte.chief_complaint && (
        <>
          <SoapGroupHeader letter="S" title="主観的情報" />
          <ContentSection icon="chatbubble-ellipses-outline" title="主訴・お悩み" content={karte.chief_complaint} />
        </>
      )}
      {/* O: 客観的情報 */}
      {(karte.body_condition || karte.findings) && (
        <SoapGroupHeader letter="O" title="客観的情報" />
      )}
      {karte.body_condition && (
        <ContentSection icon="body-outline" title="体の状態" content={karte.body_condition} />
      )}
      {karte.findings && (
        <ContentSection icon="eye-outline" title="検査・所見" content={karte.findings} />
      )}
      {/* A: 評価 */}
      {karte.assessment && (
        <>
          <SoapGroupHeader letter="A" title="評価・見立て" />
          <ContentSection icon="analytics-outline" title="評価・見立て" content={karte.assessment} />
        </>
      )}
      {/* P: 計画 */}
      {(karte.treatment_content || karte.treatment_plan || karte.home_care_advice) && (
        <SoapGroupHeader letter="P" title="計画・施術" />
      )}
      {karte.treatment_content && (
        <ContentSection icon="fitness-outline" title="施術内容" content={karte.treatment_content} />
      )}
      {karte.treatment_plan && (
        <ContentSection icon="trending-up-outline" title="今後の方針" content={karte.treatment_plan} />
      )}
      {karte.home_care_advice && (
        <ContentSection icon="home-outline" title="ホームケアアドバイス" content={karte.home_care_advice} />
      )}
      {karte.next_appointment_note && (
        <ContentSection icon="time-outline" title="次回予約メモ" content={karte.next_appointment_note} />
      )}
      {karte.internal_memo && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="lock-closed-outline" size={14} color={COLORS.warning} />
            <Text style={[styles.sectionTitle, { color: COLORS.warning }]}>スタッフ内部メモ</Text>
          </View>
          <View style={[styles.contentCard, { borderColor: COLORS.warning + '40', borderWidth: 1 }]}>
            <Text style={styles.contentText}>{karte.internal_memo}</Text>
          </View>
        </View>
      )}

      {/* 施術前後の写真 */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="camera-outline" size={14} color={COLORS.accent} />
          <Text style={styles.sectionTitle}>施術前後の写真</Text>
        </View>
        <KartePhotoManager
          karteId={karte.id}
          uploadedBy={profile?.id}
          canEdit={profile?.role === 'staff' || profile?.role === 'admin'}
        />
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.editBtn} onPress={handleEdit}>
          <Ionicons name="create-outline" size={18} color="#FFF" />
          <Text style={styles.editBtnText}>編集</Text>
        </TouchableOpacity>
        {profile?.role === 'admin' && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={18} color={COLORS.error} />
          </TouchableOpacity>
        )}
      </View>

      {/* Timestamps */}
      <View style={styles.timestamps}>
        <Text style={styles.timestampText}>
          作成: {new Date(karte.created_at).toLocaleString('ja-JP')}
        </Text>
        <Text style={styles.timestampText}>
          更新: {new Date(karte.updated_at).toLocaleString('ja-JP')}
        </Text>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function ContentSection({ icon, title, content }: { icon: string; title: string; content: string }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon as any} size={14} color={COLORS.textSecondary} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.contentCard}>
        <Text style={styles.contentText}>{content}</Text>
      </View>
    </View>
  );
}

// SOAP グループ見出し（S/O/A/P バッジ）
function SoapGroupHeader({ letter, title }: { letter: string; title: string }) {
  return (
    <View style={styles.soapGroupHeader}>
      <View style={styles.soapGroupBadge}>
        <Text style={styles.soapGroupBadgeText}>{letter}</Text>
      </View>
      <Text style={styles.soapGroupTitle}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: COLORS.textSecondary },
  customerHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.surface, padding: 16,
    borderBottomWidth: 1, borderBottomColor: COLORS.borderLight,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.accentLight,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '600', color: COLORS.accent },
  customerName: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  customerKana: { fontSize: 11, color: COLORS.textLight, marginTop: 1 },
  metaCard: {
    backgroundColor: COLORS.surface, margin: 20, borderRadius: 14, overflow: 'hidden',
  },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 0.5, borderBottomColor: COLORS.borderLight,
  },
  metaLabel: { fontSize: 13, color: COLORS.textSecondary, minWidth: 60 },
  metaValue: { fontSize: 14, fontWeight: '500', color: COLORS.text, flex: 1, textAlign: 'right' },
  typeBadge: {
    backgroundColor: COLORS.accent, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12,
    marginLeft: 'auto',
  },
  typeBadgeText: { fontSize: 12, fontWeight: '600', color: '#FFF' },
  section: { paddingHorizontal: 20, marginBottom: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary },
  soapGroupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 20, marginTop: 20, marginBottom: 2,
  },
  soapGroupBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center',
  },
  soapGroupBadgeText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  soapGroupTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  contentCard: {
    backgroundColor: COLORS.surface, borderRadius: 12, padding: 14,
  },
  contentText: { fontSize: 14, color: COLORS.text, lineHeight: 22 },
  actions: {
    flexDirection: 'row', paddingHorizontal: 20, marginTop: 8, gap: 10,
  },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.accent, paddingVertical: 14, borderRadius: 14,
  },
  editBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  deleteBtn: {
    width: 48, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.error + '15', borderRadius: 14,
  },
  timestamps: {
    paddingHorizontal: 20, paddingTop: 16, gap: 4,
  },
  timestampText: { fontSize: 11, color: COLORS.textLight },
});
