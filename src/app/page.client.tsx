/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  BangumiCalendarData,
  GetBangumiCalendarData,
} from '@/lib/bangumi.client';
// 客户端收藏 API
import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { convertToTraditional } from '@/lib/locale';
import { DoubanItem } from '@/lib/types';
import { isKidSafeContent, useKidsMode } from '@/lib/kidsMode.client';
import { useUserLanguage } from '@/lib/userLanguage.client';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import PageLayout from '@/components/PageLayout';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';

type UiLocale = 'en' | 'zh-Hans' | 'zh-Hant';

type TmdbListItem = {
  tmdbId: string;
  title: string;
  year: string;
  poster: string;
  originalTitle?: string;
  mediaType?: 'movie' | 'tv';
  certification?: string;
  genres?: string[];
  providers?: string[];
  voteAverage?: number;
  cast?: string[];
  directors?: string[];
  imdbId?: string;
  doubanId?: string;
};
type TmdbPerson = {
  tmdbId: string;
  title: string;
  poster: string;
};

type CardItem = {
  title: string;
  poster?: string;
  rate?: string;
  year?: string;
  douban_id?: number;
  imdb_id?: string;
  type?: string;
  query?: string;
  source_name?: string;
  id?: string | number;
};

type CategoryKey = 'movie' | 'tv-cn' | 'tv-krjp' | 'tv-us' | 'variety' | 'anime';

type TvSectionId =
  | 'continue'
  | 'category'
  | 'hero'
  | 'spotlight'
  | 'rail-movie'
  | 'rail-tv'
  | 'rail-variety';

const TV_SECTIONS: TvSectionId[] = [
  'continue',
  'category',
  'hero',
  'spotlight',
  'rail-movie',
  'rail-tv',
  'rail-variety',
];

function resolveUiLocale(): UiLocale {
  try {
    const saved =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('userLocale')
        : null;
    if (saved === 'en' || saved === 'zh-Hans' || saved === 'zh-Hant') {
      return saved;
    }
  } catch {
    // ignore
  }

  const nav =
    typeof navigator !== 'undefined' ? (navigator.language || '') : '';
  const lower = nav.toLowerCase();
  if (lower.startsWith('zh-cn') || lower.startsWith('zh-hans')) return 'zh-Hans';
  if (
    lower.startsWith('zh-tw') ||
    lower.startsWith('zh-hant') ||
    lower.startsWith('zh-hk')
  ) {
    return 'zh-Hant';
  }
  return 'en';
}

function isKidSafeCard(item: CardItem) {
  return isKidSafeContent({
    title: item.title,
    desc: item.rate || item.type || '',
    type: item.type,
  });
}

/**
 * ContentRail with 3 modes:
 * - TV: vertical list (no own key listener; global TV nav handles sections)
 * - Desktop/Tablet: horizontal with arrows
 * - Mobile: swipe/snap horizontal
 */
