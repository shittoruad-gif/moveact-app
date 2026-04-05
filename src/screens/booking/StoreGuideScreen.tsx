import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BookingStackParamList } from '../../types/navigation';

type Props = NativeStackScreenProps<BookingStackParamList, 'StoreGuide'>;

const STORE_DETAILS: Record<string, { description: string; parking: string; access: string; landmarks: string }> = {
  kanamitsu: {
    description: '金光駅から徒歩圏内。2階にございますので、階段またはエレベーターをご利用ください。',
    parking: '建物前に専用駐車場あり（無料）',
    access: 'JR山陽本線「金光駅」より徒歩約10分',
    landmarks: '占見新田交差点近く',
  },
  tamashima: {
    description: '玉島中央町の商店街エリア内にございます。',
    parking: '近隣にコインパーキングあり',
    access: 'JR山陽本線「新倉敷駅」よりバス約15分',
    landmarks: '玉島中央町商店街',
  },
};

export function StoreGuideScreen({ route }: Props) {
  const { storeId } = route.params;
  const store = STORES[storeId];
  const details = STORE_DETAILS[storeId];

  function openMap() {
    const address = encodeURIComponent(store.address);
    const url = Platform.OS === 'ios'
      ? `maps:?q=${address}`
      : `geo:0,0?q=${address}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://maps.google.com/?q=${address}`);
    });
  }

  function callStore() {
    if (store.phone) {
      Linking.openURL(`tel:${store.phone}`);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Store Name */}
      <View style={styles.header}>
        <Ionicons name="storefront" size={32} color={COLORS.accent} />
        <Text style={styles.storeName}>{store.name}</Text>
        <Text style={styles.storeAddress}>{store.address}</Text>
      </View>

      {/* Info cards */}
      <View style={styles.card}>
        <InfoRow icon="navigate-outline" label="アクセス" value={details.access} />
        <InfoRow icon="car-outline" label="駐車場" value={details.parking} />
        <InfoRow icon="pin-outline" label="目印" value={details.landmarks} />
        <InfoRow icon="information-circle-outline" label="ご案内" value={details.description} last />
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionButton} onPress={openMap}>
          <View style={[styles.actionIcon, { backgroundColor: '#E5EDE8' }]}>
            <Ionicons name="map-outline" size={22} color={COLORS.success} />
          </View>
          <Text style={styles.actionText}>マップで開く</Text>
        </TouchableOpacity>

        {store.phone ? (
          <TouchableOpacity style={styles.actionButton} onPress={callStore}>
            <View style={[styles.actionIcon, { backgroundColor: '#F5EDE5' }]}>
              <Ionicons name="call-outline" size={22} color={COLORS.accent} />
            </View>
            <Text style={styles.actionText}>電話する</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Arrival tips */}
      <View style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>ご来店時のお願い</Text>
        <Text style={styles.tipsText}>
          ・ご予約時間の5分前までにお越しください{'\n'}
          ・動きやすい服装でお越しいただくとスムーズです{'\n'}
          ・初めてのご来店の場合、カウンセリングシートの記入がございます{'\n'}
          ・お車でお越しの場合は専用駐車場をご利用ください
        </Text>
      </View>
    </ScrollView>
  );
}

function InfoRow({ icon, label, value, last }: { icon: string; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Ionicons name={icon as any} size={18} color={COLORS.textSecondary} />
      <View style={styles.infoContent}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 24, gap: 6 },
  storeName: { fontSize: 22, fontWeight: '700', color: COLORS.text },
  storeAddress: { fontSize: 13, color: COLORS.textSecondary },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  infoRowBorder: { borderBottomWidth: 0.5, borderBottomColor: COLORS.borderLight },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 11, color: COLORS.textLight, marginBottom: 2 },
  infoValue: { fontSize: 14, fontWeight: '500', color: COLORS.text, lineHeight: 20 },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 8,
  },
  actionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  tipsCard: {
    backgroundColor: COLORS.surfaceWarm,
    borderRadius: 14,
    padding: 18,
  },
  tipsTitle: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 10 },
  tipsText: { fontSize: 13, color: COLORS.textSecondary, lineHeight: 22 },
});
