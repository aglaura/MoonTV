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
  englishTitle?: string; // New prop
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
    englishTitle,
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

  // External state
  const [dynamicEpisodes, setDynamicEpisodes] = useState<number | undefined>(episodes);
  const [dynamicSourceNames, setDynamicSourceNames] = useState<string[] | undefined>(source_names);
  const [dynamicDoubanId, setDynamicDoubanId] = useState<number | undefined>(douban_id);

  // Title state (supports English title)
  const [displayTitle, setDisplayTitle] = useState<string>(title);

  // Update dynamic state on props change
  useEffect(() => { setDynamicEpisodes(episodes); }, [episodes]);
  useEffect(() => { setDynamicSourceNames(source_names); }, [source_names]);
  useEffect(() => { setDynamicDoubanId(douban_id); }, [douban_id]);

  useImperativeHandle(ref, () => ({
    setEpisodes: (eps?: number) => setDynamicEpisodes(eps),
    setSourceNames: (names?: string[]) => setDynamicSourceNames(names),
    setDoubanId: (id?: number) => setDynamicDoubanId(id),
  }));

  // Fetch English title if douban_id exists and englishTitle not provided
  useEffect(() => {
    if (douban_id && !englishTitle) {
      const fetchEnglishTitle = async () => {
        try {
          const res = await fetch(`/api/douban/title/${douban_id}`);
          const data = await res.json();
          if (data.original_title) {
            setDisplayTitle(data.original_title);
          }
        } catch (err) {
          console.error('Failed to fetch English title:', err);
          setDisplayTitle(title);
        }
      };
      fetchEnglishTitle();
    } else if (englishTitle) {
      setDisplayTitle(englishTitle);
    }
  }, [douban_id, englishTitle, title]);

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

  // Fetch favorited status (if applicable)
  useEffect(() => {
    if (from === 'douban' || from === 'search' || !actualSource || !actualId) return;
    const fetchFavoriteStatus = async () => {
      try {
        const fav = await isFavorited(actualSource, actualId);
        setFavorited(fav);
      } catch (err) {
        console.error('Check favorite failed');
      }
    };
    fetchFavoriteStatus();

    const storageKey = generateStorageKey(actualSource, actualId);
    const unsubscribe = subscribeToDataUpdates('favoritesUpdated', (newFavorites: Record<string, any>) => {
      const isNowFavorited = !!newFavorites[storageKey];
      setFavorited(isNowFavorited);
    });
    return unsubscribe;
  }, [from, actualSource, actualId]);

  // Toggle favorite
  const handleToggleFavorite = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (from === 'douban' || !actualSource || !actualId) return;

    try {
      const currentFavorited = from === 'search' ? searchFavorited : favorited;

      if (currentFavorited) {
        await deleteFavorite(actualSource, actualId);
        from === 'search' ? setSearchFavorited(false) : setFavorited(false);
      } else {
        await saveFavorite(actualSource, actualId, {
          title: displayTitle,
          source_name: source_name || '',
          year: actualYear || '',
          cover: actualPoster,
          total_episodes: actualEpisodes ?? 1,
          save_time: Date.now(),
        });
        from === 'search' ? setSearchFavorited(true) : setFavorited(true);
      }
    } catch (err) {
      console.error('Toggle favorite failed');
    }
  }, [from, actualSource, actualId, displayTitle, source_name, actualYear, actualPoster, actualEpisodes, favorited, searchFavorited]);

  // Delete play record
  const handleDeleteRecord = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (from !== 'playrecord' || !actualSource || !actualId) return;
    try {
      await deletePlayRecord(actualSource, actualId);
      onDelete?.();
    } catch (err) {
      console.error('Delete record failed');
    }
  }, [from, actualSource, actualId, onDelete]);

  // Click handler
  const handleClick = useCallback(() => {
    if (origin === 'live' && actualSource && actualId) {
      router.push(`/live?source=${actualSource.replace('live_', '')}&id=${actualId.replace('live_', '')}`);
    } else if (from === 'douban' || (isAggregate && !actualSource && !actualId)) {
      router.push(`/play?title=${encodeURIComponent(displayTitle.trim())}${actualYear ? `&year=${actualYear}` : ''}${actualSearchType ? `&stype=${actualSearchType}` : ''}${isAggregate ? '&prefer=true' : ''}${actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''}`);
    } else if (actualSource && actualId) {
      router.push(`/play?source=${actualSource}&id=${actualId}&title=${encodeURIComponent(displayTitle)}${actualYear ? `&year=${actualYear}` : ''}${isAggregate ? '&prefer=true' : ''}${actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''}${actualSearchType ? `&stype=${actualSearchType}` : ''}`);
    }
  }, [origin, from, actualSource, actualId, router, displayTitle, actualYear, isAggregate, actualQuery, actualSearchType]);

  // Play in new tab
  const handlePlayInNewTab = useCallback(() => {
    if (origin === 'live' && actualSource && actualId) {
      window.open(`/live?source=${actualSource.replace('live_', '')}&id=${actualId.replace('live_', '')}`, '_blank');
    } else if (from === 'douban' || (isAggregate && !actualSource && !actualId)) {
      window.open(`/play?title=${encodeURIComponent(displayTitle.trim())}${actualYear ? `&year=${actualYear}` : ''}${actualSearchType ? `&stype=${actualSearchType}` : ''}${isAggregate ? '&prefer=true' : ''}${actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''}`, '_blank');
    } else if (actualSource && actualId) {
      window.open(`/play?source=${actualSource}&id=${actualId}&title=${encodeURIComponent(displayTitle)}${actualYear ? `&year=${actualYear}` : ''}${isAggregate ? '&prefer=true' : ''}${actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''}${actualSearchType ? `&stype=${actualSearchType}` : ''}`, '_blank');
    }
  }, [origin, from, actualSource, actualId, displayTitle, actualYear, isAggregate, actualQuery, actualSearchType]);

  const longPressEvents = useLongPress(() => setShowMobileActions(true));

  return (
    <>
      <div
        {...longPressEvents}
        className="video-card"
        onClick={handleClick}
        title={displayTitle}
      >
        <Image
          src={processImageUrl(actualPoster)}
          alt={displayTitle}
          width={200}
          height={280}
          placeholder="blur"
          blurDataURL={ImagePlaceholder}
          className="rounded-lg object-cover"
        />
        <div className="video-card-info">
          <h3>{displayTitle}</h3>
          {rate && <span className="rate">{rate}</span>}
        </div>
        <div className="video-card-actions">
          <button onClick={handleToggleFavorite}><Heart fill={favorited ? 'red' : 'none'} /></button>
          {from === 'playrecord' && <button onClick={handleDeleteRecord}><Trash2 /></button>}
          <button onClick={handlePlayInNewTab}><PlayCircleIcon /></button>
        </div>
      </div>

      {showMobileActions && (
        <MobileActionSheet
          title={displayTitle}
          onClose={() => setShowMobileActions(false)}
          actions={[
            { label: favorited ? 'Unfavorite' : 'Favorite', onClick: handleToggleFavorite },
            { label: 'Open in New Tab', onClick: handlePlayInNewTab },
            { label: 'Delete Record', onClick: handleDeleteRecord, visible: from === 'playrecord' },
          ]}
        />
      )}
    </>
  );
});

export default memo(VideoCard);