function ContentRail({
  title,
  href,
  items,
  screenMode,
  tt,
}: {
  title: string;
  href?: string;
  items: CardItem[];
  screenMode: 'tv' | 'desktop' | 'mobile';
  tt: (en: string, zhHans: string, zhHant: string) => string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isTV = screenMode === 'tv';
  const isMobile = screenMode === 'mobile';
  const isTabletPC = !isTV && !isMobile;
  const noData = items.length === 0;

  const scrollHorizontal = (offset: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  const scrollVertical = (offset: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ top: offset, behavior: 'smooth' });
  };

  const mobileScrollClass = isMobile
    ? `
      snap-x snap-mandatory
      scroll-pl-4 pr-6
      touch-pan-x overflow-x-auto
      overscroll-x-contain
    `
    : '';

  const mobileCardClass = isMobile
    ? 'snap-start min-w-[47%]'
    : 'min-w-[140px] sm:min-w-[180px]';

  // TV MODE: vertical rail, no local key handling (global TV nav moves between sections)
  if (isTV) {
    return (
      <div
        className="relative rounded-2xl border border-gray-200/40 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 p-3 overflow-hidden group"
        style={{ height: '540px' }}
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          {href && (
            <Link
              href={href}
              className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1"
            >
              {tt('See more', '查看更多', '查看更多')}
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        <div
          ref={scrollRef}
          className="flex flex-col gap-3 overflow-y-auto pb-6 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-y snap-mandatory"
        >
          {noData && (
            <div className="text-gray-500 text-center py-4">
              {tt('No data', '暂无数据', '暫無資料')}
            </div>
          )}

          {items.map((item, idx) => (
            <div
              key={idx}
              className="transition-all duration-200 opacity-95 snap-start focus-within:ring-4 focus-within:ring-emerald-400/70 rounded-2xl"
            >
              <VideoCard
                from="douban"
                title={item.title}
                poster={item.poster}
                douban_id={item.douban_id}
                rate={item.rate}
                year={item.year}
                type={item.type}
                query={item.query}
                source_name={item.source_name}
                size="lg"
                compactMeta
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // TABLET / PC MODE: horizontal with arrows
  if (isTabletPC) {
    return (
      <div className="relative rounded-2xl border border-gray-200/50 dark:border-gray-800 bg-white/60 dark:bg-gray-900/50 p-4 overflow-hidden group">
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          {href && (
            <Link
              href={href}
              className="text-sm text-green-700 dark:text-green-400 hover:underline flex items-center gap-1"
            >
              {tt('See more', '查看更多', '查看更多')}
              <ChevronRight className="w-4 h-4" />
            </Link>
          )}
        </div>

        <button
          onClick={() => scrollHorizontal(-450)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-20 hidden md:flex opacity-0 group-hover:opacity-100 p-3 bg-black/40 hover:bg-black/70 text-white rounded-full shadow-lg"
        >
          ‹
        </button>
        <button
          onClick={() => scrollHorizontal(450)}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-20 hidden md:flex opacity-0 group-hover:opacity-100 p-3 bg-black/40 hover:bg-black/70 text-white rounded-full shadow-lg"
        >
          ›
        </button>

        <div className="pointer-events-none absolute left-0 top-0 h-full w-16 bg-gradient-to-r from-black/60 to-transparent z-10" />
        <div className="pointer-events-none absolute right-0 top-0 h-full w-16 bg-gradient-to-l from-black/60 to-transparent z-10" />

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-3 px-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {noData && (
            <div className="text-gray-500 py-4 w-full text-center">
              {tt('No data', '暂无数据', '暫無資料')}
            </div>
          )}
          {items.map((item, idx) => (
            <div
              key={idx}
              className="min-w-[180px] transform transition hover:scale-105"
            >
              <VideoCard
                from="douban"
                title={item.title}
                poster={item.poster}
                douban_id={item.douban_id}
                rate={item.rate}
                year={item.year}
                type={item.type}
                query={item.query}
                source_name={item.source_name}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // MOBILE MODE: swipe + snap
  return (
    <div className="relative rounded-2xl border border-gray-200/50 dark:border-gray-800 bg-white/60 dark:bg-gray-900/50 p-3 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        {href && (
          <Link
            href={href}
            className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1"
          >
            {tt('See more', '查看更多', '查看更多')}
            <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div
        ref={scrollRef}
        className={`flex gap-3 overflow-x-auto pb-3 px-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${mobileScrollClass}`}
      >
        {noData && (
          <div className="text-gray-500 py-4 text-center w-full">
            {tt('No data', '暂无数据', '暫無資料')}
          </div>
        )}
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`${mobileCardClass} active:scale-[0.97] transition-transform`}
          >
            <VideoCard
              from="douban"
              title={item.title}
              poster={item.poster}
              douban_id={item.douban_id}
              rate={item.rate}
              year={item.year}
              type={item.type}
              query={item.query}
              source_name={item.source_name}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function HomeClient() {
  const { userLocale } = useUserLanguage();
  const uiLocale: UiLocale = useMemo(() => {
    if (userLocale === 'en' || userLocale === 'zh-Hans' || userLocale === 'zh-Hant') {
      return userLocale;
    }
    return resolveUiLocale();
  }, [userLocale]);
  const tt = useCallback(
    (en: string, zhHans: string, zhHant: string): string => {
      if (uiLocale === 'zh-Hans') return zhHans;
      if (uiLocale === 'zh-Hant') return zhHant;
      return en;
    },
    [uiLocale]
  );

  const [activeTab, setActiveTab] = useState<'home' | 'favorites'>('home');
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [latestMoviesDouban, setLatestMoviesDouban] = useState<DoubanItem[]>([]);
  const [latestTvDouban, setLatestTvDouban] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);
  const [bangumiCalendarData, setBangumiCalendarData] = useState<
    BangumiCalendarData[]
  >([]);
  const [tmdbMovies, setTmdbMovies] = useState<TmdbListItem[]>([]);
  const [tmdbTv, setTmdbTv] = useState<TmdbListItem[]>([]);
  const [tmdbPeople, setTmdbPeople] = useState<TmdbPerson[]>([]);
  const [tmdbNowPlaying, setTmdbNowPlaying] = useState<TmdbListItem[]>([]);
  const [tmdbOnAir, setTmdbOnAir] = useState<TmdbListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<CategoryKey>('movie');
  const [screenMode, setScreenMode] = useState<'tv' | 'desktop' | 'mobile'>(
    'desktop'
  );
  const [sortMode, setSortMode] = useState<'trending' | 'newest' | 'rating'>(
    'trending'
  );
  const [heroIndex, setHeroIndex] = useState(0);
  const { announcement } = useSite();
  const { isKidsMode } = useKidsMode();
  const applyKidsFilter = useMemo(
    () => (items: CardItem[]) =>
      isKidsMode ? items.filter((item) => isKidSafeCard(item)) : items,
    [isKidsMode]
  );
  const [showAnnouncement, setShowAnnouncement] = useState(false);

  // TV section focus index
  const [tvSectionIndex, setTvSectionIndex] = useState(0);

  // 检查公告弹窗状态
  useEffect(() => {
    if (typeof window !== 'undefined' && announcement) {
      const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
      if (hasSeenAnnouncement !== announcement) {
        setShowAnnouncement(true);
      } else {
        setShowAnnouncement(Boolean(!hasSeenAnnouncement && announcement));
      }
    }
  }, [announcement]);

  // In kids mode default to the safest lane.
  useEffect(() => {
    if (isKidsMode && category !== 'anime') {
      setCategory('anime');
    }
  }, [isKidsMode, category]);

  type FavoriteItem = {
    id: string;
    source: string;
    title: string;
    poster: string;
    episodes: number;
    source_name: string;
    currentEpisode?: number;
    search_title?: string;
    origin?: 'vod' | 'live';
  };

  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);

  useEffect(() => {
    const fetchRecommendData = async () => {
      try {
        setLoading(true);
        setError(false);

        const doubanPromise = fetch('/api/douban/home', {
          cache: 'force-cache',
        }).then((r) => {
          if (!r.ok) throw new Error(`Douban home failed (${r.status})`);
          return r.json() as Promise<{
            movies?: DoubanItem[];
            tv?: DoubanItem[];
            variety?: DoubanItem[];
            latestMovies?: DoubanItem[];
            latestTv?: DoubanItem[];
          }>;
        });

        const bangumiPromise = GetBangumiCalendarData();

        const tmdbPromise = fetch('/api/imdb/list', {
          cache: 'force-cache',
        }).then(async (res) => {
          if (!res.ok) throw new Error(`TMDB list failed (${res.status})`);
          return (await res.json()) as {
            movies?: TmdbListItem[];
            tv?: TmdbListItem[];
            people?: TmdbPerson[];
            nowPlaying?: TmdbListItem[];
            onAir?: TmdbListItem[];
          };
        });

        const [doubanRes, bangumiRes, tmdbRes] = await Promise.allSettled([
          doubanPromise,
          bangumiPromise,
          tmdbPromise,
        ]);

        if (doubanRes.status === 'fulfilled') {
          const doubanHome = doubanRes.value;
          setHotMovies(Array.isArray(doubanHome?.movies) ? doubanHome.movies : []);
          setHotTvShows(Array.isArray(doubanHome?.tv) ? doubanHome.tv : []);
          setLatestMoviesDouban(
            Array.isArray(doubanHome?.latestMovies) ? doubanHome.latestMovies : []
          );
          setLatestTvDouban(
            Array.isArray(doubanHome?.latestTv) ? doubanHome.latestTv : []
          );
          setHotVarietyShows(
            Array.isArray(doubanHome?.variety) ? doubanHome.variety : []
          );
        }

        if (bangumiRes.status === 'fulfilled') {
          setBangumiCalendarData(bangumiRes.value);
        }

        if (tmdbRes.status === 'fulfilled') {
          const data = tmdbRes.value;
          setTmdbMovies(Array.isArray(data.movies) ? data.movies : []);
          setTmdbTv(Array.isArray(data.tv) ? data.tv : []);
          setTmdbPeople(Array.isArray(data.people) ? data.people : []);
          setTmdbNowPlaying(
            Array.isArray(data.nowPlaying) ? data.nowPlaying : []
          );
          setTmdbOnAir(Array.isArray(data.onAir) ? data.onAir : []);
        }

        if (
          doubanRes.status === 'rejected' &&
          tmdbRes.status === 'rejected' &&
          bangumiRes.status === 'rejected'
        ) {
          setError(true);
        }
      } catch (error) {
        console.error('獲取推薦資料失敗:', error);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendData();
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      const w = window.innerWidth;
      if (w >= 1600) {
        setScreenMode('tv');
      } else if (w >= 768) {
        setScreenMode('desktop');
      } else {
        setScreenMode('mobile');
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const animeList = useMemo(() => {
    if (!bangumiCalendarData || bangumiCalendarData.length === 0) return [];
    const items: CardItem[] = [];
    bangumiCalendarData.forEach((day) => {
      day.items.forEach((anime) => {
        items.push({
          title: anime.name_cn || anime.name,
          poster:
            anime.images?.large ||
            anime.images?.common ||
            anime.images?.medium ||
            anime.images?.small ||
            anime.images?.grid,
          rate: anime.rating?.score ? anime.rating.score.toFixed(1) : '',
          year: anime.air_date?.split('-')?.[0] || '',
          douban_id: anime.id,
          type: 'tv',
        });
      });
    });
    return items.slice(0, 48);
  }, [bangumiCalendarData]);

  const tmdbMovieCards = useMemo(
    () =>
      (tmdbMovies || []).map((item) => ({
        title: item.title,
        poster: item.poster,
        rate: '',
        year: item.year,
        type: 'movie',
        query: item.title,
        imdb_id: item.imdbId,
        douban_id: item.doubanId ? Number(item.doubanId) : undefined,
        source_name: 'TMDB',
        id: item.tmdbId,
      })),
    [tmdbMovies]
  );

  const tmdbTvCards = useMemo(
    () =>
      (tmdbTv || []).map((item) => ({
        title: item.title,
        poster: item.poster,
        rate: '',
        year: item.year,
        type: 'tv',
        query: item.title,
        imdb_id: item.imdbId,
        douban_id: item.doubanId ? Number(item.doubanId) : undefined,
        source_name: 'TMDB',
        id: item.tmdbId,
      })),
    [tmdbTv]
  );

  const tmdbPeopleCards = useMemo(
    () =>
      (tmdbPeople || []).map((item) => ({
        title: item.title,
        poster: item.poster,
        rate: '',
        year: '',
        type: 'person',
        query: item.title,
        source_name: 'TMDB',
        id: item.tmdbId,
      })),
    [tmdbPeople]
  );

  const mapDoubanCards = useCallback(
    (items: DoubanItem[], type?: string): CardItem[] =>
      (items || []).map((item) => {
        const localizedTitle =
          uiLocale === 'zh-Hant'
            ? convertToTraditional(item.title)
            : uiLocale === 'en' && item.original_title
            ? item.original_title
            : item.title;
        return {
          title: localizedTitle,
          poster: item.poster,
          rate: item.rate,
          year: item.year,
          douban_id: Number(item.id),
          type,
          query: localizedTitle,
        };
      }),
    [uiLocale]
  );

  const getCardKey = useCallback((item: CardItem) => {
    if (item.douban_id && item.douban_id > 0) return `douban:${item.douban_id}`;
    if (item.imdb_id) return `imdb:${item.imdb_id.toLowerCase()}`;
    const normTitle = (item.title || '').trim().toLowerCase().replace(/\s+/g, '');
    return `${normTitle}__${item.year || ''}`;
  }, []);

  const mergeCards = useCallback(
    (
      base: CardItem[],
      extras: CardItem[],
      addUnmatched = true,
      posterMap?: Map<string, string>
    ): CardItem[] => {
      const map = new Map<string, CardItem>();

      const mergeInto = (item: CardItem) => {
        const key = getCardKey(item);
        if (!key) return;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, { ...item });
          if (posterMap && item.poster) posterMap.set(key, item.poster);
          return;
        }
        if (posterMap && !posterMap.has(key) && item.poster) {
          posterMap.set(key, item.poster);
        }
        map.set(key, {
          ...existing,
          ...item,
          poster: existing.poster || item.poster,
          rate: existing.rate || item.rate,
          year: existing.year || item.year,
          query: existing.query || item.query,
          source_name: existing.source_name || item.source_name,
          type: existing.type || item.type,
        });
      };

      base.forEach(mergeInto);
      extras.forEach((item) => {
        const key = getCardKey(item);
        const exists = key && map.has(key);
        if (exists || addUnmatched) mergeInto(item);
      });

      return Array.from(map.values());
    },
    [getCardKey]
  );

  const tmdbNowPlayingCards = useMemo(
    () =>
      (tmdbNowPlaying || []).map((item) => ({
        title: item.title,
        poster: item.poster,
        rate: '',
        year: item.year,
        type: 'movie',
        query: item.title,
        imdb_id: item.imdbId,
        source_name: 'TMDB',
        id: item.tmdbId,
      })),
    [tmdbNowPlaying]
  );

  const tmdbOnAirCards = useMemo(
    () =>
      (tmdbOnAir || []).map((item) => ({
        title: item.title,
        poster: item.poster,
        rate: '',
        year: item.year,
        type: 'tv',
        query: item.title,
        imdb_id: item.imdbId,
        source_name: 'TMDB',
        id: item.tmdbId,
      })),
    [tmdbOnAir]
  );

  const [hotTvShowsCn, hotTvShowsKrJp, hotTvShowsUsEu] = useMemo(() => {
    const krjpList: DoubanItem[] = [];
    const cnList: DoubanItem[] = [];
    const usEuList: DoubanItem[] = [];
    const regionFromItem = (item: DoubanItem) => {
      if (item.region === 'kr' || item.region === 'jp') return item.region;
      if (item.region === 'cn' || item.region === 'hk' || item.region === 'tw')
        return 'cn';
      const subtitle = (item.subtitle || '').toLowerCase();
      if (/韩|韓|korean|kr/.test(subtitle)) return 'kr';
      if (/日|japan|jp/.test(subtitle)) return 'jp';
      if (/中国|國|大陆|大陸|港|台|普通话|國語|華語|mandarin|zh/.test(subtitle))
        return 'cn';
      if (/(us|usa|uk|gb|british|england|europe|france|germany|german|spain|spanish|italy|italian|canada|australia)/.test(subtitle))
        return 'us';
      if (/美剧|美劇|英剧|英劇|欧美|歐美/.test(subtitle)) return 'us';
      return undefined;
    };
    const isKrJpTitle = (title?: string) => {
      if (!title) return false;
      // Detect Hangul or common CJK markers for KR/JP titles
      if (/[가-힣]/.test(title)) return true; // Hangul
      if (/[ぁ-ゔァ-ヴ]/.test(title)) return true; // Kana
      if (/韩|韓/.test(title)) return true;
      if (/日剧|日劇|日版|日本/.test(title)) return true;
      return false;
    };
    const isCnTitle = (title?: string) => {
      if (!title) return false;
      if (/中国|國|大陆|大陸|港|台|華語|华语/.test(title)) return true;
      return /[\u4e00-\u9fff]/.test(title);
    };
    (hotTvShows || []).forEach((item) => {
      const region = regionFromItem(item);
      if (region === 'kr' || region === 'jp' || isKrJpTitle(item.title)) {
        krjpList.push(item);
      } else if (region === 'cn' || isCnTitle(item.title)) {
        cnList.push(item);
      } else {
        usEuList.push(item);
      }
    });
    return [cnList, krjpList, usEuList];
  }, [hotTvShows]);

  const categoryData = useMemo<
    Record<
      CategoryKey,
      { label: string; items: CardItem[]; seeMore?: string; hint: string }
    >
  >(() => {
    const posterMap = new Map<string, string>();

    const mergedMovies = mergeCards(
      mapDoubanCards(hotMovies, 'movie'),
      tmdbMovieCards,
      true,
      posterMap
    );
    const mergedTvCn = mergeCards(
      mapDoubanCards(hotTvShowsCn, 'tv'),
      tmdbTvCards,
      false,
      posterMap
    );
    const mergedTvKrJp = mergeCards(
      mapDoubanCards(hotTvShowsKrJp, 'tv'),
      tmdbTvCards,
      false,
      posterMap
    );
    const mergedTvUs = mergeCards(
      mapDoubanCards(hotTvShowsUsEu, 'tv'),
      tmdbTvCards,
      true,
      posterMap
    );

    return {
      posterMap,
      movie: {
        label: tt('Movies', '电影', '電影'),
        items: applyKidsFilter(mergedMovies),
        seeMore: '/douban?type=movie',
        hint: tt('Cinema picks for today', '今日影院精选', '今日影院精選'),
      },
      'tv-cn': {
        label: tt('Chinese TV', '华语剧集', '華語劇集'),
        items: applyKidsFilter(mergedTvCn),
        seeMore: '/douban?type=tv&region=cn',
        hint: tt('Domestic picks', '热门华语剧', '熱門華語劇'),
      },
      'tv-krjp': {
        label: tt('KR/JP TV', '日韩剧集', '日韓劇集'),
        items: applyKidsFilter(mergedTvKrJp),
        seeMore: '/douban?type=tv&region=krjp',
        hint: tt('Korean & Japanese hits', '热门日韩剧', '熱門日韓劇'),
      },
      'tv-us': {
        label: tt('US/Europe TV', '欧美剧集', '歐美劇集'),
        items: applyKidsFilter(mergedTvUs),
        seeMore: '/douban?type=tv&region=us',
        hint: tt('Western series', '热门欧美剧', '熱門歐美劇'),
      },
      variety: {
        label: tt('Variety', '综艺', '綜藝'),
        items: applyKidsFilter(mapDoubanCards(hotVarietyShows, 'show')),
        seeMore: '/douban?type=show',
        hint: tt('Light entertainment', '轻松综艺', '輕鬆綜藝'),
      },
      anime: {
        label: tt('Anime', '新番', '新番'),
        items: applyKidsFilter(animeList),
        seeMore: '/douban?type=anime',
        hint: tt('Fresh episodes', '最新更新', '最新更新'),
      },
    };
  }, [
    animeList,
    hotMovies,
    hotTvShowsCn,
    hotTvShowsKrJp,
    hotTvShowsUsEu,
    hotVarietyShows,
    tmdbMovies,
    tmdbTv,
    tmdbPeople,
    applyKidsFilter,
    mapDoubanCards,
    mergeCards,
  ]);

  const currentCategory = categoryData[category];

  const applyPosterOverrides = useCallback(
    (items: CardItem[]) =>
      items.map((item) => {
        const key = getCardKey(item);
        const override =
          key && (categoryData as any).posterMap?.get
            ? (categoryData as any).posterMap.get(key)
            : undefined;
        if (override && override !== item.poster) {
          return { ...item, poster: override };
        }
        return item;
      }),
    [categoryData, getCardKey]
  );

  useEffect(() => {
    setHeroIndex(0);
  }, [category]);

  const sortedItems = useMemo(() => {
    if (!currentCategory?.items) return [];
    const items = [...currentCategory.items];
    if (sortMode === 'newest') {
      items.sort((a, b) => (Number(b.year) || 0) - (Number(a.year) || 0));
    } else if (sortMode === 'rating') {
      items.sort(
        (a, b) => (parseFloat(b.rate || '0') || 0) - (parseFloat(a.rate || '0') || 0)
      );
    }
    return items;
  }, [currentCategory, sortMode]);

  const heroItems = useMemo(
    () => (currentCategory?.items || []).slice(0, 10),
    [currentCategory]
  );
  useEffect(() => {
    if (!heroItems.length) return;
    const timer = setInterval(() => {
      setHeroIndex((prev) => prev + 1);
    }, 3000);
    return () => clearInterval(timer);
  }, [heroItems.length]);
  const currentHero =
    heroItems.length > 0 && heroIndex >= 0
      ? heroItems[Math.abs(heroIndex) % heroItems.length]
      : undefined;

  const formattedAnnouncement = useMemo(() => {
    if (!announcement) return '';
    const locale = resolveUiLocale();
    if (locale === 'zh-Hant') {
      return convertToTraditional(announcement);
    }
    return announcement;
  }, [announcement]);

  const updateFavoriteItems = async (allFavorites: Record<string, any>) => {
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
  };

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
  }, [activeTab]);

  const handleCloseAnnouncement = (announcementStr: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', announcementStr);
  };

  const isTV = screenMode === 'tv';
  const isMobile = screenMode === 'mobile';
  const mainLayoutClass = isTV
    ? 'flex flex-col gap-6 xl:gap-8'
    : isMobile
    ? 'flex flex-col gap-6'
    : 'flex flex-col gap-6 xl:gap-8';

  const currentTvSection =
    isTV && activeTab === 'home' ? TV_SECTIONS[tvSectionIndex] : null;

  const tvSectionClass = (id: TvSectionId) =>
    isTV && activeTab === 'home'
      ? currentTvSection === id
        ? 'ring-4 ring-emerald-400 shadow-[0_0_0_1px_rgba(16,185,129,0.7)] shadow-emerald-700/40 scale-[1.01]'
        : 'opacity-60 hover:opacity-80'
      : '';

  // Global TV Up/Down navigation across sections
  useEffect(() => {
    if (!isTV || activeTab !== 'home') return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setTvSectionIndex((prev) =>
          prev < TV_SECTIONS.length - 1 ? prev + 1 : prev
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setTvSectionIndex((prev) => (prev > 0 ? prev - 1 : prev));
      }
      // ArrowLeft / ArrowRight / Enter can be wired per-section later
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isTV, activeTab]);

  // Auto-scroll to focused TV section
  useEffect(() => {
    if (!isTV || activeTab !== 'home') return;
    if (!currentTvSection) return;

    const el = document.querySelector<HTMLElement>(
      `[data-tv-section="${currentTvSection}"]`
    );
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const offset = rect.top + window.scrollY - 100;

    window.scrollTo({ top: offset, behavior: 'smooth' });
  }, [currentTvSection, isTV, activeTab]);

  return (
    <PageLayout>
      <div className="px-2 sm:px-6 lg:px-10 xl:px-12 py-4 sm:py-8 overflow-visible w-full">
        {isKidsMode && (
          <div className="mb-3 flex justify-center">
            <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold dark:bg-amber-900/60 dark:text-amber-50 border border-amber-200 dark:border-amber-700">
              {tt('Kids mode is on', '少儿模式已开启', '少兒模式已開啟')}
            </span>
          </div>
        )}
        {/* 顶部 Tab 切换 */}
        <div className="mb-6 sm:mb-8 flex justify-center">
          <CapsuleSwitch
            options={[
              { label: tt('Home', '首页', '首頁'), value: 'home' },
              {
                label: tt('Favorites', '收藏夹', '收藏夾'),
                value: 'favorites',
              },
            ]}
            active={activeTab}
            onChange={(value) => setActiveTab(value as 'home' | 'favorites')}
          />
        </div>

        <div className="w-full">
          {activeTab === 'favorites' ? (
            // 收藏夾視圖
            <section className="mb-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                  {tt('My favorites', '我的收藏', '我的收藏')}
                </h2>
                {favoriteItems.length > 0 && (
                  <button
                    className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    onClick={async () => {
                      await clearAllFavorites();
                      setFavoriteItems([]);
                    }}
                  >
                    {tt('Clear', '清空', '清空')}
                  </button>
                )}
              </div>
              <div className="justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8">
                {favoriteItems.map((item) => (
                  <div key={item.id + item.source} className="w-full">
                    <VideoCard
                      query={item.search_title}
                      {...item}
                      from="favorite"
                      type={item.episodes > 1 ? 'tv' : ''}
                    />
                  </div>
                ))}
                {favoriteItems.length === 0 && (
                  <div className="col-span-full text-center text-gray-500 py-8 dark:text-gray-400">
                    {tt(
                      'No favorites yet',
                      '暂无收藏内容',
                      '暫無收藏內容'
                    )}
                  </div>
                )}
              </div>
            </section>
          ) : (
            // 首頁視圖
            <>
              <div className={mainLayoutClass}>
                <div className="flex flex-col gap-6 sm:gap-8">
                  {/* 继续观看 */}
                  <section
                    data-tv-section="continue"
                    className={tvSectionClass('continue')}
                  >
                    <ContinueWatching />
                  </section>

                  {/* 错误提示 */}
                  {error && (
                    <div className="mb-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
                      <p className="font-bold">
                        {tt(
                          '⚠️ Data load issue',
                          '⚠️ 数据加载异常',
                          '⚠️ 資料載入異常'
                        )}
                      </p>
                      <p>
                        {tt(
                          'Unable to fetch data from Douban and other third-party APIs. Check your network and try again later.',
                          '无法从豆瓣等第三方接口获取数据，请检查网络连接或稍后重试。',
                          '無法從豆瓣等第三方介面取得資料，請檢查網路連線或稍後再試。'
                        )}
                      </p>
                    </div>
                  )}

                  {/* 分类切换 + 排序 */}
                  <section
                    data-tv-section="category"
                    className={`rounded-2xl border border-gray-200/50 dark:border-gray-800 bg-white/80 dark:bg-gray-900/70 p-3 sm:p-4 shadow-sm ${tvSectionClass(
                      'category'
                    )}`}
                  >
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(categoryData) as CategoryKey[]).map(
                          (key) => {
                            const cfg = categoryData[key];
                            const active = category === key;
                            return (
                              <button
                                key={key}
                                onClick={() => setCategory(key)}
                                className={`relative px-4 py-2 rounded-full text-sm font-semibold transition focus:outline-none ${
                                  active
                                    ? 'bg-gradient-to-r from-emerald-900 to-green-700 text-white shadow-md shadow-emerald-900/30'
                                    : 'bg-white/80 dark:bg-gray-800/70 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-700 hover:border-green-500'
                                }`}
                              >
                                {cfg.label}
                              </button>
                            );
                          }
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                        {(['trending', 'newest', 'rating'] as const).map(
                          (mode) => {
                            const active = sortMode === mode;
                            const labels: Record<typeof mode, string> = {
                              trending: tt('Trending', '热度', '熱度'),
                              newest: tt('Newest', '最新', '最新'),
                              rating: tt('Rating', '评分', '評分'),
                            };
                            return (
                              <button
                                key={mode}
                                onClick={() => setSortMode(mode)}
                                className={`px-3 py-1.5 rounded-full border transition ${
                                  active
                                    ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 border-transparent shadow-sm'
                                    : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-green-500'
                                }`}
                              >
                                {labels[mode]}
                              </button>
                            );
                          }
                        )}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center justify-between">
                        <span>{currentCategory?.hint}</span>
                        {currentCategory?.seeMore && (
                          <Link
                            href={currentCategory.seeMore}
                            className="inline-flex items-center text-green-700 dark:text-green-400 hover:underline"
                          >
                            {tt('See more', '查看更多', '查看更多')}
                            <ChevronRight className="w-4 h-4 ml-1" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </section>

                  <section className='rounded-2xl border border-gray-200/60 dark:border-gray-800 bg-white/80 dark:bg-gray-900/70 shadow-sm max-w-6xl mx-auto w-full'>
                    <div className='px-3 sm:px-4 py-3 sm:py-4 flex items-center justify-between'>
                      <div className='space-y-1'>
                        <div className='flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-green-700 dark:text-green-300'>
                          <span>{currentCategory.label}</span>
                          <span className='w-1 h-1 rounded-full bg-green-700 dark:bg-green-500'></span>
                          <span className='text-gray-600 dark:text-gray-300'>
                            {tt('Spotlight', '精选轮播', '精選輪播')}
                          </span>
                        </div>
                        <p className='text-sm text-gray-600 dark:text-gray-300'>
                          {tt('Swipe through highlights; tap to open.', '左右滑动浏览精选，点击打开播放。', '左右滑動瀏覽精選，點擊開啟播放。')}
                        </p>
                      </div>
                    </div>
                    <div className='px-3 sm:px-4 pb-4'>
                      <div className='flex gap-3 overflow-x-auto [-ms-overflow-style:"none"] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
                        {heroItems.slice(0, 12).map((item, idx) => {
                          const safeLength = heroItems.length || 1;
                          const activeIndex =
                            ((heroIndex % safeLength) + safeLength) % safeLength;
                          const active = idx === activeIndex;
                          return (
                            <div
                              key={`${item.title}-${idx}`}
                              onMouseEnter={() => setHeroIndex(idx)}
                              className={`relative flex-shrink-0 w-32 sm:w-36 md:w-40 transition ${
                                active
                                  ? 'ring-2 ring-green-300/70 border border-green-400/70 scale-[1.02]'
                                  : 'border border-gray-200 dark:border-gray-700 hover:border-green-400'
                              } rounded-2xl overflow-hidden`}
                              style={{ scrollSnapAlign: 'start' }}
                            >
                              <VideoCard
                                from='douban'
                                title={item.title}
                                poster={item.poster}
                                douban_id={item.douban_id}
                                rate={item.rate}
                                year={item.year}
                                type={item.type}
                                query={item.query || item.title}
                                source_name={item.source_name}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </section>


                  {/* Spotlight Grid */}
                  <section
                    data-tv-section="spotlight"
                    className={`rounded-2xl border border-gray-200/60 dark:border-gray-800 bg-white/60 dark:bg-gray-900/50 p-3 sm:p-4 ${tvSectionClass(
                      'spotlight'
                    )}`}
                  >
                    <div
                      className={`grid ${
                        screenMode === 'mobile'
                          ? 'grid-cols-2 gap-3'
                          : 'grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 sm:gap-5'
                      }`}
                    >
                      {loading &&
                        Array.from({ length: 12 }).map((_, idx) => (
                          <div
                            key={idx}
                            className="relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse"
                          ></div>
                        ))}

                      {!loading &&
                        !error &&
                        sortedItems.map((item, index) => {
                          const isSpotlight =
                            screenMode !== 'mobile' && index % 7 === 0;
                          return (
                            <div
                              key={`${item.title}-${index}-${item.douban_id ?? ''}`}
                              className={isSpotlight ? 'col-span-2' : ''}
                            >
                              <VideoCard
                                from="douban"
                                title={item.title}
                                poster={item.poster}
                                douban_id={item.douban_id}
                                rate={item.rate}
                                year={item.year}
                                type={item.type}
                                query={item.query}
                                source_name={item.source_name}
                              />
                            </div>
                          );
                        })}
                    </div>

                    {!loading && !error && sortedItems.length === 0 && (
                      <div className="text-center text-gray-500 dark:text-gray-400 py-10">
                        {tt('No data', '暂无数据', '暫無資料')}
                      </div>
                    )}
                  </section>

                  {/* Rails */}
                  <section className="space-y-6">
                    <div
                      data-tv-section="rail-movie"
                      className={tvSectionClass('rail-movie')}
                    >
                      <ContentRail
                        title={tt('Hot movies', '热门电影', '熱門電影')}
                        href="/douban?type=movie"
                        items={categoryData.movie.items}
                        screenMode={screenMode}
                        tt={tt}
                      />
                    </div>
                    <div className={tvSectionClass('rail-movie')}>
                      <ContentRail
                        title={tt('Trending movies (TMDB)', 'TMDB 热门电影', 'TMDB 熱門電影')}
                        href="#"
                        items={applyKidsFilter(applyPosterOverrides(tmdbMovieCards))}
                        screenMode={screenMode}
                        tt={tt}
                      />
                    </div>
                    <div className={tvSectionClass('rail-movie')}>
                      <ContentRail
                        title={tt('Latest movies', '最新电影', '最新電影')}
                        href="#"
                        items={applyKidsFilter(
                          applyPosterOverrides(
                            mergeCards(
                              mapDoubanCards(latestMoviesDouban, 'movie'),
                              tmdbNowPlayingCards
                            )
                          )
                        )}
                        screenMode={screenMode}
                        tt={tt}
                      />
                    </div>
                    <div
                      data-tv-section="rail-tv"
                      className={tvSectionClass('rail-tv')}
                    >
                      <ContentRail
                        title={tt('Hot CN TV', '热门华语剧', '熱門華語劇')}
                        href="/douban?type=tv&region=cn"
                        items={categoryData['tv-cn'].items}
                        screenMode={screenMode}
                        tt={tt}
                      />
                      <ContentRail
                        title={tt('Hot KR/JP TV', '热门日韩剧', '熱門日韓劇')}
                        href="/douban?type=tv&region=krjp"
                        items={categoryData['tv-krjp'].items}
                        screenMode={screenMode}
                        tt={tt}
                      />
                      <ContentRail
                        title={tt('Trending TV (TMDB)', 'TMDB 热门剧集', 'TMDB 熱門劇集')}
                        href="#"
                        items={applyKidsFilter(applyPosterOverrides(tmdbTvCards))}
                        screenMode={screenMode}
                        tt={tt}
                      />
                      <ContentRail
                        title={tt('Latest TV', '最新剧集', '最新劇集')}
                        href="#"
                        items={applyKidsFilter(
                          applyPosterOverrides(
                            mergeCards(
                              mapDoubanCards(latestTvDouban, 'tv'),
                              tmdbOnAirCards
                            )
                          )
                        )}
                        screenMode={screenMode}
                        tt={tt}
                      />
                    </div>
                    {tmdbPeopleCards.length > 0 && (
                      <div className={tvSectionClass('rail-variety')}>
                        <ContentRail
                          title={tt('Trending people (TMDB)', 'TMDB 热门影人', 'TMDB 熱門影人')}
                          href="#"
                          items={tmdbPeopleCards}
                          screenMode={screenMode}
                          tt={tt}
                        />
                      </div>
                    )}
                    <div
                      data-tv-section="rail-variety"
                      className={tvSectionClass('rail-variety')}
                    >
                      <ContentRail
                        title={tt(
                          'Hot variety shows',
                          '热门综艺',
                          '熱門綜藝'
                        )}
                        href="/douban?type=show"
                        items={categoryData.variety.items}
                        screenMode={screenMode}
                        tt={tt}
                      />
                    </div>
                  </section>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {announcement && showAnnouncement && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm dark:bg-black/70 p-4 transition-opacity duration-300 ${
            showAnnouncement ? '' : 'opacity-0 pointer-events-none'
          }`}
          onTouchStart={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          onTouchMove={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onTouchEnd={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          style={{
            touchAction: 'none',
          }}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 transform transition-all duration-300 hover:shadow-2xl"
            onTouchMove={(e) => {
              e.stopPropagation();
            }}
            style={{
              touchAction: 'auto',
            }}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-2xl font-bold tracking-tight text-gray-800 dark:text-white border-b border-green-500 pb-1">
                {tt('Notice', '提示', '提示')}
              </h3>
              <button
                onClick={() => handleCloseAnnouncement(announcement)}
                className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-white transition-colors"
                aria-label={tt('Close', '关闭', '關閉')}
              >
                ×
              </button>
            </div>
            <div className="mb-6">
              <div className="relative overflow-hidden rounded-lg mb-4 bg-green-100 dark:bg-green-900/30">
                <div className="absolute inset-y-0 left-0 w-1.5 bg-green-700 dark:bg-green-400"></div>
                <p className="ml-4 text-gray-600 dark:text-gray-300 leading-relaxed">
                  {formattedAnnouncement || announcement}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCloseAnnouncement(announcement)}
              className="w-full rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-4 py-3 text-white font-medium shadow-md hover:shadow-lg hover:from-green-700 hover:to-green-800 dark:from-green-600 dark:to-green-700 dark:hover:from-green-700 dark:hover:to-green-800 transition-all duration-300 transform hover:-translate-y-0.5"
            >
              {tt('Got it', '我知道了', '我知道了')}
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
