import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface FavoritesState {
  favoriteIds: Set<string>;
  isLoaded: boolean;
  fetch: (userId: string) => Promise<void>;
  toggle: (userId: string, productId: string) => Promise<void>;
  isFavorite: (productId: string) => boolean;
}

export const useFavoritesStore = create<FavoritesState>((set, get) => ({
  favoriteIds: new Set(),
  isLoaded: false,

  fetch: async (userId) => {
    const { data } = await supabase
      .from('favorites')
      .select('product_id')
      .eq('user_id', userId);
    const ids = new Set((data ?? []).map((f: any) => f.product_id));
    set({ favoriteIds: ids, isLoaded: true });
  },

  toggle: async (userId, productId) => {
    const current = get().favoriteIds;
    if (current.has(productId)) {
      current.delete(productId);
      set({ favoriteIds: new Set(current) });
      await supabase.from('favorites').delete().eq('user_id', userId).eq('product_id', productId);
    } else {
      current.add(productId);
      set({ favoriteIds: new Set(current) });
      await supabase.from('favorites').insert({ user_id: userId, product_id: productId });
    }
  },

  isFavorite: (productId) => get().favoriteIds.has(productId),
}));
