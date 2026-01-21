/* eslint-disable @typescript-eslint/no-explicit-any,react-hooks/exhaustive-deps,@typescript-eslint/no-empty-function */

import {
  ExternalLink,
  Heart,
  Link,
  PlayCircleIcon,
  Radio,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import React, {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
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
import { getDoubanSubjectDetail } from '@/lib/douban.client';
import { convertToTraditional } from '@/lib/locale';
import { useDeviceInfo } from '@/lib/screenMode';
import { processImageUrl } from '@/lib/utils';

import MobileActionSheet from '@/components/MobileActionSheet';
import { useLongPress } from '@/components/useLongPress';

const ENGLISH_TITLE_PLACEHOLDERS = new Set(
  [
    'n/a',
    'na',
    'unknown',
    'none',
    'not found',
    '-',
    '--',
    'null',
    '暂无',
    '暫無',
    '無',
  ].map((item) => item.toLowerCase())
);

type TmdbLookupResult = {
  tmdbId?: string;
  poster?: string;
  title?: string;
  originalTitle?: string;
  year?: string;
  mediaType?: 'movie' | 'tv';
  imdbId?: string;
};

type DoubanSuggestResult = {
  id?: number;
  title?: string;
};

const tmdbLookupCache = new Map<string, TmdbLookupResult | null>();
const doubanSuggestCache = new Map<string, DoubanSuggestResult | null>();

const parseTmdbId = (value?: string | number | null) => {
  if (value === undefined || value === null) return undefined;
  const raw = String(value).trim();
  if (!raw) return undefined;
  if (raw.startsWith('tmdb:')) return raw;
  const match = raw.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/i);
  if (match?.[1]) return `tmdb:${match[1]}`;
  if (/^\d+$/.test(raw)) return `tmdb:${raw}`;
  return undefined;
};

export interface VideoCardProps {
  id?: string;
  source?: string;
  title?: string; // Original title
  title_en?: string; // English title
  query?: string;
  poster?: string;
  posterAlt?: string[];
  posterDouban?: string;
  posterTmdb?: string;
  doubanUrl?: string;
  tmdbUrl?: string;
  episodes?: number;
  source_name?: string;
  source_names?: string[];
  progress?: number;
  progressHeightClassName?: string;
  progressTrackClassName?: string;
  progressFillClassName?: string;
  year?: string;
  from: 'playrecord' | 'favorite' | 'search' | 'douban';
  currentEpisode?: number;
  douban_id?: number;
  imdb_id?: string;
  onDelete?: () => void;
  rate?: string;
  type?: string;
  isBangumi?: boolean;
  isAggregate?: boolean;
  origin?: 'vod' | 'live';
  size?: 'sm' | 'md' | 'lg';
  compactMeta?: boolean;
}

export type VideoCardHandle = {
  setEpisodes: (episodes?: number) => void;
  setSourceNames: (names?: string[]) => void;
  setDoubanId: (id?: number) => void;
};

const VideoCard = forwardRef<VideoCardHandle, VideoCardProps>(
  function VideoCard(
    {
      id,
      title = '',
      title_en,
      query = '',
      poster = '',
      posterAlt,
      posterDouban,
      posterTmdb,
      tmdbUrl,
      episodes,
      source,
      source_name,
      source_names,
      progress = 0,
      progressHeightClassName,
      progressTrackClassName,
      progressFillClassName,
      year,
      from,
      currentEpisode,
      douban_id,
      imdb_id,
      onDelete,
      rate,
      type = '',
      isBangumi = false,
      isAggregate = false,
      origin = 'vod',
      size = 'md',
      compactMeta = false,
    }: VideoCardProps,
    ref
  ) {
    const router = useRouter();
    const { screenMode } = useDeviceInfo();
    const isTV = screenMode === 'tv';
    const [favorited, setFavorited] = useState(false);
    const [showMobileActions, setShowMobileActions] = useState(false);
    const [searchFavorited, setSearchFavorited] = useState<boolean | null>(
      null
    ); // 搜索结果的收藏状态
    const [resolvedQuery, setResolvedQuery] = useState<string>(query || '');
    const [englishTitle, setEnglishTitle] = useState<string | undefined>(
      undefined
    );
    const [imdbIdState, setImdbIdState] = useState<string | undefined>(
      imdb_id
    );
    const [tmdbIdState, setTmdbIdState] = useState<string | undefined>(() => {
      const fromId = parseTmdbId(id);
      if (fromId) return fromId;
      return parseTmdbId(tmdbUrl);
    });
    const [posterTmdbState, setPosterTmdbState] = useState<string | undefined>(
      posterTmdb
    );

    // 可外部修改的可控字段
    const [dynamicEpisodes, setDynamicEpisodes] = useState<number | undefined>(
      episodes
    );
    const [dynamicSourceNames, setDynamicSourceNames] = useState<
      string[] | undefined
    >(source_names);
    const [dynamicDoubanId, setDynamicDoubanId] = useState<number | undefined>(
      douban_id
    );

    useEffect(() => {
      setDynamicEpisodes(episodes);
    }, [episodes]);

    useEffect(() => {
      setDynamicSourceNames(source_names);
    }, [source_names]);

    useEffect(() => {
      setDynamicDoubanId(douban_id);
    }, [douban_id]);
    
    useEffect(() => {
      setResolvedQuery(query || '');
    }, [query]);

    useEffect(() => {
      if (posterTmdb) {
        setPosterTmdbState(posterTmdb);
      }
    }, [posterTmdb]);

    useEffect(() => {
      if (tmdbIdState) return;
      const next = parseTmdbId(id) || parseTmdbId(tmdbUrl);
      if (next) {
        setTmdbIdState(next);
      }
    }, [id, tmdbUrl, tmdbIdState]);

    const sizeStyles = useMemo(() => {
      switch (size) {
        case 'lg':
          return {
            container: 'min-h-[360px]',
            poster: 'min-h-[320px]',
            title: 'text-base sm:text-lg',
            meta: 'text-xs',
          };
        case 'sm':
          return {
            container: 'min-h-[200px]',
            poster: 'min-h-[180px]',
            title: 'text-sm',
            meta: 'text-[11px]',
          };
        default:
          return {
            container: 'min-h-[260px]',
            poster: 'min-h-[220px]',
            title: 'text-sm sm:text-base',
            meta: 'text-xs',
          };
      }
    }, [size]);

    useImperativeHandle(ref, () => ({
      setEpisodes: (eps?: number) => setDynamicEpisodes(eps),
      setSourceNames: (names?: string[]) => setDynamicSourceNames(names),
      setDoubanId: (id?: number) => setDynamicDoubanId(id),
    }));

    const extractImdbId = useCallback((value?: string | null) => {
      const match = value?.match(/(tt\d{5,}|imdbt\d+)/i);
      return match ? match[0] : undefined;
    }, []);

    const sanitizeEnglishTitle = useCallback((value?: string | null) => {
      if (!value) {
        return undefined;
      }

      let candidate = value.trim();
      if (!candidate) {
        return undefined;
      }

      candidate = candidate.replace(/\s*-\s*IMDb\s*$/i, '').trim();

      const lowered = candidate.toLowerCase();
      if (
        ENGLISH_TITLE_PLACEHOLDERS.has(lowered) ||
        lowered.startsWith('imdbt:') ||
        /^tt\d{5,}$/i.test(candidate)
      ) {
        return undefined;
      }

      return candidate;
    }, []);

    const hasChinese = useCallback(
      (value?: string) => (value ? /[\u4e00-\u9fff]/.test(value) : false),
      []
    );

    const doubanDetailRef = useRef<number | null>(null);

    useEffect(() => {
      const sanitized = sanitizeEnglishTitle(title_en);
      setEnglishTitle(sanitized);

      const idFromTitle = extractImdbId(title_en);
      if (idFromTitle) {
        setImdbIdState((prev) => prev ?? idFromTitle);
      }
    }, [sanitizeEnglishTitle, extractImdbId, title_en, douban_id]);

    useEffect(() => {
      const normalizedDoubanId = Number(douban_id);
      if (!normalizedDoubanId || Number.isNaN(normalizedDoubanId)) return;
      const needsDetail = englishTitle === undefined || !imdbIdState;
      if (!needsDetail) return;
      if (doubanDetailRef.current === normalizedDoubanId) return;
      doubanDetailRef.current = normalizedDoubanId;

      let cancelled = false;

      const fetchEnglishTitle = async () => {
        try {
          const detail = await getDoubanSubjectDetail(normalizedDoubanId);
          const imdbEnglish = detail?.imdbTitle;
          const imdbId = detail?.imdbId;
          const original = detail?.original_title;

          if (imdbId) {
            setImdbIdState((prev) => (prev ? prev : imdbId));
          } else {
            const extractedOriginalId = extractImdbId(original);
            if (extractedOriginalId) {
              setImdbIdState((prev) => (prev ? prev : extractedOriginalId));
            }
          }

          const resolved = sanitizeEnglishTitle(imdbEnglish);

          if (!cancelled) {
            if (resolved) {
              setEnglishTitle(resolved);
            }

            if (imdbId && !resolved) {
              try {
                const response = await fetch(
                  `/api/imdb?id=${encodeURIComponent(imdbId)}`,
                  { cache: 'force-cache' }
                );
                if (response.ok) {
                  const data = (await response.json()) as {
                    title?: string;
                  };
                  const imdbScraped = sanitizeEnglishTitle(data.title);
                  if (imdbScraped && !cancelled) {
                    setEnglishTitle(imdbScraped);
                  }
                }
              } catch (error) {
                /* ignore imdb fetch errors */
              }
            }

            if (detail?.title && !hasChinese(resolvedQuery)) {
              setResolvedQuery(detail.title);
            }
          }
        } catch (error) {
          /* ignore douban detail errors */
        }
      };

      fetchEnglishTitle();

      return () => {
        cancelled = true;
      };
    }, [
      douban_id,
      englishTitle,
      imdbIdState,
      sanitizeEnglishTitle,
      extractImdbId,
      hasChinese,
      resolvedQuery,
    ]);

    const actualTitle = title;
    const actualPoster = poster;
    const fallbackPosters = useMemo(() => {
      const urls = new Set<string>();
      const add = (url?: string) => {
        if (url) urls.add(url);
      };
      add(poster);
      posterAlt?.forEach(add);
      add(posterDouban);
      add(posterTmdbState);
      return Array.from(urls);
    }, [poster, posterAlt, posterDouban, posterTmdbState]);
    const actualSource = source;
    const actualId = id;
    const actualDoubanId = dynamicDoubanId;
    const actualEpisodes = dynamicEpisodes;
    const actualYear = year;
    const actualQuery = resolvedQuery || '';
    const actualSearchType = isAggregate
      ? actualEpisodes && actualEpisodes === 1
        ? 'movie'
        : 'tv'
      : type;
    const personId = useMemo(() => {
      if (actualSearchType !== 'person') return undefined;
      return parseTmdbId(actualId) || parseTmdbId(tmdbUrl);
    }, [actualId, actualSearchType, tmdbUrl]);
    const personUrl = useMemo(() => {
      if (!personId) return '/person';
      const normalized = personId.replace(/^tmdb:/, '');
      return normalized ? `/person/${encodeURIComponent(normalized)}` : '/person';
    }, [personId]);
    const englishTitleToShow = useMemo(() => {
      const sanitized = sanitizeEnglishTitle(englishTitle);
      if (sanitized) {
        return sanitized;
      }
      if (imdbIdState) {
        return imdbIdState;
      }
      return 'NA';
    }, [englishTitle, imdbIdState, sanitizeEnglishTitle]);

    const convertDisplayText = useCallback((value?: string) => {
      if (!value) return undefined;
      const converted = convertToTraditional(value);
      return converted || value;
    }, []);

    const traditionalSourceName = useMemo(
      () => convertDisplayText(source_name),
      [convertDisplayText, source_name]
    );

    const uniqueSourceNames = useMemo(() => {
      if (!dynamicSourceNames) return undefined;
      return Array.from(new Set(dynamicSourceNames));
    }, [dynamicSourceNames]);

    const displaySourceNames = useMemo(
      () => uniqueSourceNames?.map((name) => convertDisplayText(name) ?? name),
      [convertDisplayText, uniqueSourceNames]
    );

    const traditionalTitle = useMemo(
      () => convertToTraditional(actualTitle),
      [actualTitle]
    );

    useEffect(() => {
      if (dynamicDoubanId && Number(dynamicDoubanId) > 0) return;
      const candidates = [
        imdbIdState?.trim(),
        resolvedQuery?.trim(),
        actualTitle?.trim(),
        englishTitle?.trim(),
      ].filter(Boolean) as string[];
      if (!candidates.length) return;

      const isTmdb =
        (source_name || '').toLowerCase() === 'tmdb' ||
        (actualId || '').toString().startsWith('tmdb:');
      const shouldUpdateTitle = !hasChinese(resolvedQuery);

      let cancelled = false;

      const resolveFromCache = (key: string) => {
        const cached = doubanSuggestCache.get(key);
        if (!cached) return null;
        return cached;
      };

      const applySuggestion = (suggestion: DoubanSuggestResult) => {
        if (!suggestion?.id || cancelled) return true;
        if (!dynamicDoubanId) {
          setDynamicDoubanId(suggestion.id);
        }
        if (suggestion.title && shouldUpdateTitle) {
          setResolvedQuery(suggestion.title);
        }
        return true;
      };

      const run = async () => {
        for (const candidate of candidates) {
          const key = candidate.toLowerCase();
          if (doubanSuggestCache.has(key)) {
            const cached = resolveFromCache(key);
            if (cached?.id && applySuggestion(cached)) return;
            continue;
          }

          try {
            const suggestRes = await fetch(
              `/api/douban/suggest?q=${encodeURIComponent(candidate)}`,
              { cache: 'no-store' }
            );
            if (!suggestRes.ok) {
              doubanSuggestCache.set(key, null);
              continue;
            }
            const data = await suggestRes.json();
            const first = Array.isArray(data?.items) ? data.items[0] : null;
            const suggestion =
              first?.id && !Number.isNaN(Number(first.id))
                ? {
                    id: Number(first.id),
                    title: typeof first.title === 'string' ? first.title : undefined,
                  }
                : null;
            doubanSuggestCache.set(key, suggestion);
            if (suggestion?.id && applySuggestion(suggestion)) return;
          } catch {
            doubanSuggestCache.set(key, null);
          }
        }

        if (isTmdb && shouldUpdateTitle) {
          try {
            const res = await fetch(
              `/api/title-convert?title=${encodeURIComponent(
                actualTitle || resolvedQuery
              )}`,
              { cache: 'force-cache' }
            );
            if (!res.ok) return;
            const data = await res.json();
            if (data?.title && !cancelled) {
              setResolvedQuery(data.title);
            }
          } catch {
            // ignore
          }
        }
      };
      run();
      return () => {
        cancelled = true;
      };
    }, [
      dynamicDoubanId,
      imdbIdState,
      resolvedQuery,
      actualTitle,
      englishTitle,
      source_name,
      actualId,
      hasChinese,
    ]);

    const tmdbLookupRef = useRef<string | null>(null);

    useEffect(() => {
      const tmdbIdValue = tmdbIdState?.startsWith('tmdb:')
        ? tmdbIdState
        : tmdbIdState
        ? `tmdb:${tmdbIdState}`
        : undefined;
      const tmdbIdRaw = tmdbIdValue?.replace(/^tmdb:/, '');
      const normalizedImdbId = imdbIdState?.trim();
      const normalizedTitle = actualTitle?.trim();

      const lookupKey = tmdbIdRaw
        ? `tmdb:${tmdbIdRaw}`
        : normalizedImdbId
        ? `imdb:${normalizedImdbId}`
        : normalizedTitle
        ? `title:${normalizedTitle}-${actualYear || ''}-${actualSearchType || ''}`
        : '';

      if (!lookupKey) return;
      if (tmdbLookupRef.current === lookupKey) return;

      const needsPoster = !posterTmdbState;
      const needsId = !tmdbIdRaw;
      const needsImdb = !normalizedImdbId;

      if (!needsPoster && !needsId && !needsImdb) return;

      tmdbLookupRef.current = lookupKey;

      const cached = tmdbLookupCache.get(lookupKey);
      if (cached !== undefined) {
        if (cached) {
          if (cached.tmdbId && !tmdbIdRaw) {
            setTmdbIdState(cached.tmdbId);
          }
          if (cached.imdbId && !normalizedImdbId) {
            setImdbIdState((prev) => prev ?? cached.imdbId);
          }
          if (cached.poster && !posterTmdbState) {
            setPosterTmdbState(cached.poster);
          }
          if (cached.originalTitle && englishTitle === undefined) {
            const sanitized = sanitizeEnglishTitle(cached.originalTitle);
            if (sanitized) setEnglishTitle(sanitized);
          }
        }
        return;
      }

      let cancelled = false;

      const run = async () => {
        try {
          const params = new URLSearchParams();
          if (tmdbIdRaw) {
            params.set('tmdbId', tmdbIdRaw);
          } else if (normalizedImdbId) {
            params.set('imdbId', normalizedImdbId);
          } else if (normalizedTitle) {
            params.set('title', normalizedTitle);
          }
          if (actualYear) params.set('year', actualYear);
          if (actualSearchType) params.set('type', actualSearchType);

          const res = await fetch(`/api/tmdb/lookup?${params.toString()}`, {
            cache: 'force-cache',
          });
          if (!res.ok) {
            tmdbLookupCache.set(lookupKey, null);
            return;
          }
          const data = (await res.json()) as TmdbLookupResult;
          tmdbLookupCache.set(lookupKey, data);
          if (cancelled || !data) return;

          if (data.tmdbId && !tmdbIdRaw) {
            setTmdbIdState(data.tmdbId);
          }
          if (data.imdbId && !normalizedImdbId) {
            setImdbIdState((prev) => prev ?? data.imdbId);
          }
          if (data.poster && !posterTmdbState) {
            setPosterTmdbState(data.poster);
          }
          if (data.originalTitle && englishTitle === undefined) {
            const sanitized = sanitizeEnglishTitle(data.originalTitle);
            if (sanitized) setEnglishTitle(sanitized);
          }
        } catch {
          tmdbLookupCache.set(lookupKey, null);
        }
      };

      run();

      return () => {
        cancelled = true;
      };
    }, [
      tmdbIdState,
      imdbIdState,
      actualTitle,
      actualYear,
      actualSearchType,
      posterTmdbState,
      englishTitle,
      sanitizeEnglishTitle,
    ]);
    const transparentPixel =
      'data:image/gif;base64,R0lGODlhAQABAAAAACw=';

    const posterCacheKey = useMemo(() => {
      if (dynamicDoubanId && Number(dynamicDoubanId) > 0) {
        return `douban:${dynamicDoubanId}`;
      }
      if (imdbIdState) {
        return `imdb:${imdbIdState}`;
      }
      if (tmdbIdState) {
        return `tmdb:${tmdbIdState.replace(/^tmdb:/, '')}`;
      }
      return undefined;
    }, [dynamicDoubanId, imdbIdState, tmdbIdState]);

    const directCandidates = useMemo(
      () => fallbackPosters.filter(Boolean),
      [fallbackPosters]
    );
    const proxyCandidates = useMemo(
      () =>
        fallbackPosters
          .map((url) =>
            processImageUrl(url, {
              doubanId: dynamicDoubanId,
              imdbId: imdbIdState,
              preferCached: true,
            })
          )
          .filter(Boolean),
      [fallbackPosters, dynamicDoubanId, imdbIdState]
    );
    const posterCandidates = useMemo(() => {
      const set = new Set<string>([...directCandidates, ...proxyCandidates]);
      return Array.from(set);
    }, [directCandidates, proxyCandidates]);
    const directCandidateSet = useMemo(() => {
      const normalize = (url: string) => url.split('?')[0];
      return new Set(directCandidates.map(normalize));
    }, [directCandidates]);

    const processedPosterUrl = useMemo(
      () => posterCandidates[0] || '',
      [posterCandidates]
    );

    const [posterSrc, setPosterSrc] = useState<string>(processedPosterUrl || '');
    const uploadInFlightRef = useRef(false);
    const retryCountRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const backfillKeyRef = useRef<string | null>(null);

    useEffect(() => {
      retryCountRef.current = 0;
    }, [posterCandidates]);

    useEffect(() => {
      let cancelled = false;
      const loadPoster = async () => {
        if (!posterCandidates.length) {
          setPosterSrc('');
          return;
        }
        if (typeof window !== 'undefined' && 'caches' in window && posterCacheKey) {
          try {
            const cache = await caches.open('moontv-poster-cache');
            const match = await cache.match(posterCacheKey);
            if (match) {
              if (!cancelled) setPosterSrc(processedPosterUrl);
              return;
            }
            const response = await fetch(processedPosterUrl, { cache: 'force-cache' });
            if (response.ok) {
              cache.put(posterCacheKey, response.clone());
              if (!cancelled) setPosterSrc(processedPosterUrl);
              return;
            }
          } catch (err) {
            // Swallow poster cache failures; not critical for UI.
          }
        }

        const backfillRemoteCache = async () => {
          const proxyCandidate = proxyCandidates[0];
          if (!proxyCandidate) return;
          if (uploadInFlightRef.current) return;
          if (backfillKeyRef.current === proxyCandidate) return;
          uploadInFlightRef.current = true;
          backfillKeyRef.current = proxyCandidate;
          try {
            await fetch(
              `${proxyCandidate}${proxyCandidate.includes('?') ? '&' : '?'}bust=${Date.now()}`,
              { cache: 'no-store' }
            ).catch(() => {});
          } finally {
            uploadInFlightRef.current = false;
          }
        };

        // Try direct then proxy in order
        try {
          for (const candidate of posterCandidates) {
            const isProxy = candidate.includes('/api/image-proxy');
            const resp = await fetch(candidate, {
              cache: isProxy ? 'force-cache' : 'no-store',
              mode: isProxy ? 'cors' : 'cors',
            });
            if (resp.ok) {
              if (!cancelled) setPosterSrc(candidate);
              if (!isProxy) backfillRemoteCache();
              return;
            }
          }
        } catch {
          // fall through to direct
        }

        if (!cancelled) {
          setPosterSrc(processedPosterUrl || '');
        }

        // Client-side attempt to backfill remote cache if missing and allowed.
        backfillRemoteCache();
      };

      loadPoster();
      return () => {
        cancelled = true;
        if (retryTimerRef.current) {
          clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
      };
    }, [directCandidates, proxyCandidates, posterCandidates, processedPosterUrl, posterCacheKey, dynamicDoubanId, imdbIdState]);

    // 获取收藏状态（搜索结果页面不检查）
    useEffect(() => {
      if (from === 'douban' || from === 'search' || !actualSource || !actualId)
        return;

      const fetchFavoriteStatus = async () => {
        try {
          const fav = await isFavorited(actualSource, actualId);
          setFavorited(fav);
        } catch (err) {
          throw new Error('檢查收藏狀態失敗');
        }
      };

      fetchFavoriteStatus();

      // 监听收藏状态更新事件
      const storageKey = generateStorageKey(actualSource, actualId);
      const unsubscribe = subscribeToDataUpdates(
        'favoritesUpdated',
        (newFavorites: Record<string, any>) => {
          // 检查当前项目是否在新的收藏列表中
          const isNowFavorited = !!newFavorites[storageKey];
          setFavorited(isNowFavorited);
        }
      );

      return unsubscribe;
    }, [from, actualSource, actualId]);

    const handleToggleFavorite = useCallback(
      async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (from === 'douban' || !actualSource || !actualId) return;

        try {
          // 确定当前收藏状态
          const currentFavorited =
            from === 'search' ? searchFavorited : favorited;

          if (currentFavorited) {
            // 如果已收藏，删除收藏
            await deleteFavorite(actualSource, actualId);
            if (from === 'search') {
              setSearchFavorited(false);
            } else {
              setFavorited(false);
            }
          } else {
            // 如果未收藏，添加收藏
            await saveFavorite(actualSource, actualId, {
              title: actualTitle,
              source_name: source_name || '',
              year: actualYear || '',
              cover: actualPoster,
              total_episodes: actualEpisodes ?? 1,
              save_time: Date.now(),
            });
            if (from === 'search') {
              setSearchFavorited(true);
            } else {
              setFavorited(true);
            }
          }
        } catch (err) {
          throw new Error('切換收藏狀態失敗');
        }
      },
      [
        from,
        actualSource,
        actualId,
        actualTitle,
        source_name,
        actualYear,
        actualPoster,
        actualEpisodes,
        favorited,
        searchFavorited,
      ]
    );

    const handleDeleteRecord = useCallback(
      async (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (from !== 'playrecord' || !actualSource || !actualId) return;
        try {
          await deletePlayRecord(actualSource, actualId);
          onDelete?.();
        } catch (err) {
          throw new Error('刪除播放記錄失敗');
        }
      },
      [from, actualSource, actualId, onDelete]
    );

    const longPressTriggeredRef = useRef(false);

    const detailPath = isTV ? '/play/tvdetail' : '/play';
    const playPath = isTV ? '/play/tvplay' : '/play';

    const buildSearchUrl = useCallback(
      () => {
        if (actualSearchType === 'person') {
          return personUrl;
        }
        const doubanParam =
          dynamicDoubanId && Number.isFinite(Number(dynamicDoubanId))
            ? `&douban_id=${encodeURIComponent(String(dynamicDoubanId))}`
            : '';
        const imdbParam = imdbIdState
          ? `&imdbId=${encodeURIComponent(imdbIdState)}`
          : '';
        const posterParam =
          actualPoster && actualPoster.trim()
            ? `&poster=${encodeURIComponent(actualPoster.trim())}`
            : '';
        const rateParam = rate ? `&rate=${encodeURIComponent(rate)}` : '';
        return `${detailPath}?title=${encodeURIComponent(actualTitle.trim())}${
          actualYear ? `&year=${actualYear}` : ''
        }${actualSearchType ? `&stype=${actualSearchType}` : ''}${
          isAggregate ? '&prefer=true' : ''
        }${
          actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''
        }${doubanParam}${imdbParam}${posterParam}${rateParam}`;
      },
      [
        dynamicDoubanId,
        imdbIdState,
        actualPoster,
        actualTitle,
        actualYear,
        actualSearchType,
        isAggregate,
        actualQuery,
        rate,
        detailPath,
        personUrl,
      ]
    );

    const handleClick = useCallback(() => {
      longPressTriggeredRef.current = false;
      if (actualSearchType === 'person') {
        router.push(personUrl);
        return;
      }
      const doubanParam =
        dynamicDoubanId && Number.isFinite(Number(dynamicDoubanId))
          ? `&douban_id=${encodeURIComponent(String(dynamicDoubanId))}`
          : '';
      const imdbParam = imdbIdState
        ? `&imdbId=${encodeURIComponent(imdbIdState)}`
        : '';
      if (origin === 'live' && actualSource && actualId) {
        // 直播内容跳转到直播页面
        const url = `/live?source=${actualSource.replace(
          'live_',
          ''
        )}&id=${actualId.replace('live_', '')}`;
        router.push(url);
      } else if (
        from === 'douban' ||
        isAggregate ||
        !actualSource ||
        !actualId
      ) {
        const posterParam =
          actualPoster && actualPoster.trim()
            ? `&poster=${encodeURIComponent(actualPoster.trim())}`
            : '';
        const rateParam = rate ? `&rate=${encodeURIComponent(rate)}` : '';
        const url = `${detailPath}?title=${encodeURIComponent(actualTitle.trim())}${
          actualYear ? `&year=${actualYear}` : ''
        }${actualSearchType ? `&stype=${actualSearchType}` : ''}${
          isAggregate ? '&prefer=true' : ''
        }${
          actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''
        }${doubanParam}${imdbParam}${posterParam}${rateParam}`;
        router.push(url);
      } else if (actualSource && actualId) {
        const url = `${playPath}?source=${actualSource}&id=${actualId}&title=${encodeURIComponent(
          actualTitle
        )}${actualYear ? `&year=${actualYear}` : ''}${
          isAggregate ? '&prefer=true' : ''
        }${
          actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''
        }${actualSearchType ? `&stype=${actualSearchType}` : ''}${doubanParam}${imdbParam}`;
        router.push(url);
      }
    }, [
      origin,
      from,
      actualSource,
      actualId,
      router,
      actualTitle,
      actualYear,
      isAggregate,
      actualQuery,
      actualSearchType,
      dynamicDoubanId,
      imdbIdState,
      detailPath,
      playPath,
      personUrl,
    ]);

    const handleIntro = useCallback(() => {
      longPressTriggeredRef.current = false;
      const url = buildSearchUrl();
      router.push(url);
    }, [buildSearchUrl, router]);

    const handleCardClick = useCallback(() => {
      if (longPressTriggeredRef.current) {
        longPressTriggeredRef.current = false;
        return;
      }
      if (actualSearchType === 'person') {
        router.push(personUrl);
        return;
      }
      if (origin === 'live' || from === 'playrecord') {
        handleClick();
        return;
      }
      handleIntro();
    }, [from, origin, handleClick, handleIntro]);

    // 新标签页播放处理函数
    const handlePlayInNewTab = useCallback(() => {
      if (actualSearchType === 'person') {
        window.open(personUrl, '_blank');
        return;
      }
      const doubanParam =
        dynamicDoubanId && Number.isFinite(Number(dynamicDoubanId))
          ? `&douban_id=${encodeURIComponent(String(dynamicDoubanId))}`
          : '';
      const imdbParam = imdbIdState
        ? `&imdbId=${encodeURIComponent(imdbIdState)}`
        : '';
      if (origin === 'live' && actualSource && actualId) {
        // 直播内容跳转到直播页面
        const url = `/live?source=${actualSource.replace(
          'live_',
          ''
        )}&id=${actualId.replace('live_', '')}`;
        window.open(url, '_blank');
      } else if (
        from === 'douban' ||
        isAggregate ||
        !actualSource ||
        !actualId
      ) {
        const posterParam =
          actualPoster && actualPoster.trim()
            ? `&poster=${encodeURIComponent(actualPoster.trim())}`
            : '';
        const rateParam = rate ? `&rate=${encodeURIComponent(rate)}` : '';
        const url = `${detailPath}?title=${encodeURIComponent(actualTitle.trim())}${
          actualYear ? `&year=${actualYear}` : ''
        }${actualSearchType ? `&stype=${actualSearchType}` : ''}${
          isAggregate ? '&prefer=true' : ''
        }${
          actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''
        }${doubanParam}${imdbParam}${posterParam}${rateParam}`;
        window.open(url, '_blank');
      } else if (actualSource && actualId) {
        const url = `${playPath}?source=${actualSource}&id=${actualId}&title=${encodeURIComponent(
          actualTitle
        )}${actualYear ? `&year=${actualYear}` : ''}${
          isAggregate ? '&prefer=true' : ''
        }${
          actualQuery ? `&stitle=${encodeURIComponent(actualQuery.trim())}` : ''
        }${actualSearchType ? `&stype=${actualSearchType}` : ''}${doubanParam}${imdbParam}`;
        window.open(url, '_blank');
      }
    }, [
      origin,
      from,
      actualSource,
      actualId,
      actualTitle,
      actualYear,
      isAggregate,
      actualQuery,
      actualSearchType,
      dynamicDoubanId,
      imdbIdState,
      detailPath,
      playPath,
      personUrl,
    ]);

    // 检查搜索结果的收藏状态
    const checkSearchFavoriteStatus = useCallback(async () => {
      if (
        from === 'search' &&
        !isAggregate &&
        actualSource &&
        actualId &&
        searchFavorited === null
      ) {
        try {
          const fav = await isFavorited(actualSource, actualId);
          setSearchFavorited(fav);
        } catch (err) {
          setSearchFavorited(false);
        }
      }
    }, [from, isAggregate, actualSource, actualId, searchFavorited]);

    // 长按操作
    const handleLongPress = useCallback(() => {
      if (!showMobileActions) {
        // 防止重复触发
        // 立即显示菜单，避免等待数据加载导致动画卡顿
        setShowMobileActions(true);

        // 异步检查收藏状态，不阻塞菜单显示
        if (
          from === 'search' &&
          !isAggregate &&
          actualSource &&
          actualId &&
          searchFavorited === null
        ) {
          checkSearchFavoriteStatus();
        }
      }
    }, [
      showMobileActions,
      from,
      isAggregate,
      actualSource,
      actualId,
      searchFavorited,
      checkSearchFavoriteStatus,
    ]);

    // 长按手势hook
    const longPressProps = useLongPress({
      onLongPress: () => {
        longPressTriggeredRef.current = true;
        handleLongPress();
      },
      onClick: handleCardClick,
      longPressDelay: 500,
    });

    const config = useMemo(() => {
      const configs = {
        playrecord: {
          showSourceName: true,
          showProgress: true,
          showPlayButton: true,
          showHeart: true,
          showCheckCircle: true,
          showDoubanLink: false,
          showRating: false,
          showYear: false,
        },
        favorite: {
          showSourceName: true,
          showProgress: false,
          showPlayButton: true,
          showHeart: true,
          showCheckCircle: false,
          showDoubanLink: false,
          showRating: false,
          showYear: false,
        },
        search: {
          showSourceName: true,
          showProgress: false,
          showPlayButton: true,
          showHeart: true, // 移动端菜单中需要显示收藏选项
          showCheckCircle: false,
          showDoubanLink: true, // 移动端菜单中显示豆瓣链接
          showRating: false,
          showYear: true,
        },
        douban: {
          showSourceName: false,
          showProgress: false,
          showPlayButton: true,
          showHeart: false,
          showCheckCircle: false,
          showDoubanLink: true,
          showRating: !!rate,
          showYear: false,
        },
      };
      return configs[from] || configs.search;
    }, [from, isAggregate, douban_id, rate]);

    const showProgress =
      config.showProgress && progress !== undefined && !compactMeta;

    // 移动端操作菜单配置
    const mobileActions = useMemo(() => {
      const actions = [];

      // 播放操作
      if (config.showPlayButton) {
        actions.push({
          id: 'play',
          label: origin === 'live' ? '觀看直播' : '播放',
          icon: <PlayCircleIcon size={20} />,
          onClick: handleClick,
          color: 'primary' as const,
        });

        // 新标签页播放
        actions.push({
          id: 'play-new-tab',
          label: origin === 'live' ? '新分頁觀看' : '新分頁播放',
          icon: <ExternalLink size={20} />,
          onClick: handlePlayInNewTab,
          color: 'default' as const,
        });
      }

      // 聚合源信息 - 直接在菜单中展示，不需要单独的操作项

      // 收藏/取消收藏操作
      if (config.showHeart && from !== 'douban' && actualSource && actualId) {
        const currentFavorited =
          from === 'search' ? searchFavorited : favorited;

        if (from === 'search') {
          // 搜索结果：根据加载状态显示不同的选项
          if (searchFavorited !== null) {
            // 已加载完成，显示实际的收藏状态
            actions.push({
              id: 'favorite',
              label: currentFavorited ? '取消收藏' : '加入收藏',
              icon: currentFavorited ? (
                <Heart size={20} className='fill-red-600 stroke-red-600' />
              ) : (
                <Heart size={20} className='fill-transparent stroke-red-500' />
              ),
              onClick: () => {
                const mockEvent = {
                  preventDefault: () => {},
                  stopPropagation: () => {},
                } as React.MouseEvent;
                handleToggleFavorite(mockEvent);
              },
              color: currentFavorited
                ? ('danger' as const)
                : ('default' as const),
            });
          } else {
            // 正在加载中，显示占位项
            actions.push({
              id: 'favorite-loading',
              label: '收藏載入中...',
              icon: <Heart size={20} />,
              onClick: () => {}, // 加载中时不响应点击
              disabled: true,
            });
          }
        } else {
          // 非搜索结果：直接显示收藏选项
          actions.push({
            id: 'favorite',
            label: currentFavorited ? '取消收藏' : '加入收藏',
            icon: currentFavorited ? (
              <Heart size={20} className='fill-red-600 stroke-red-600' />
            ) : (
              <Heart size={20} className='fill-transparent stroke-red-500' />
            ),
            onClick: () => {
              const mockEvent = {
                preventDefault: () => {},
                stopPropagation: () => {},
              } as React.MouseEvent;
              handleToggleFavorite(mockEvent);
            },
            color: currentFavorited
              ? ('danger' as const)
              : ('default' as const),
          });
        }
      }

      // 删除播放记录操作
      if (
        config.showCheckCircle &&
        from === 'playrecord' &&
        actualSource &&
        actualId
      ) {
        actions.push({
          id: 'delete',
          label: '刪除記錄',
          icon: <Trash2 size={20} />,
          onClick: () => {
            const mockEvent = {
              preventDefault: () => {},
              stopPropagation: () => {},
            } as React.MouseEvent;
            handleDeleteRecord(mockEvent);
          },
          color: 'danger' as const,
        });
      }

      // 豆瓣链接操作
      if (config.showDoubanLink && actualDoubanId && actualDoubanId !== 0) {
        actions.push({
          id: 'douban',
          label: isBangumi ? 'Bangumi 詳情' : '豆瓣詳情',
          icon: <Link size={20} />,
          onClick: () => {
            const url = isBangumi
              ? `https://bgm.tv/subject/${actualDoubanId.toString()}`
              : `https://movie.douban.com/subject/${actualDoubanId.toString()}`;
            window.open(url, '_blank', 'noopener,noreferrer');
          },
          color: 'default' as const,
        });
      }

      return actions;
    }, [
      config,
      from,
      actualSource,
      actualId,
      favorited,
      searchFavorited,
      actualDoubanId,
      isBangumi,
      isAggregate,
      dynamicSourceNames,
      handleClick,
      handleToggleFavorite,
      handleDeleteRecord,
    ]);

    return (
      <>
        <div
          className={`group relative w-full rounded-lg bg-transparent cursor-pointer transition-all duration-300 ease-in-out hover:scale-[1.05] hover:z-[500] focus-visible:scale-[1.1] focus-visible:outline-none focus-visible:ring-0 focus-visible:drop-shadow-[0_0_12px_rgba(16,185,129,0.35)] focus-visible:translate-y-[-2px] focus-visible:translate-x-[2px] ${sizeStyles.container}`}
          onClick={handleCardClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleCardClick();
            }
          }}
          {...longPressProps}
          tabIndex={0}
          role='button'
          aria-label={traditionalTitle || actualTitle}
          data-tv-focusable='true'
          style={
            {
              // 禁用所有默认的长按和选择效果
              WebkitUserSelect: 'none',
              userSelect: 'none',
              WebkitTouchCallout: 'none',
              WebkitTapHighlightColor: 'transparent',
              touchAction: 'manipulation',
              // 禁用右键菜单和长按菜单
              pointerEvents: 'auto',
            } as React.CSSProperties
          }
          onContextMenu={(e) => {
            // 阻止默认右键菜单
            e.preventDefault();
            e.stopPropagation();

            // 右键弹出操作菜单
            setShowMobileActions(true);

            // 异步检查收藏状态，不阻塞菜单显示
            if (
              from === 'search' &&
              !isAggregate &&
              actualSource &&
              actualId &&
              searchFavorited === null
            ) {
              checkSearchFavoriteStatus();
            }

            return false;
          }}
          onDragStart={(e) => {
            // 阻止拖拽
            e.preventDefault();
            return false;
          }}
        >
          {/* 海报容器 */}
          <div
              className={`relative aspect-[2/3] overflow-hidden rounded-lg ${sizeStyles.poster} ${
                origin === 'live'
                  ? 'ring-1 ring-gray-300/80 dark:ring-gray-600/80'
                  : ''
              }`}
            style={
              {
                WebkitUserSelect: 'none',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              } as React.CSSProperties
            }
            onContextMenu={(e) => {
              e.preventDefault();
              return false;
            }}
          >
            {/* 图片 */}
            {posterSrc ? (
              <Image
                src={posterSrc || processedPosterUrl || transparentPixel}
                alt={traditionalTitle || actualTitle}
                fill
                className={origin === 'live' ? 'object-contain' : 'object-cover'}
                referrerPolicy='no-referrer'
                loading='lazy'
                onLoadingComplete={(img) => {
                  if (retryTimerRef.current) {
                    clearTimeout(retryTimerRef.current);
                    retryTimerRef.current = null;
                  }
                  const normalize = (url: string) => url.split('?')[0];
                  const current = normalize(img.currentSrc || img.src || '');
                  if (directCandidateSet.has(current)) {
                    const proxyCandidate = proxyCandidates[0];
                    if (proxyCandidate && backfillKeyRef.current !== proxyCandidate) {
                      fetch(
                        `${proxyCandidate}${proxyCandidate.includes('?') ? '&' : '?'}bust=${Date.now()}`,
                        { cache: 'no-store' }
                      ).catch(() => {});
                      backfillKeyRef.current = proxyCandidate;
                    }
                  }
                }}
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  const directUrl =
                    actualPoster && actualPoster.startsWith('http')
                      ? actualPoster
                      : undefined;
                  const baseCandidates =
                    posterCandidates.length > 0
                      ? posterCandidates
                      : [processedPosterUrl, directUrl].filter(Boolean) as string[];
                  const candidates = baseCandidates.flatMap((url, idx) => {
                    if (!url) return [];
                    if (idx === 0) {
                      return [
                        url,
                        `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`,
                      ];
                    }
                    return [url];
                  });

                  if (retryCountRef.current < candidates.length) {
                    const nextUrl = candidates[retryCountRef.current];
                    retryCountRef.current += 1;
                    if (nextUrl) {
                      img.src = nextUrl;
                      return;
                    }
                  }

                  const base = candidates[0] || processedPosterUrl || directUrl || '';
                  if (!retryTimerRef.current && base) {
                    retryTimerRef.current = setTimeout(() => {
                      retryTimerRef.current = null;
                      retryCountRef.current = 0;
                      const retryUrl = `${base}${base.includes('?') ? '&' : '?'}retry=${Date.now()}`;
                      setPosterSrc(retryUrl);
                    }, 1000);
                  }
                }}
                style={
                  {
                    // 禁用图片的默认长按效果
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                    pointerEvents: 'none', // 图片不响应任何指针事件
                  } as React.CSSProperties
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
                onDragStart={(e) => {
                  e.preventDefault();
                  return false;
                }}
              />
            ) : (
              <div className='absolute inset-0 bg-gradient-to-br from-gray-200/70 via-gray-200/60 to-gray-300/70 dark:from-gray-800/60 dark:via-gray-800/50 dark:to-gray-700/60' />
            )}

            {/* 悬浮遮罩 */}
            <div
              className='absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent transition-opacity duration-300 ease-in-out opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
              style={
                {
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  WebkitTouchCallout: 'none',
                } as React.CSSProperties
              }
              onContextMenu={(e) => {
                e.preventDefault();
                return false;
              }}
            />

            {/* 播放按钮 */}
            {config.showPlayButton && (
              <div
                data-button='true'
                className='absolute inset-0 flex items-center justify-center opacity-0 transition-all duration-300 ease-in-out delay-75 group-hover:opacity-100 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:scale-100'
                onClick={(e) => {
                  e.stopPropagation();
                  handleClick();
                }}
                style={
                  {
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as React.CSSProperties
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
              >
                <PlayCircleIcon
                  size={50}
                  strokeWidth={0.8}
                  className='text-white fill-transparent transition-all duration-300 ease-out hover:fill-green-500 hover:scale-[1.1]'
                  style={
                    {
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                      WebkitTouchCallout: 'none',
                    } as React.CSSProperties
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    return false;
                  }}
                />
              </div>
            )}

            {/* 操作按钮 */}
            {(config.showHeart || config.showCheckCircle) && (
              <div
                data-button='true'
                className='absolute bottom-3 right-3 flex gap-3 opacity-0 translate-y-2 transition-all duration-300 ease-in-out sm:group-hover:opacity-100 sm:group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0'
                style={
                  {
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as React.CSSProperties
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
              >
                {config.showCheckCircle && (
                  <Trash2
                    onClick={handleDeleteRecord}
                    size={20}
                    className='text-white transition-all duration-300 ease-out hover:stroke-red-500 hover:scale-[1.1]'
                    style={
                      {
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                        WebkitTouchCallout: 'none',
                      } as React.CSSProperties
                    }
                    onContextMenu={(e) => {
                      e.preventDefault();
                      return false;
                    }}
                  />
                )}
                {config.showHeart && from !== 'search' && (
                  <Heart
                    onClick={handleToggleFavorite}
                    size={20}
                    className={`transition-all duration-300 ease-out ${
                      favorited
                        ? 'fill-red-600 stroke-red-600'
                        : 'fill-transparent stroke-white hover:stroke-red-400'
                    } hover:scale-[1.1]`}
                    style={
                      {
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                        WebkitTouchCallout: 'none',
                      } as React.CSSProperties
                    }
                    onContextMenu={(e) => {
                      e.preventDefault();
                      return false;
                    }}
                  />
                )}
              </div>
            )}

            {/* 年份徽章 */}
            {config.showYear &&
              actualYear &&
              actualYear !== 'unknown' &&
              actualYear.trim() !== '' && (
                <div
                  className='absolute top-2 bg-black/50 text-white text-xs font-medium px-2 py-1 rounded backdrop-blur-sm shadow-sm transition-all duration-300 ease-out group-hover:opacity-90 left-2'
                  style={
                    {
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                      WebkitTouchCallout: 'none',
                    } as React.CSSProperties
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    return false;
                  }}
                >
                  {actualYear}
                </div>
              )}

            {/* 徽章 */}
            {config.showRating && rate && (
              <div
                className='absolute top-2 right-2 bg-pink-500 text-white text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center shadow-md transition-all duration-300 ease-out group-hover:scale-110'
                style={
                  {
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as React.CSSProperties
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
              >
                {rate}
              </div>
            )}

            {actualEpisodes && actualEpisodes > 1 && (
              <div
                className='absolute top-2 right-2 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded-md shadow-md transition-all duration-300 ease-out group-hover:scale-110'
                style={
                  {
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as React.CSSProperties
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
              >
                {currentEpisode
                  ? `${currentEpisode}/${actualEpisodes}`
                  : actualEpisodes}
              </div>
            )}

            {/* 豆瓣链接 */}
            {config.showDoubanLink &&
              actualDoubanId &&
              actualDoubanId !== 0 && (
                <a
                  href={
                    isBangumi
                      ? `https://bgm.tv/subject/${actualDoubanId.toString()}`
                      : `https://movie.douban.com/subject/${actualDoubanId.toString()}`
                  }
                  target='_blank'
                  rel='noopener noreferrer'
                  onClick={(e) => e.stopPropagation()}
                  className='absolute top-2 left-2 opacity-0 -translate-x-2 transition-all duration-300 ease-in-out delay-100 sm:group-hover:opacity-100 sm:group-hover:translate-x-0'
                  style={
                    {
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                      WebkitTouchCallout: 'none',
                    } as React.CSSProperties
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    return false;
                  }}
                >
                  <div
                    className='bg-green-500 text-white text-xs font-bold w-7 h-7 rounded-full flex items-center justify-center shadow-md hover:bg-green-600 hover:scale-[1.1] transition-all duration-300 ease-out'
                    style={
                      {
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                        WebkitTouchCallout: 'none',
                      } as React.CSSProperties
                    }
                    onContextMenu={(e) => {
                      e.preventDefault();
                      return false;
                    }}
                  >
                    <Link
                      size={16}
                      style={
                        {
                          WebkitUserSelect: 'none',
                          userSelect: 'none',
                          WebkitTouchCallout: 'none',
                          pointerEvents: 'none',
                        } as React.CSSProperties
                      }
                    />
                  </div>
                </a>
              )}

            {/* 聚合播放源指示器 */}
            {isAggregate &&
              uniqueSourceNames &&
              uniqueSourceNames.length > 0 &&
              (() => {
                const uniqueSources = uniqueSourceNames;
                const sourceCount = uniqueSources.length;

                return (
                  <div
                    className='absolute bottom-2 right-2 opacity-0 transition-all duration-300 ease-in-out delay-75 sm:group-hover:opacity-100'
                    style={
                      {
                        WebkitUserSelect: 'none',
                        userSelect: 'none',
                        WebkitTouchCallout: 'none',
                      } as React.CSSProperties
                    }
                    onContextMenu={(e) => {
                      e.preventDefault();
                      return false;
                    }}
                  >
                    <div
                      className='relative group/sources'
                      style={
                        {
                          WebkitUserSelect: 'none',
                          userSelect: 'none',
                          WebkitTouchCallout: 'none',
                        } as React.CSSProperties
                      }
                    >
                      <div
                        className='bg-gray-700 text-white text-xs font-bold w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center shadow-md hover:bg-gray-600 hover:scale-[1.1] transition-all duration-300 ease-out cursor-pointer'
                        style={
                          {
                            WebkitUserSelect: 'none',
                            userSelect: 'none',
                            WebkitTouchCallout: 'none',
                          } as React.CSSProperties
                        }
                        onContextMenu={(e) => {
                          e.preventDefault();
                          return false;
                        }}
                      >
                        {sourceCount}
                      </div>

                      {/* 播放源详情悬浮框 */}
                      {(() => {
                        // 优先显示的播放源（常见的主流平台）
                        const prioritySources = [
                          '爱奇艺',
                          '腾讯视频',
                          '优酷',
                          '芒果TV',
                          '哔哩哔哩',
                          'Netflix',
                          'Disney+',
                        ];

                        // 按优先级排序播放源
                        const sortedSources = [...uniqueSources].sort(
                          (a, b) => {
                            const aIndex = prioritySources.indexOf(a);
                            const bIndex = prioritySources.indexOf(b);
                            if (aIndex !== -1 && bIndex !== -1)
                              return aIndex - bIndex;
                            if (aIndex !== -1) return -1;
                            if (bIndex !== -1) return 1;
                            return a.localeCompare(b);
                          }
                        );

                        const maxDisplayCount = 6; // 最多显示6个
                        const displaySources = sortedSources
                          .slice(0, maxDisplayCount)
                          .map(
                            (sourceItem) =>
                              convertDisplayText(sourceItem) ?? sourceItem
                          );
                        const hasMore = sortedSources.length > maxDisplayCount;
                        const remainingCount =
                          sortedSources.length - maxDisplayCount;

                        return (
                          <div
                            className='absolute bottom-full mb-2 opacity-0 invisible group-hover/sources:opacity-100 group-hover/sources:visible transition-all duration-200 ease-out delay-100 pointer-events-none z-50 right-0 sm:right-0 -translate-x-0 sm:translate-x-0'
                            style={
                              {
                                WebkitUserSelect: 'none',
                                userSelect: 'none',
                                WebkitTouchCallout: 'none',
                              } as React.CSSProperties
                            }
                            onContextMenu={(e) => {
                              e.preventDefault();
                              return false;
                            }}
                          >
                            <div
                              className='bg-gray-800/90 backdrop-blur-sm text-white text-xs sm:text-xs rounded-lg shadow-xl border border-white/10 p-1.5 sm:p-2 min-w-[100px] sm:min-w-[120px] max-w-[140px] sm:max-w-[200px] overflow-hidden'
                              style={
                                {
                                  WebkitUserSelect: 'none',
                                  userSelect: 'none',
                                  WebkitTouchCallout: 'none',
                                } as React.CSSProperties
                              }
                              onContextMenu={(e) => {
                                e.preventDefault();
                                return false;
                              }}
                            >
                              {/* 单列布局 */}
                              <div className='space-y-0.5 sm:space-y-1'>
                                {displaySources.map((sourceName, index) => (
                                  <div
                                    key={index}
                                    className='flex items-center gap-1 sm:gap-1.5'
                                  >
                                    <div className='w-0.5 h-0.5 sm:w-1 sm:h-1 bg-blue-400 rounded-full flex-shrink-0'></div>
                                    <span
                                      className='truncate text-[10px] sm:text-xs leading-tight'
                                      title={sourceName}
                                    >
                                      {sourceName}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              {/* 显示更多提示 */}
                              {hasMore && (
                                <div className='mt-1 sm:mt-2 pt-1 sm:pt-1.5 border-t border-gray-700/50'>
                                  <div className='flex items-center justify-center text-gray-400'>
                                    <span className='text-[10px] sm:text-xs font-medium'>
                                      +{remainingCount} 播放源
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* 小箭头 */}
                              <div className='absolute top-full right-2 sm:right-3 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[4px] sm:border-l-[6px] sm:border-r-[6px] sm:border-t-[6px] border-transparent border-t-gray-800/90'></div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                );
              })()}
          </div>

          {/* 进度条 */}
          {showProgress && (
            <div
              className={`mt-1 w-full rounded-full overflow-hidden ${
                progressHeightClassName || 'h-1'
              } ${progressTrackClassName || 'bg-gray-200'}`}
              style={
                {
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  WebkitTouchCallout: 'none',
                } as React.CSSProperties
              }
              onContextMenu={(e) => {
                e.preventDefault();
                return false;
              }}
            >
              <div
                className={`h-full transition-all duration-500 ease-out ${
                  progressFillClassName || 'bg-green-500'
                }`}
                style={
                  {
                    width: `${progress}%`,
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as React.CSSProperties
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
              />
            </div>
          )}

          {/* 标题与来源 */}
          <div
            className='mt-2 text-center'
            style={
              {
                WebkitUserSelect: 'none',
                userSelect: 'none',
                WebkitTouchCallout: 'none',
              } as React.CSSProperties
            }
            onContextMenu={(e) => {
              e.preventDefault();
              return false;
            }}
          >
            <div
              className='relative'
              style={
                {
                  WebkitUserSelect: 'none',
                  userSelect: 'none',
                  WebkitTouchCallout: 'none',
                } as React.CSSProperties
              }
            >
              <span
                className={`block font-semibold truncate text-gray-900 dark:text-gray-100 transition-colors duration-300 ease-in-out group-hover:text-green-600 dark:group-hover:text-green-400 peer ${sizeStyles.title}`}
                style={
                  {
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as React.CSSProperties
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
                title={
                  englishTitleToShow && englishTitleToShow !== 'NA'
                    ? `${
                        traditionalTitle || actualTitle
                      } (${englishTitleToShow})`
                    : traditionalTitle || actualTitle
                }
              >
                {traditionalTitle || actualTitle}
                {englishTitleToShow && (
                  <span className='text-xs font-medium text-gray-500 dark:text-gray-400 ml-1'>
                    ({englishTitleToShow})
                  </span>
                )}
              </span>
              {/* 自定义 tooltip */}
              <div
                className='absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded-md shadow-lg opacity-0 invisible peer-hover:opacity-100 peer-hover:visible transition-all duration-200 ease-out delay-100 whitespace-nowrap pointer-events-none'
                style={
                  {
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as React.CSSProperties
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
              >
                <div>{traditionalTitle || actualTitle}</div>
                {englishTitleToShow && (
                  <div className='mt-1 text-[11px] text-gray-200'>
                    {englishTitleToShow}
                  </div>
                )}
                <div
                  className='absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800'
                  style={
                    {
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                      WebkitTouchCallout: 'none',
                    } as React.CSSProperties
                  }
                ></div>
              </div>
            </div>
            {config.showSourceName && source_name && (
              <span
                className={`block ${sizeStyles.meta} text-gray-500 dark:text-gray-400 mt-1`}
                style={
                  {
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    WebkitTouchCallout: 'none',
                  } as React.CSSProperties
                }
                onContextMenu={(e) => {
                  e.preventDefault();
                  return false;
                }}
              >
                <span
                  className='inline-block border rounded px-2 py-0.5 border-gray-500/60 dark:border-gray-400/60 transition-all duration-300 ease-in-out group-hover:border-green-500/60 group-hover:text-green-600 dark:group-hover:text-green-400'
                  style={
                    {
                      WebkitUserSelect: 'none',
                      userSelect: 'none',
                      WebkitTouchCallout: 'none',
                    } as React.CSSProperties
                  }
                  onContextMenu={(e) => {
                    e.preventDefault();
                    return false;
                  }}
                >
                  {origin === 'live' && (
                    <Radio
                      size={12}
                      className='inline-block text-gray-500 dark:text-gray-400 mr-1.5'
                    />
                  )}
                  {traditionalSourceName ?? source_name}
                </span>
              </span>
            )}
            {displaySourceNames &&
              displaySourceNames.length > 0 &&
              !compactMeta && (
              <div className='mt-1 flex flex-wrap justify-center gap-1'>
                {displaySourceNames.map((name, idx) => (
                  <span
                    key={`${name}-${idx}`}
                    className={`px-2 py-0.5 rounded-full bg-gray-100 ${sizeStyles.meta} text-gray-600 dark:bg-gray-800 dark:text-gray-300 border border-gray-200 dark:border-gray-700`}
                    title={name}
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 操作菜单 - 支持右键和长按触发 */}
        <MobileActionSheet
          isOpen={showMobileActions}
          onClose={() => setShowMobileActions(false)}
          title={
            englishTitleToShow
              ? `${actualTitle} (${englishTitleToShow})`
              : actualTitle
          }
          poster={processImageUrl(actualPoster)}
          actions={mobileActions}
          sources={
            isAggregate && displaySourceNames ? displaySourceNames : undefined
          }
          isAggregate={isAggregate}
          sourceName={traditionalSourceName ?? source_name}
          currentEpisode={currentEpisode}
          totalEpisodes={actualEpisodes}
          origin={origin}
        />
      </>
    );
  }
);

export default memo(VideoCard);
