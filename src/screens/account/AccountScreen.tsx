import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, STORES } from '../../lib/constants';
import { useAuth } from '../../hooks/useAuth';
import { useStoreSelection } from '../../stores/storeSelectionStore';

export function AccountScreen() {
  const navigation = useNavigation<any>();
  const { profile, signOut } = useAuth();
  const { selectedStore } = useStoreSelection();

  function handleSignOut() {
    Alert.alert('ログアウト', 'ログアウトしますか?', [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'ログアウト', style: 'destructive', onPress: signOut },
    ]);
  }

  const menuItems = [
    { label: '注文履歴', icon: 'bag-check-outline' as const, screen: 'OrderHistory' },
    { label: '通知設定', icon: 'notifications-outline' as const, screen: 'NotificationSettings' },
    { label: '店舗を切り替え', icon: 'storefront-outline' as const, screen: 'StoreSelect' },
  ];

  return (
    <ScrollView style={styles.container}>
      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {profile?.full_name?.charAt(0) ?? '?'}
          </Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{profile?.full_name ?? 'ゲスト'}</Text>
          {profile?.phone ? (
            <Text style={styles.profileDetail}>{profile.phone}</Text>
          ) : null}
          <Text style={styles.profileStore}>{STORES[selectedStore].name}</Text>
        </View>
      </View>

      {/* Menu */}
      <View style={styles.menu}>
        {menuItems.map((item, i) => (
          <TouchableOpacity
            key={item.screen}
            style={[styles.menuItem, i === menuItems.length - 1 && { borderBottomWidth: 0 }]}
            onPress={() => navigation.navigate(item.screen)}
          >
            <Ionicons name={item.icon} size={20} color={COLORS.textSecondary} />
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Sign Out */}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutText}>ログアウト</Text>
      </TouchableOpacity>

      {/* Version */}
      <Text style={styles.version}>Moveact App v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  profileCard: {
    backgroundColor: COLORS.surface,
    margin: 20,
    borderRadius: 16,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.accentLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: '500',
    color: COLORS.accent,
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  profileDetail: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  profileStore: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 4,
  },
  menu: {
    backgroundColor: COLORS.surface,
    marginHorizontal: 20,
    borderRadius: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    gap: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.borderLight,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    color: COLORS.text,
    letterSpacing: 0.3,
  },
  signOutButton: {
    marginTop: 32,
    marginHorizontal: 20,
    alignItems: 'center',
    paddingVertical: 14,
  },
  signOutText: {
    fontSize: 14,
    color: COLORS.error,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  version: {
    textAlign: 'center',
    fontSize: 11,
    color: COLORS.textLight,
    marginTop: 16,
    marginBottom: 32,
    letterSpacing: 0.5,
  },
});
