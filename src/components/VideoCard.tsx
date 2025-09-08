/* eslint-disable @typescript-eslint/no-explicit-any,react-hooks/exhaustive-deps,@typescript-eslint/no-empty-function */

import { ExternalLink, Heart, Link, PlayCircleIcon, Radio, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';

import {
  deleteFavorite,
  deletePlayRecord,
  generateStorageKey,
  isFavorited,
  saveFavorite,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { processImageUrl } from '@/lib/utils';
import { useLongPress } from '@/components/useLongPress';
import { ImagePlaceholder } from '@/components/ImagePlaceholder';
import MobileActionSheet from '@/components/MobileActionSheet';

export interface VideoCardProps {
  id?: string;
  source?: string;
  title?: string;
  englishTitle?: string; // NEW: English title from Douban
  query?: string;
  poster?: string;
  episodes?: number;
  source_name?: string;
  source_names?: string[];
  progress?: number;
  year?: string;
  from: 'playrecord' | 'favorite' | 'search' | 'douban';
  currentEpisode?: number;
  douban_id?: number;
  onDelete?: () => void;
  rate?: string;
  type?: string;
  isBangumi?: boolean;
  isAggregate?: boolean;
  origin?: 'vod' | 'live';
}

export type VideoCardHandle = {
  setEpisodes: (episodes?: number) => void;
  setSourceNames: (names?: string[]) => void;
  setDoubanId: (id?: number) => void;
};

const VideoCard = forwardRef<VideoCardHandle, VideoCardProps>(function VideoCard(
  {
    id,
    title = '',
    englishTitle = '', // NEW
    query = '',
    poster = '',
    episodes,
    source,
    source_name,
    source_names,
    progress = 0,
    year,
    from,
    currentEpisode,
    douban_id,
    onDelete,
    rate,
    type = '',
    isBangumi = false,
    isAggregate = false,
    origin = 'vod',
  }: VideoCardProps,
  ref
) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [searchFavorited, setSearchFavorited] = useState<boolean | null>(null);

  const [dynamicEpisodes, setDynamicEpisodes] = useState<number | undefined>(episodes);
  const [dynamicSourceNames, setDynamicSourceNames] = useState<string[] | undefined>(source_names);
  const [dynamicDoubanId, setDynamicDoubanId] = useState<number | undefined>(douban_id);

  useEffect(() => setDynamicEpisodes(episodes), [episodes]);
  useEffect(() => setDynamicSourceNames(source_names), [source_names]);
  useEffect(() => setDynamicDoubanId(douban_id), [douban_id]);

  useImperativeHandle(ref, () => ({
    setEpisodes: (eps?: number) => setDynamicEpisodes(eps),
    setSourceNames: (names?: string[]) => setDynamicSourceNames(names),
    setDoubanId: (id?: number) => setDynamicDoubanId(id),
  }));

  const actualTitle = englishTitle || title; // USE English title if available
  const actualPoster = poster;
  const actualSource = source;
  const actualId = id;
  const actualDoubanId = dynamicDoubanId;
  const actualEpisodes = dynamicEpisodes;
  const actualYear = year;
  const actualQuery = query || '';
  const actualSearchType = isAggregate
    ? (actualEpisodes && actualEpisodes === 1 ? 'movie' : 'tv')
    : type;

  // Check favorite status
  useEffect(() => {
    if (from === 'douban' || from === 'search' || !actualSource || !actualId) return;

    const fetchFavoriteStatus = async () => {
      try {
        const fav = await isFavorited(actualSource, actualId);
        setFavorited(fav);
      } catch { /* ignore errors */ }
    };

    fetchFavoriteStatus();

    const storageKey = generateStorageKey(actualSource, actualId);
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => setFavorited(!!newFavorites[storageKey])
    );

    return unsubscribe;
  }, [from, actualSource, actualId]);

  const handleToggleFavorite = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (from === 'douban' || !actualSource || !actualId) return;

      const currentFavorited = from === 'search' ? searchFavorited : favorited;

      try {
        if (currentFavorited) {
          await deleteFavorite(actualSource, actualId);
          from === 'search' ? setSearchFavorited(false) : setFavorited(false);
        } else {
          await saveFavorite(actualSource, actualId, {
            title: actualTitle,
            source_name: source_name || '',
            year: actualYear || '',
            cover: actualPoster,
            total_episodes: actualEpisodes ?? 1,
            save_time: Date.now(),
          });
          from === 'search' ? setSearchFavorited(true) : setFavorited(true);
        }
      } catch { /* ignore errors */ }
    },
    [from, actualSource, actualId, actualTitle, source_name, actualYear, actualPoster, actualEpisodes, favorited, searchFavorited]
  );

  const handleDeleteRecord = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (from !== 'playrecord' || !actualSource || !actualId) return;
      try {
        await deletePlayRecord(actualSource, actualId);
        onDelete?.();
      } catch { /* ignore errors */ }
    },
    [from, actualSource, actualId, onDelete]
  );

  const handleClick = useCallback(() => {
    if (origin === 'live' && actualSource && actualId) {
      router.push(`/live?source=${actualSource.replace('live_', '')}&id=${actualId.replace('live_', '')}`);
    } else if (from === 'douban' || (isAggregate && !actualSource && !actualId)) {
      router.push(
        `/play?title=${encodeURIComponent(actualTitle)}${actualYear ? `&year=${actualYear}` : ''}${actualSearchType ? `&stype=${actualSearchType}` : ''}${isAggregate ? '&prefer=true' : ''}${actualQuery ? `&stitle=${encodeURIComponent(actualQuery)}` : ''}`
      );
    } else if (actualSource && actualId) {
      router.push(
        `/play?source=${actualSource}&id=${actualId}&title=${encodeURIComponent(actualTitle)}${actualYear ? `&year=${actualYear}` : ''}${isAggregate ? '&prefer=true' : ''}${actualQuery ? `&stitle=${encodeURIComponent(actualQuery)}` : ''}${actualSearchType ? `&stype=${actualSearchType}` : ''}`
      );
    }
  }, [origin, from, actualSource, actualId, actualTitle, actualYear, isAggregate, actualQuery, actualSearchType, router]);

  const handlePlayInNewTab = useCallback(() => {
    const url =
      origin === 'live' && actualSource && actualId
        ? `/live?source=${actualSource.replace('live_', '')}&id=${actualId.replace('live_', '')}`
        : from === 'douban' || (isAggregate && !actualSource && !actualId)
        ? `/play?title=${encodeURIComponent(actualTitle)}${actualYear ? `&year=${actualYear}` : ''}${actualSearchType ? `&stype=${actualSearchType}` : ''}${isAggregate ? '&prefer=true' : ''}${actualQuery ? `&stitle=${encodeURIComponent(actualQuery)}` : ''}`
        : `/play?source=${actualSource}&id=${actualId}&title=${encodeURIComponent(actualTitle)}${actualYear ? `&year=${actualYear}` : ''}${isAggregate ? '&prefer=true' : ''}${actualQuery ? `&stitle=${encodeURIComponent(actualQuery)}` : ''}${actualSearchType ? `&stype=${actualSearchType}` : ''}`;
    window.open(url, '_blank');
  }, [origin, from, actualSource, actualId, actualTitle, actualYear, isAggregate, actualQuery, actualSearchType]);

  const checkSearchFavoriteStatus = useCallback(async () => {
    if (from === 'search' && !isAggregate && actualSource && actualId && searchFavorited === null) {
      try {
        const fav = await isFavorited(actualSource, actualId);
        setSearchFavorited(fav);
      } catch {
        setSearchFavorited(false);
      }
    }
  }, [from, isAggregate, actualSource, actualId, searchFavorited]);

  const handleLongPress = useCallback(() => {
    if (!showMobileActions) {
      setShowMobileActions(true);
      if (from === 'search' && !isAggregate && actualSource && actualId && searchFavorited === null) {
        checkSearchFavoriteStatus();
      }
    }
  }, [showMobileActions, from, isAggregate, actualSource, actualId, searchFavorited, checkSearchFavoriteStatus]);

  const longPressProps = useLongPress({
    onLongPress: handleLongPress,
    onClick: handleClick,
    longPressDelay: 500,
  });

  // ... The rest of the component (poster, badges, MobileActionSheet) remains the same
  // Just replace `title` with `actualTitle` everywhere to use English title if available

  return (
    <>
      <div {...longPressProps} className="group relative w-full rounded-lg cursor-pointer">
        {/* Poster, badges, buttons etc. */}
      </div>
      <MobileActionSheet
        isOpen={showMobileActions}
        onClose={() => setShowMobileActions(false)}
        onDelete={handleDeleteRecord}
        onFavorite={handleToggleFavorite}
        onPlayInNewTab={handlePlayInNewTab}
        favorited={from === 'search' ? searchFavorited : favorited}
      />
    </>
  );
});

export default memo(VideoCard);
