import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, TREATMENT_TYPES } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/authStore';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import { KartePhotoManager } from '../../components/KartePhotoManager';
import { AiSoapModal, GeneratedSoap } from '../../components/AiSoapModal';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { StaffStackParamList } from '../../types/navigation';
import type { Karte, Profile, TreatmentType } from '../../types/database';

type Props = NativeStackScreenProps<StaffStackParamList, 'KarteForm'>;

const TREATMENT_TYPE_OPTIONS: { value: TreatmentType; label: string }[] = [
  { value: 'seitai', label: '整体' },
  { value: 'biyou_hari', label: '美容鍼' },
  { value: 'pilates', label: 'ピラティス' },
  { value: 'reflexology', label: 'リフレクソロジー' },
];

// SOAP セクションの見出し（S/O/A/P のバッジ付き）
function SoapHeader({ letter, title, desc }: { letter: string; title: string; desc: string }) {
  return (
    <View style={styles.soapHeader}>
      <View style={styles.soapBadge}>
        <Text style={styles.soapBadgeText}>{letter}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.soapTitle}>{title}</Text>
        <Text style={styles.soapDesc}>{desc}</Text>
      </View>
    </View>
  );
}

export function KarteFormScreen({ route, navigation }: Props) {
  const { customerId, karteId, bookingId } = route.params;
  const profile = useAuthStore((s) => s.profile);
  const { selectedStore } = useStoreSelection();
  const isEdit = !!karteId;

  const [customer, setCustomer] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  // 写真機能のための karte_id 管理（編集モードは prop、新規モードは保存後に設定）
  const [currentKarteId, setCurrentKarteId] = useState<string | null>(karteId ?? null);
  // AI SOAP 生成モーダル
  const [aiModalVisible, setAiModalVisible] = useState(false);

  // AI生成結果を各SOAP欄に反映（既存内容がある欄は上書きせず追記）
  function applyGeneratedSoap(soap: GeneratedSoap) {
    const merge = (cur: string, next: string) => {
      if (!next) return cur;
      if (!cur.trim()) return next;
      return `${cur}\n${next}`;
    };
    setChiefComplaint((c) => merge(c, soap.subjective));
    setBodyCondition((c) => merge(c, soap.objective));
    setAssessment((c) => merge(c, soap.assessment));
    setTreatmentContent((c) => merge(c, soap.treatmentContent));
    setTreatmentPlan((c) => merge(c, soap.treatmentPlan));
    setHomeCareAdvice((c) => merge(c, soap.homeCareAdvice));
  }

  // Form state
  const [treatmentDate, setTreatmentDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [treatmentType, setTreatmentType] = useState<TreatmentType | null>(null);
  // S: 主観的情報
  const [chiefComplaint, setChiefComplaint] = useState('');
  // O: 客観的情報
  const [bodyCondition, setBodyCondition] = useState('');
  const [findings, setFindings] = useState('');
  // A: 評価
  const [assessment, setAssessment] = useState('');
  // P: 計画
  const [treatmentContent, setTreatmentContent] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [homeCareAdvice, setHomeCareAdvice] = useState('');
  // その他
  const [nextAppointmentNote, setNextAppointmentNote] = useState('');
  const [internalMemo, setInternalMemo] = useState('');

  useEffect(() => {
    fetchCustomer();
    if (isEdit) fetchKarte();
  }, []);

  async function fetchCustomer() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', customerId)
      .single();
    if (data) setCustomer(data as Profile);
  }

  async function fetchKarte() {
    const { data } = await supabase
      .from('kartes')
      .select('*')
      .eq('id', karteId!)
      .single();
    if (data) {
      const k = data as Karte;
      setTreatmentDate(k.treatment_date);
      setTreatmentType(k.treatment_type);
      setChiefComplaint(k.chief_complaint ?? '');
      setBodyCondition(k.body_condition ?? '');
      setFindings(k.findings ?? '');
      setAssessment(k.assessment ?? '');
      setTreatmentContent(k.treatment_content ?? '');
      setTreatmentPlan(k.treatment_plan ?? '');
      setHomeCareAdvice(k.home_care_advice ?? '');
      setNextAppointmentNote(k.next_appointment_note ?? '');
      setInternalMemo(k.internal_memo ?? '');
    }
  }

  async function handleSave() {
    if (!treatmentContent.trim()) {
      Alert.alert('入力エラー', '施術内容を入力してください');
      return;
    }

    setSaving(true);
    const payload = {
      customer_id: customerId,
      staff_id: profile!.id,
      booking_id: bookingId ?? null,
      store_id: selectedStore,
      treatment_date: treatmentDate,
      treatment_type: treatmentType,
      chief_complaint: chiefComplaint || null,
      body_condition: bodyCondition || null,
      findings: findings || null,
      assessment: assessment || null,
      treatment_content: treatmentContent || null,
      treatment_plan: treatmentPlan || null,
      home_care_advice: homeCareAdvice || null,
      next_appointment_note: nextAppointmentNote || null,
      internal_memo: internalMemo || null,
    };

    let error;
    let savedId: string | null = currentKarteId;
    if (isEdit) {
      ({ error } = await supabase.from('kartes').update(payload).eq('id', karteId!));
    } else {
      const insertRes = await supabase.from('kartes').insert(payload).select('id').single();
      error = insertRes.error;
      if (insertRes.data?.id) savedId = insertRes.data.id;
    }

    setSaving(false);

    if (error) {
      Alert.alert('エラー', 'カルテの保存に失敗しました');
      console.error(error);
      return;
    }

    // 写真追加可能な状態にするため karteId を保存（新規モードのみ）
    if (!isEdit && savedId) {
      setCurrentKarteId(savedId);
      Alert.alert(
        '保存完了',
        'カルテを保存しました。引き続き施術写真を追加できます。',
        [{ text: 'OK' }],
      );
      return;
    }

    Alert.alert('完了', isEdit ? 'カルテを更新しました' : 'カルテを保存しました', [
      { text: 'OK', onPress: () => navigation.goBack() },
    ]);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        {/* Customer header */}
        {customer && (
          <View style={styles.customerHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{customer.full_name?.charAt(0) ?? '?'}</Text>
            </View>
            <View>
              <Text style={styles.customerName}>{customer.full_name}</Text>
              {customer.full_name_kana && (
                <Text style={styles.customerKana}>{customer.full_name_kana}</Text>
              )}
            </View>
          </View>
        )}

        {/* Date */}
        <View style={styles.section}>
          <Text style={styles.label}>施術日</Text>
          <TextInput
            style={styles.input}
            value={treatmentDate}
            onChangeText={setTreatmentDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={COLORS.textLight}
          />
        </View>

        {/* Treatment type */}
        <View style={styles.section}>
          <Text style={styles.label}>施術種類</Text>
          <View style={styles.typeRow}>
            {TREATMENT_TYPE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.typeChip,
                  treatmentType === opt.value && styles.typeChipActive,
                ]}
                onPress={() => setTreatmentType(
                  treatmentType === opt.value ? null : opt.value
                )}
              >
                <Text
                  style={[
                    styles.typeChipText,
                    treatmentType === opt.value && styles.typeChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* SOAP 説明バナー */}
        <View style={styles.soapBanner}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.accent} />
          <Text style={styles.soapBannerText}>
            SOAP形式で記録します。S→O→A→P の順に入力すると、施術の流れが分かりやすく共有できます。
          </Text>
        </View>

        {/* AIでカルテ作成ボタン */}
        <TouchableOpacity style={styles.aiBtn} onPress={() => setAiModalVisible(true)}>
          <Ionicons name="sparkles" size={18} color="#FFF" />
          <Text style={styles.aiBtnText}>AIでSOAPを自動作成</Text>
        </TouchableOpacity>
        <Text style={styles.aiHint}>
          症状・施術内容を入力＆項目を選ぶだけで、下のSOAP欄に下書きが入ります（後から編集可）
        </Text>

        {/* === S: 主観的情報 === */}
        <SoapHeader letter="S" title="主観的情報" desc="患者様ご本人の訴え・お悩み" />
        <View style={styles.section}>
          <Text style={styles.label}>主訴・お悩み</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={chiefComplaint}
            onChangeText={setChiefComplaint}
            placeholder="例) 右肩が朝からこって痛い、デスクワークで腰がつらい など"
            placeholderTextColor={COLORS.textLight}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* === O: 客観的情報 === */}
        <SoapHeader letter="O" title="客観的情報" desc="施術者が観察した体の状態・所見" />
        <View style={styles.section}>
          <Text style={styles.label}>体の状態</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={bodyCondition}
            onChangeText={setBodyCondition}
            placeholder="姿勢、筋緊張、可動域、左右差、触診所見など"
            placeholderTextColor={COLORS.textLight}
            multiline
            textAlignVertical="top"
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>検査・所見</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={findings}
            onChangeText={setFindings}
            placeholder="可動域テスト、整形外科テスト、施術前後の変化など"
            placeholderTextColor={COLORS.textLight}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* === A: 評価 === */}
        <SoapHeader letter="A" title="評価・見立て" desc="原因の見立て・現状の評価" />
        <View style={styles.section}>
          <Text style={styles.label}>評価・見立て</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={assessment}
            onChangeText={setAssessment}
            placeholder="例) 長時間同一姿勢による僧帽筋の過緊張が原因と考えられる"
            placeholderTextColor={COLORS.textLight}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* === P: 計画 === */}
        <SoapHeader letter="P" title="計画・施術" desc="実施した施術と今後のプラン" />
        <View style={styles.section}>
          <Text style={styles.label}>
            施術内容 <Text style={styles.required}>*必須</Text>
          </Text>
          <TextInput
            style={[styles.input, styles.textAreaLarge]}
            value={treatmentContent}
            onChangeText={setTreatmentContent}
            placeholder="本日実施した施術の内容を記録"
            placeholderTextColor={COLORS.textLight}
            multiline
            textAlignVertical="top"
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>今後の方針</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={treatmentPlan}
            onChangeText={setTreatmentPlan}
            placeholder="今後の施術プラン、通院頻度、目標など"
            placeholderTextColor={COLORS.textLight}
            multiline
            textAlignVertical="top"
          />
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>ホームケアアドバイス</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={homeCareAdvice}
            onChangeText={setHomeCareAdvice}
            placeholder="自宅でのストレッチ、生活上の注意事項など"
            placeholderTextColor={COLORS.textLight}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* Next appointment */}
        <View style={styles.section}>
          <Text style={styles.label}>次回予約メモ</Text>
          <TextInput
            style={styles.input}
            value={nextAppointmentNote}
            onChangeText={setNextAppointmentNote}
            placeholder="次回の予約に関するメモ"
            placeholderTextColor={COLORS.textLight}
          />
        </View>

        {/* Internal memo */}
        <View style={styles.section}>
          <Text style={styles.label}>
            <Ionicons name="lock-closed-outline" size={12} color={COLORS.textSecondary} />
            {' '}スタッフ内部メモ
          </Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={internalMemo}
            onChangeText={setInternalMemo}
            placeholder="スタッフ間の共有メモ（顧客には表示されません）"
            placeholderTextColor={COLORS.textLight}
            multiline
            textAlignVertical="top"
          />
        </View>

        {/* 施術前後の写真 */}
        <View style={styles.section}>
          <Text style={styles.label}>
            <Ionicons name="camera-outline" size={12} color={COLORS.textSecondary} />
            {' '}施術前後の写真
          </Text>
          {currentKarteId ? (
            <KartePhotoManager
              karteId={currentKarteId}
              uploadedBy={profile?.id}
              canEdit={true}
            />
          ) : (
            <View style={styles.photoNotice}>
              <Ionicons name="information-circle-outline" size={16} color={COLORS.textLight} />
              <Text style={styles.photoNoticeText}>
                カルテを保存すると写真を追加できます
              </Text>
            </View>
          )}
        </View>

        {/* Save button */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={handleSave}
          disabled={saving}
        >
          <Ionicons name="checkmark-circle" size={20} color="#FFF" />
          <Text style={styles.saveBtnText}>
            {saving ? '保存中...' : isEdit ? 'カルテを更新' : 'カルテを保存'}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <AiSoapModal
        visible={aiModalVisible}
        treatmentType={treatmentType}
        onClose={() => setAiModalVisible(false)}
        onGenerated={applyGeneratedSoap}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
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
  section: { paddingHorizontal: 20, marginTop: 16 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 6 },
  required: { fontSize: 11, color: COLORS.error },
  input: {
    backgroundColor: COLORS.surface, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: COLORS.text,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  textArea: { minHeight: 80 },
  textAreaLarge: { minHeight: 120 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLight,
  },
  typeChipActive: {
    backgroundColor: COLORS.accent, borderColor: COLORS.accent,
  },
  typeChipText: { fontSize: 13, fontWeight: '500', color: COLORS.textSecondary },
  typeChipTextActive: { color: '#FFF' },
  photoNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.surface, padding: 14, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.borderLight,
  },
  photoNoticeText: { fontSize: 12, color: COLORS.textLight, flex: 1 },
  soapBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.accent + '10', marginHorizontal: 20, marginTop: 20,
    padding: 12, borderRadius: 10,
  },
  soapBannerText: { flex: 1, fontSize: 11, color: COLORS.textSecondary, lineHeight: 16 },
  aiBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, marginHorizontal: 20, marginTop: 12,
    paddingVertical: 13, borderRadius: 12,
  },
  aiBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  aiHint: { fontSize: 11, color: COLORS.textLight, paddingHorizontal: 20, marginTop: 6, lineHeight: 16 },
  soapHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 20, marginTop: 24, marginBottom: 4,
  },
  soapBadge: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center',
  },
  soapBadgeText: { color: '#FFF', fontSize: 16, fontWeight: '800' },
  soapTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  soapDesc: { fontSize: 11, color: COLORS.textLight, marginTop: 1 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.accent, marginHorizontal: 20, marginTop: 24,
    paddingVertical: 14, borderRadius: 14,
  },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
});
