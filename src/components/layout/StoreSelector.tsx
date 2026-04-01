import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, STORES } from '../../lib/constants';
import { useStoreSelection } from '../../stores/storeSelectionStore';
import type { StoreId } from '../../types/database';

export function StoreSelector() {
  const { selectedStore, setSelectedStore } = useStoreSelection();

  const storeOptions: { id: StoreId; label: string }[] = [
    { id: 'kanamitsu', label: STORES.kanamitsu.name },
    { id: 'tamashima', label: STORES.tamashima.name },
  ];

  return (
    <View style={styles.container}>
      {storeOptions.map((store) => (
        <TouchableOpacity
          key={store.id}
          onPress={() => setSelectedStore(store.id)}
          style={[
            styles.tab,
            selectedStore === store.id && styles.activeTab,
          ]}
        >
          <Text
            style={[
              styles.tabText,
              selectedStore === store.id && styles.activeTabText,
            ]}
          >
            {store.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.backgroundSoft,
    borderRadius: 24,
    padding: 3,
    marginHorizontal: 20,
    marginVertical: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 22,
  },
  activeTab: {
    backgroundColor: COLORS.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.textLight,
    letterSpacing: 0.5,
  },
  activeTabText: {
    color: COLORS.text,
    fontWeight: '600',
  },
});
