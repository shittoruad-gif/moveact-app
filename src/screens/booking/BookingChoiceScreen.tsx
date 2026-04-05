import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { StoreSelector } from '../../components/layout/StoreSelector';
import { useStoreSelection } from '../../stores/storeSelectionStore';

export function BookingChoiceScreen() {
  const navigation = useNavigation<any>();
  const { selectedStore } = useStoreSelection();

  return (
    <ScrollView style={styles.container}>
      <StoreSelector />

      <View style={styles.content}>
        <Text style={styles.heading}>ご予約方法をお選びください</Text>

        {/* 初めての方 */}
        <View style={styles.sectionLabel}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionLabelText}>初めてご来店の方</Text>
        </View>

        <TouchableOpacity
          style={[styles.card, styles.newCustomerCard]}
          onPress={() => navigation.navigate('BookingCalendar', { isNewCustomer: true })}
        >
          <View style={[styles.iconWrap, { backgroundColor: 'rgba(196,149,106,0.15)' }]}>
            <Ionicons name="person-add-outline" size={24} color={COLORS.accent} />
          </View>
          <View style={styles.cardText}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>初回予約</Text>
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>初めての方</Text>
              </View>
            </View>
            <Text style={styles.cardDescription}>
              カウンセリングシートの事前記入、{'\n'}店舗案内、事前決済のご案内がございます
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
        </TouchableOpacity>

        {/* リピーターの方 */}
        <View style={styles.sectionLabel}>
          <View style={[styles.sectionDot, { backgroundColor: COLORS.success }]} />
          <Text style={styles.sectionLabelText}>2回目以降の方</Text>
        </View>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('BookingCalendar', { isNewCustomer: false })}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#E5EDE8' }]}>
            <Ionicons name="calendar-outline" size={24} color={COLORS.success} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>施術予約</Text>
            <Text style={styles.cardDescription}>
              メニュー・日時を選んでそのまま予約できます
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('BookingWebView', { storeId: selectedStore })}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#F5EDE5' }]}>
            <Ionicons name="globe-outline" size={24} color={COLORS.accent} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Web予約（エアリザーブ）</Text>
            <Text style={styles.cardDescription}>
              外部予約サイトからご予約いただけます
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
        </TouchableOpacity>

        {/* その他 */}
        <View style={styles.sectionLabel}>
          <View style={[styles.sectionDot, { backgroundColor: COLORS.textLight }]} />
          <Text style={styles.sectionLabelText}>その他</Text>
        </View>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('GroupLessonList')}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#EDE5F0' }]}>
            <Ionicons name="people-outline" size={24} color="#9B7FA7" />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>グループレッスン</Text>
            <Text style={styles.cardDescription}>
              グループピラティスのレッスンをご予約いただけます
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('MenuPrice')}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#F5E8E8' }]}>
            <Ionicons name="pricetag-outline" size={24} color={COLORS.accentPink} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>料金メニュー</Text>
            <Text style={styles.cardDescription}>
              各施術メニューの料金をご確認いただけます
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('StoreGuide', { storeId: selectedStore })}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#E8ECF5' }]}>
            <Ionicons name="map-outline" size={24} color="#7B8FA7" />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>店舗案内</Text>
            <Text style={styles.cardDescription}>
              アクセス・駐車場・ご来店時のご案内
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: 20 },
  heading: {
    fontSize: 13,
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 20,
  },
  sectionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    marginTop: 4,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
  },
  sectionLabelText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  newCustomerCard: {
    borderWidth: 1.5,
    borderColor: COLORS.accentLight,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  cardText: { flex: 1 },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  newBadge: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  newBadgeText: { fontSize: 10, fontWeight: '700', color: '#FFF' },
  cardDescription: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});
