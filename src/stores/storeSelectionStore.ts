import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StoreId } from '../types/database';

const STORAGE_KEY = 'selected_store';

interface StoreSelectionState {
  selectedStore: StoreId;
  setSelectedStore: (store: StoreId) => void;
  loadFromStorage: () => Promise<void>;
}

export const useStoreSelection = create<StoreSelectionState>((set) => ({
  selectedStore: 'kanamitsu',
  setSelectedStore: (store) => {
    set({ selectedStore: store });
    AsyncStorage.setItem(STORAGE_KEY, store);
  },
  loadFromStorage: async () => {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'kanamitsu' || stored === 'tamashima') {
      set({ selectedStore: stored });
    }
  },
}));
