/* eslint-disable @typescript-eslint/no-explicit-any,react-hooks/exhaustive-deps,@typescript-eslint/no-empty-function */

import { Heart, PlayCircleIcon, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
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
import { useLongPress } from '@/components/useLongPress';
import MobileActionSheet from '@/components/MobileActionSheet';
import ImagePlaceholder from '@/components/ImagePlaceholder';

export interface VideoCardProps {
  id?: string;
  source?: string;
  title?: string;
  englishTitle?: string;
  query?: string;
  poster?: string;
  episodes?: number;
  source_name?: string;
  source_names?: string[];
  progress?: number; // _progress if unused
  year?: string;
  from: 'playrecord' | 'favorite' | 'search' | 'douban';
  currentEpisode?: number;
  douban_id?: number;
  onDelete?: () => void;
  rate?: string; // _rate if unused
  type?: string;
  isBangumi?: boolean; // _isBangumi if unused
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
    englishTitle = '',
    query = '',
    poster = '',
    episodes,
    source,
    source_name,
    source_names,
    progress: _progress,
    year,
    from,
    currentEpisode,
    douban_id,
    onDelete,
    rate: _rate,
    type = '',
    isBangumi: _isBangumi,
    isAggregate = false,
    origin = 'vod',
  }: VideoCardProps,
  ref
) {
  const router = useRouter();
  const [favorited, setFavorited] = useState(false);
  const [showMobileActions, setShowMobileActions] = useState(false);
  const [searchFavorited, setSearchFavorited] = useState<boolean | null>(null);
  const [dynamicEpisodes, setDynamicEpisodes] = useState<number | undefined>(episodes);
  const [_dynamicSourceNames, setDynamicSourceNames] = useState<string[] | undefined>(source_names);
  const [_dynamicDoubanId, setDynamicDoubanId] = useState<number | undefined>(douban_id);

  useEffect(() => setDynamicEpisodes(episodes), [episodes]);
  useEffect(() => setDynamicSourceNames(source_names), [source_names]);
  useEffect(() => setDynamicDoubanId(douban_id), [douban_id]);

  useImperativeHandle(ref, () => ({
    setEpisodes: (eps?: number) => setDynamicEpisodes(eps),
    setSourceNames: (names?: string[]) => setDynamicSourceNames(names),
    setDoubanId: (id?: number) => setDynamicDoubanId(id),
  }));

  const actualTitle = englishTitle || title;
  const actualSource = source;
  const actualId = id;
  const actualEpisodes = dynamicEpisodes;
  const actualYear = year;
  const actualQuery = query || '';
  const actualSearchType = isAggregate
    ? (actualEpisodes && actualEpisodes === 1 ? 'movie' : 'tv')
    : type;

  // Favorite status
  useEffect(() => {
    if (from === 'douban' || from === 'search' || !actualSource || !actualId) return;

    const fetchFavoriteStatus = async () => {
      try {
        const fav = await isFavorited(actualSource, actualId);
        setFavorited(fav);
      } catch (err) {
        // ignore
      }
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
    async (e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
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
            cover: poster,
            total_episodes: actualEpisodes ?? 1,
            save_time: Date.now(),
          });
          from === 'search' ? setSearchFavorited(true) : setFavorited(true);
        }
      } catch (err) {
        // ignore
      }
    },
    [from, actualSource, actualId, actualTitle, source_name, actualYear, poster, actualEpisodes, favorited, searchFavorited]
  );

  const handleDeleteRecord = useCallback(
    async (e?: React.MouseEvent) => {
      e?.preventDefault();
      e?.stopPropagation();
      if (from !== 'playrecord' || !actualSource || !actualId) return;
      try {
        await deletePlayRecord(actualSource, actualId);
        onDelete?.();
      } catch (err) {
        // ignore
      }
    },
    [from, actualSource, actualId, onDelete]
  );

  const handleClick = useCallback(() => {
    if (origin === 'live' && actualSource && actualId) {
      router.push(`/live?source=${actualSource.replace('live_', '')}&id=${actualId.replace('live_', '')}`);
    } else if (from === 'douban' || (isAggregate && !actualSource && !actualId)) {
      router.push(`/play?title=${encodeURIComponent(actualTitle)}${actualYear ? `&year=${actualYear}` : ''}${actualSearchType ? `&stype=${actualSearchType}` : ''}${isAggregate ? '&prefer=true' : ''}${actualQuery ? `&stitle=${encodeURIComponent(actualQuery)}` : ''}`);
    } else if (actualSource && actualId) {
      router.push(`/play?source=${actualSource}&id=${actualId}&title=${encodeURIComponent(actualTitle)}${actualYear ? `&year=${actualYear}` : ''}${isAggregate ? '&prefer=true' : ''}${actualQuery ? `&stitle=${encodeURIComponent(actualQuery)}` : ''}${actualSearchType ? `&stype=${actualSearchType}` : ''}`);
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

  return (
    <>
      <div
        {...longPressProps}
        className="group relative w-full rounded-lg cursor-pointer overflow-hidden bg-gray-200 dark:bg-gray-800"
      >
        {poster ? (
          <img
            src={poster}
            alt={actualTitle}
            className="w-full aspect-[2/3] object-cover rounded-lg transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <ImagePlaceholder className="w-full aspect-[2/3] rounded-lg" />
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white px-2 py-1 text-sm font-semibold truncate">
          {actualTitle}
        </div>
      </div>
      <MobileActionSheet
        isOpen={showMobileActions}
        onClose={() => setShowMobileActions(false)}
        title={actualTitle}
        poster={poster}
        isAggregate={isAggregate}
        sourceName={source}
        currentEpisode={currentEpisode}
        totalEpisodes={episodes}
        actions={[
          {
            id: 'delete',
            label: 'Delete',
            icon: <Trash2 size={18} />,
            onClick: handleDeleteRecord,
            color: 'danger',
          },
          {
            id: 'favorite',
            label: (from === 'search' ? searchFavorited : favorited) ? 'Unfavorite' : 'Favorite',
            icon: <Heart size={18} />,
            onClick: handleToggleFavorite,
            color: 'primary',
          },
          {
            id: 'play',
            label: 'Play in New Tab',
            icon: <PlayCircleIcon size={18} />,
            onClick: handlePlayInNewTab,
          },
        ]}
      />
    </>
  );
});

export default memo(VideoCard);
