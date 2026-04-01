import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../lib/constants';
import { StoreSelector } from '../../components/layout/StoreSelector';
import { useStoreSelection } from '../../stores/storeSelectionStore';

export function BookingChoiceScreen() {
  const navigation = useNavigation<any>();
  const { selectedStore } = useStoreSelection();

  return (
    <View style={styles.container}>
      <StoreSelector />

      <View style={styles.content}>
        <Text style={styles.heading}>ご予約方法をお選びください</Text>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('BookingWebView', { storeId: selectedStore })}
        >
          <View style={[styles.iconWrap, { backgroundColor: '#F5EDE5' }]}>
            <Ionicons name="calendar-outline" size={24} color={COLORS.accent} />
          </View>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>施術予約</Text>
            <Text style={styles.cardDescription}>
              整体・美容鍼・パーソナルピラティスなどの{'\n'}個別施術をご予約いただけます
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
        </TouchableOpacity>

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
              グループピラティスのレッスンを{'\n'}ご予約・事前決済いただけます
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
  },
  heading: {
    fontSize: 13,
    color: COLORS.textSecondary,
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  cardDescription: {
    fontSize: 12,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
});
