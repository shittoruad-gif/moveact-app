import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../lib/constants';
import { useGroupLessons } from '../../hooks/useGroupLessons';
import { StoreSelector } from '../../components/layout/StoreSelector';
import type { GroupLesson } from '../../types/database';

export function GroupLessonListScreen() {
  const navigation = useNavigation<any>();
  const { lessons, isLoading, refetch } = useGroupLessons();

  function formatDateTime(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ja-JP', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }) + ' ' + d.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function renderLesson({ item }: { item: GroupLesson }) {
    const spotsLeft = item.max_capacity - item.current_bookings;
    const isFull = spotsLeft <= 0;

    return (
      <TouchableOpacity
        style={styles.lessonCard}
        onPress={() => navigation.navigate('GroupLessonDetail', { lessonId: item.id })}
      >
        <View style={styles.lessonHeader}>
          <Text style={styles.lessonTitle}>{item.title}</Text>
          <View style={[styles.spotsBadge, isFull && styles.fullBadge]}>
            <Text style={[styles.spotsText, isFull && styles.fullText]}>
              {isFull ? '満席' : `残${spotsLeft}席`}
            </Text>
          </View>
        </View>
        <Text style={styles.instructor}>{item.instructor_name}</Text>
        <Text style={styles.dateTime}>{formatDateTime(item.starts_at)}</Text>
        <View style={styles.lessonFooter}>
          <Text style={styles.price}>¥{item.price.toLocaleString()}</Text>
          {item.is_ticket_eligible && (
            <Text style={styles.ticketBadge}>回数券利用可</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      <StoreSelector />
      <FlatList
        data={lessons}
        keyExtractor={(item) => item.id}
        renderItem={renderLesson}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            現在予定されているレッスンはありません
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  lessonCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  lessonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  lessonTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  spotsBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 8,
  },
  fullBadge: {
    backgroundColor: '#FFEBEE',
  },
  spotsText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.success,
  },
  fullText: {
    color: COLORS.error,
  },
  instructor: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  dateTime: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 8,
  },
  lessonFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  ticketBadge: {
    fontSize: 11,
    color: COLORS.accent,
    fontWeight: '600',
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingVertical: 40,
  },
});
