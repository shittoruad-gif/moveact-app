import React from 'react';
import { View, Text, Modal, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../lib/constants';

interface ReviewRequestModalProps {
  visible: boolean;
  lessonTitle?: string;
  onYes: () => void;
  onNo: () => void;
  onNeverShow: () => void;
}

export function ReviewRequestModal({
  visible,
  lessonTitle,
  onYes,
  onNo,
  onNeverShow,
}: ReviewRequestModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Close button */}
          <TouchableOpacity style={styles.closeButton} onPress={onNo}>
            <Ionicons name="close" size={20} color={COLORS.textLight} />
          </TouchableOpacity>

          {/* Icon */}
          <View style={styles.iconWrap}>
            <Ionicons name="chatbubble-ellipses-outline" size={28} color={COLORS.accent} />
          </View>

          {/* Title */}
          <Text style={styles.title}>ご来院ありがとうございました</Text>

          {/* Message */}
          <Text style={styles.message}>
            {lessonTitle
              ? `「${lessonTitle}」はいかがでしたか？`
              : '施術はいかがでしたか？'}
          </Text>
          <Text style={styles.subMessage}>
            かんたんな質問に答えるだけで{'\n'}
            口コミ文章を作成できます。
          </Text>

          {/* Buttons */}
          <TouchableOpacity style={styles.primaryButton} onPress={onYes}>
            <Text style={styles.primaryButtonText}>口コミを書く</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={onNo}>
            <Text style={styles.secondaryButtonText}>今回はスキップ</Text>
          </TouchableOpacity>

          {/* Opt-out link */}
          <TouchableOpacity style={styles.optOutButton} onPress={onNeverShow}>
            <Text style={styles.optOutText}>次から表示しない</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  modal: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    paddingHorizontal: 28,
    paddingTop: 36,
    paddingBottom: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.backgroundSoft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: COLORS.accentLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  message: {
    fontSize: 14,
    color: COLORS.text,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 4,
  },
  subMessage: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    letterSpacing: 0.5,
  },
  secondaryButton: {
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 32,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  secondaryButtonText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  optOutButton: {
    paddingVertical: 4,
  },
  optOutText: {
    color: COLORS.textLight,
    fontSize: 12,
    textDecorationLine: 'underline',
    letterSpacing: 0.3,
  },
});
