'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';

export type FavoriteItem = {
  id: string;
  source: string;
  title: string;
  poster: string;
  year?: string;
  episodes: number;
  source_name: string;
  currentEpisode?: number;
  search_title?: string;
  origin?: 'vod' | 'live';
};

type HomeTab = 'home' | 'favorites';

export const useHomeFavorites = (activeTab: HomeTab) => {
  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);

  const updateFavoriteItems = useCallback(
    async (allFavorites: Record<string, any>) => {
      const allPlayRecords = await getAllPlayRecords();
      const sorted = Object.entries(allFavorites)
        .sort(([, a], [, b]) => b.save_time - a.save_time)
        .map(([key, fav]) => {
          const plusIndex = key.indexOf('+');
          const source = key.slice(0, plusIndex);
          const id = key.slice(plusIndex + 1);
          const playRecord = allPlayRecords[key];
          const currentEpisode = playRecord?.index;

          return {
            id,
            source,
            title: fav.title,
            year: fav.year,
            poster: fav.cover,
            episodes: fav.total_episodes,
            source_name: fav.source_name,
            currentEpisode,
            search_title: fav?.search_title,
            origin: fav?.origin,
          } as FavoriteItem;
        });
      setFavoriteItems(sorted);
    },
    []
  );

  useEffect(() => {
    if (activeTab !== 'favorites') return;

    const loadFavorites = async () => {
      const allFavorites = await getAllFavorites();
      await updateFavoriteItems(allFavorites);
    };

    loadFavorites();

    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        updateFavoriteItems(newFavorites);
      }
    );

    return unsubscribe;
  }, [activeTab, updateFavoriteItems]);

  const clearFavorites = useCallback(async () => {
    await clearAllFavorites();
    setFavoriteItems([]);
  }, []);

  return { favoriteItems, clearFavorites };
};
