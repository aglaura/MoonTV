/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

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
import { detectDeviceInfo } from '@/lib/screenMode';
import { DoubanItem } from '@/lib/types';
import { isKidSafeContent, useKidsMode } from '@/lib/kidsMode.client';
import { useUserLanguage } from '@/lib/userLanguage.client';

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
  originalLanguage?: string;
  originCountry?: string[];
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

type PrefetchedHome = {
  movies: CardItem[];
  tvCn: CardItem[];
  tvKr: CardItem[];
  tvJp: CardItem[];
  tvUs: CardItem[];
  variety: CardItem[];
  latestMovies: CardItem[];
  latestTv: CardItem[];
  tmdbMovies: CardItem[];
  tmdbTv: CardItem[];
  tmdbKr?: CardItem[];
  tmdbJp?: CardItem[];
  tmdbPeople: CardItem[];
  tmdbNowPlaying: CardItem[];
  tmdbOnAir: CardItem[];
  updatedAt?: number;
};

type CardItem = {
  title: string;
  title_en?: string;
  poster?: string;
  posterAlt?: string[];
  posterDouban?: string;
  posterTmdb?: string;
  doubanUrl?: string;
  tmdbUrl?: string;
  originalLanguage?: string;
  originCountry?: string[];
  rate?: string;
  year?: string;
  douban_id?: number;
  imdb_id?: string;
  type?: string;
  query?: string;
  source_name?: string;
  id?: string | number;
};

type CategoryKey =
  | 'movie'
  | 'tv-cn'
  | 'tv-kr'
  | 'tv-jp'
  | 'tv-us'
  | 'variety'
  | 'anime';

type TvSectionId =
  | 'continue'
  | 'category'
  | 'hero'
  | 'spotlight'
  | 'rail-movie'
  | 'rail-tv'
  | 'rail-variety';

const DEFAULT_TV_SECTIONS: TvSectionId[] = [
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
  screenMode: 'tv' | 'desktop' | 'mobile' | 'tablet' | 'pc';
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
        className="relative rounded-2xl border border-gray-200/40 dark:border-gray-800 bg-white/75 dark:bg-gray-900/70 p-4 overflow-hidden group"
      >
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-4">
            <span className="px-3 py-1.5 text-sm font-semibold rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              {tt('TV remote', '电视遥控', '電視遙控')}
            </span>
            <h3 className="text-4xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
              {title}
            </h3>
          </div>
          {href && (
            <Link
              href={href}
              className="text-lg font-semibold text-green-700 dark:text-green-400 flex items-center gap-2 px-4 py-2 rounded-full border border-green-400/50 bg-white/70 dark:bg-white/5"
              data-tv-focusable="true"
              tabIndex={0}
            >
              {tt('See more', '查看更多', '查看更多')}
              <ChevronRight className="w-5 h-5" />
            </Link>
          )}
        </div>

        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-4 pt-2 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory scroll-smooth"
          data-tv-group="rail"
          data-tv-direction="horizontal"
        >
          {noData && (
            <div className="text-gray-500 text-center py-4 min-w-[240px]">
              {tt('No data', '暂无数据', '暫無資料')}
            </div>
          )}

          {items.map((item, idx) => (
            <div
              key={idx}
              className="transition-all duration-200 opacity-95 snap-start rounded-2xl min-w-[240px] max-w-[320px]"
            >
              <VideoCard
                from="douban"
                title={item.title}
                title_en={item.title_en}
                poster={item.poster}
                posterAlt={item.posterAlt}
                posterDouban={item.posterDouban}
                posterTmdb={item.posterTmdb}
                douban_id={item.douban_id}
                imdb_id={item.imdb_id}
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

        <div className="absolute bottom-2 right-3 text-[12px] text-gray-600 dark:text-gray-300 bg-white/70 dark:bg-gray-800/80 rounded-full px-3 py-1 border border-gray-200/70 dark:border-gray-700/70 shadow-sm">
          {tt('Use ← → to move, OK to open', '使用 ← → 导航，确认键进入', '使用 ← → 導航，確認鍵進入')}
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
                title_en={item.title_en}
                poster={item.poster}
                posterAlt={item.posterAlt}
                posterDouban={item.posterDouban}
                posterTmdb={item.posterTmdb}
                douban_id={item.douban_id}
                imdb_id={item.imdb_id}
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
              title_en={item.title_en}
              poster={item.poster}
              posterAlt={item.posterAlt}
              posterDouban={item.posterDouban}
              posterTmdb={item.posterTmdb}
              douban_id={item.douban_id}
              imdb_id={item.imdb_id}
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
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  useEffect(() => {
    if (tabParam === 'favorites') {
      setActiveTab('favorites');
    } else if (tabParam === 'home') {
      setActiveTab('home');
    }
  }, [tabParam]);
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
  const [tmdbKr, setTmdbKr] = useState<TmdbListItem[]>([]);
  const [tmdbJp, setTmdbJp] = useState<TmdbListItem[]>([]);
  const [tmdbPeople, setTmdbPeople] = useState<TmdbPerson[]>([]);
  const [tmdbNowPlaying, setTmdbNowPlaying] = useState<TmdbListItem[]>([]);
  const [tmdbOnAir, setTmdbOnAir] = useState<TmdbListItem[]>([]);
  const [prefetchedHome, setPrefetchedHome] = useState<PrefetchedHome | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<CategoryKey>('movie');
  const [screenMode, setScreenMode] = useState<
    'tv' | 'desktop' | 'mobile' | 'tablet' | 'pc'
  >(() => (typeof window === 'undefined' ? 'desktop' : detectDeviceInfo().screenMode));
  const [resolutionTag, setResolutionTag] = useState(() =>
    typeof window === 'undefined' ? '' : (() => {
      const w = Math.max(Math.round(window.innerWidth), 1);
      const h = Math.max(Math.round(window.innerHeight), 1);
      const dpr = Math.max(window.devicePixelRatio || 1, 1);
      const physicalW = Math.round(w * dpr);
      const physicalH = Math.round(h * dpr);
      const density = dpr > 1 ? ` @${Number(dpr.toFixed(2))}x` : '';
      return `${physicalW}x${physicalH}${density}`;
    })()
  );
  const computeResolutionTag = useCallback(() => {
    if (typeof window === 'undefined') return '';
    const w = Math.max(Math.round(window.innerWidth), 1);
    const h = Math.max(Math.round(window.innerHeight), 1);
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    const physicalW = Math.round(w * dpr);
    const physicalH = Math.round(h * dpr);
    const density = dpr > 1 ? ` @${Number(dpr.toFixed(2))}x` : '';
    return `${physicalW}x${physicalH}${density}`;
  }, []);
  const topBarModeLabel = useMemo(() => {
    const resSuffix = resolutionTag ? ` · ${resolutionTag}` : '';
    if (screenMode === 'tv') {
      return `${tt('TV mode', '电视模式', '電視模式')}${resSuffix}`;
    }
    if (screenMode === 'tablet') {
      return `${tt('Tablet mode', '平板模式', '平板模式')}${resSuffix}`;
    }
    if (screenMode === 'pc') {
      return `${tt('PC mode', '桌面模式', '桌面模式')}${resSuffix}`;
    }
    if (screenMode === 'desktop') {
      return `${tt('Desktop mode', '桌面模式', '桌面模式')}${resSuffix}`;
    }
    return undefined;
  }, [resolutionTag, screenMode, tt]);
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
  const tvSectionList = useMemo<TvSectionId[]>(() => {
    if (screenMode === 'tv') {
      return ['hero', 'continue', 'rail-movie', 'rail-tv', 'rail-variety'];
    }
    return DEFAULT_TV_SECTIONS;
  }, [screenMode]);
  useEffect(() => {
    setTvSectionIndex(0);
  }, [tvSectionList]);

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

        const bangumiPromise = GetBangumiCalendarData();

        let mergedOk = false;
        try {
          const mergedRes = await fetch('/api/home/merged', {
            cache: 'force-cache',
          });
          if (mergedRes.ok) {
            const merged = (await mergedRes.json()) as PrefetchedHome;
            setPrefetchedHome(merged);
            mergedOk = true;
          } else {
            setPrefetchedHome(null);
          }
        } catch {
          setPrefetchedHome(null);
        }

        if (!mergedOk) {
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

          const tmdbPromise = fetch('/api/imdb/list', {
            cache: 'force-cache',
          }).then(async (res) => {
            if (!res.ok) throw new Error(`TMDB list failed (${res.status})`);
          return (await res.json()) as {
            movies?: TmdbListItem[];
            tv?: TmdbListItem[];
            krTv?: TmdbListItem[];
            jpTv?: TmdbListItem[];
            people?: TmdbPerson[];
            nowPlaying?: TmdbListItem[];
            onAir?: TmdbListItem[];
          };
        });

          const [doubanRes, tmdbRes] = await Promise.allSettled([
            doubanPromise,
            tmdbPromise,
          ]);

          if (doubanRes.status === 'fulfilled') {
            const doubanHome = doubanRes.value;
            setHotMovies(
              Array.isArray(doubanHome?.movies) ? doubanHome.movies : []
            );
            setHotTvShows(Array.isArray(doubanHome?.tv) ? doubanHome.tv : []);
            setLatestMoviesDouban(
              Array.isArray(doubanHome?.latestMovies)
                ? doubanHome.latestMovies
                : []
            );
            setLatestTvDouban(
              Array.isArray(doubanHome?.latestTv) ? doubanHome.latestTv : []
            );
            setHotVarietyShows(
              Array.isArray(doubanHome?.variety) ? doubanHome.variety : []
            );
          }

          if (tmdbRes.status === 'fulfilled') {
            const data = tmdbRes.value;
            setTmdbMovies(Array.isArray(data.movies) ? data.movies : []);
            setTmdbTv(Array.isArray(data.tv) ? data.tv : []);
            setTmdbKr(Array.isArray(data.krTv) ? data.krTv : []);
            setTmdbJp(Array.isArray(data.jpTv) ? data.jpTv : []);
            setTmdbPeople(Array.isArray(data.people) ? data.people : []);
            setTmdbNowPlaying(
              Array.isArray(data.nowPlaying) ? data.nowPlaying : []
            );
            setTmdbOnAir(Array.isArray(data.onAir) ? data.onAir : []);
          }

          if (doubanRes.status === 'rejected' && tmdbRes.status === 'rejected') {
            setError(true);
          }
        }

        const bangumiRes = await Promise.allSettled([bangumiPromise]);
        if (bangumiRes[0]?.status === 'fulfilled') {
          setBangumiCalendarData(bangumiRes[0].value);
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
      const nextInfo = detectDeviceInfo();
      setScreenMode(nextInfo.screenMode);
      setResolutionTag(computeResolutionTag());
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [computeResolutionTag]);

  useEffect(() => {
    if (screenMode === 'tv' && activeTab !== 'home' && activeTab !== 'favorites') {
      setActiveTab('home');
    }
  }, [screenMode, activeTab]);

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
        title_en: item.originalTitle,
        poster: item.poster,
        posterAlt: [item.poster].filter(Boolean),
        posterTmdb: item.poster,
        tmdbUrl: `https://www.themoviedb.org/movie/${item.tmdbId?.replace('tmdb:', '') ?? ''}`,
        originalLanguage: item.originalLanguage,
        originCountry: item.originCountry,
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
        title_en: item.originalTitle,
        poster: item.poster,
        posterAlt: [item.poster].filter(Boolean),
        posterTmdb: item.poster,
        tmdbUrl: `https://www.themoviedb.org/tv/${item.tmdbId?.replace('tmdb:', '') ?? ''}`,
        originalLanguage: item.originalLanguage,
        originCountry: item.originCountry,
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

  const tmdbKrCards = useMemo(
    () =>
      (tmdbKr || []).map((item) => ({
        title: item.title,
        title_en: item.originalTitle,
        poster: item.poster,
        posterAlt: [item.poster].filter(Boolean),
        posterTmdb: item.poster,
        tmdbUrl: `https://www.themoviedb.org/tv/${item.tmdbId?.replace('tmdb:', '') ?? ''}`,
        originalLanguage: item.originalLanguage,
        originCountry: item.originCountry,
        rate: '',
        year: item.year,
        type: 'tv',
        query: item.title,
        imdb_id: item.imdbId,
        douban_id: item.doubanId ? Number(item.doubanId) : undefined,
        source_name: 'TMDB',
        id: item.tmdbId,
      })),
    [tmdbKr]
  );

  const tmdbJpCards = useMemo(
    () =>
      (tmdbJp || []).map((item) => ({
        title: item.title,
        title_en: item.originalTitle,
        poster: item.poster,
        posterAlt: [item.poster].filter(Boolean),
        posterTmdb: item.poster,
        tmdbUrl: `https://www.themoviedb.org/tv/${item.tmdbId?.replace('tmdb:', '') ?? ''}`,
        originalLanguage: item.originalLanguage,
        originCountry: item.originCountry,
        rate: '',
        year: item.year,
        type: 'tv',
        query: item.title,
        imdb_id: item.imdbId,
        douban_id: item.doubanId ? Number(item.doubanId) : undefined,
        source_name: 'TMDB',
        id: item.tmdbId,
      })),
    [tmdbJp]
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
        const doubanUrl = `https://movie.douban.com/subject/${item.id}`;
        return {
          title: localizedTitle,
          poster: item.poster,
          posterAlt: [item.poster].filter(Boolean),
          posterDouban: item.poster,
          doubanUrl,
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
          const alt = new Set(
            [
              ...(item.posterAlt || []),
              item.poster,
              item.posterDouban,
              item.posterTmdb,
            ].filter(Boolean)
          );
          map.set(key, { ...item, posterAlt: Array.from(alt) as string[] });
          if (posterMap && item.poster) posterMap.set(key, item.poster);
          return;
        }
        if (posterMap && !posterMap.has(key) && item.poster) {
          posterMap.set(key, item.poster);
        }
        const mergedDouban = existing.posterDouban || item.posterDouban;
        const mergedTmdb = existing.posterTmdb || item.posterTmdb;
        const mergedPoster =
          existing.poster ||
          item.poster ||
          mergedDouban ||
          mergedTmdb ||
          existing.posterAlt?.[0] ||
          item.posterAlt?.[0];
        const mergedAlt = new Set(
          [
            ...(existing.posterAlt || []),
            ...(item.posterAlt || []),
            existing.poster,
            item.poster,
            mergedDouban,
            mergedTmdb,
          ].filter(Boolean)
        );
        map.set(key, {
          ...existing,
          ...item,
          poster: mergedPoster,
          posterDouban: mergedDouban,
          posterTmdb: mergedTmdb,
          posterAlt: Array.from(mergedAlt) as string[],
          rate: existing.rate || item.rate,
          year: existing.year || item.year,
          query: existing.query || item.query,
          source_name: existing.source_name || item.source_name,
          type: existing.type || item.type,
          doubanUrl: existing.doubanUrl || item.doubanUrl,
          tmdbUrl: existing.tmdbUrl || item.tmdbUrl,
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
        title_en: item.originalTitle,
        poster: item.poster,
        posterAlt: [item.poster].filter(Boolean),
        posterTmdb: item.poster,
        tmdbUrl: `https://www.themoviedb.org/movie/${item.tmdbId?.replace('tmdb:', '') ?? ''}`,
        originalLanguage: item.originalLanguage,
        originCountry: item.originCountry,
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
        title_en: item.originalTitle,
        poster: item.poster,
        posterAlt: [item.poster].filter(Boolean),
        posterTmdb: item.poster,
        tmdbUrl: `https://www.themoviedb.org/tv/${item.tmdbId?.replace('tmdb:', '') ?? ''}`,
        originalLanguage: item.originalLanguage,
        originCountry: item.originCountry,
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

  const effectiveTmdbMovies = prefetchedHome?.tmdbMovies ?? tmdbMovieCards;
  const effectiveTmdbTv = prefetchedHome?.tmdbTv ?? tmdbTvCards;
  const effectiveTmdbPeople = prefetchedHome?.tmdbPeople ?? tmdbPeopleCards;
  const effectiveTmdbNowPlaying =
    prefetchedHome?.tmdbNowPlaying ?? tmdbNowPlayingCards;
  const effectiveTmdbOnAir = prefetchedHome?.tmdbOnAir ?? tmdbOnAirCards;
  const effectiveLatestMovies =
    prefetchedHome?.latestMovies ??
    mergeCards(mapDoubanCards(latestMoviesDouban, 'movie'), effectiveTmdbNowPlaying);
  const effectiveLatestTv =
    prefetchedHome?.latestTv ??
    mergeCards(mapDoubanCards(latestTvDouban, 'tv'), effectiveTmdbOnAir);

  const [hotTvShowsCn, hotTvShowsKr, hotTvShowsJp, hotTvShowsUsEu] = useMemo(() => {
    const krList: DoubanItem[] = [];
    const jpList: DoubanItem[] = [];
    const cnList: DoubanItem[] = [];
    const usEuList: DoubanItem[] = [];
    const regionFromItem = (item: DoubanItem) => {
      if (item.region === 'kr' || item.region === 'jp') return item.region;
      if (item.region === 'cn' || item.region === 'hk' || item.region === 'tw')
        return 'cn';
      const subtitle = (item.subtitle || '').toLowerCase();
      if (/韩|韓|korean|kr/.test(subtitle)) return 'kr';
      if (/日|japan|jp/.test(subtitle)) return 'jp';
      if (/日本动漫|日本動漫|日漫|動畫|动漫/.test(subtitle)) return 'jp';
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
      if (region === 'kr') {
        krList.push(item);
      } else if (region === 'jp') {
        jpList.push(item);
      } else if (isKrJpTitle(item.title)) {
        jpList.push(item);
      } else if (region === 'cn' || isCnTitle(item.title)) {
        cnList.push(item);
      } else {
        usEuList.push(item);
      }
    });
    return [cnList, krList, jpList, usEuList];
  }, [hotTvShows]);

  const isKrTmdb = useCallback((item: CardItem) => {
    const lang = (item.originalLanguage || '').toLowerCase();
    if (lang === 'ko') return true;
    const countries = Array.isArray(item.originCountry) ? item.originCountry : [];
    if (countries.includes('KR')) return true;
    const title = item.title || '';
    if (/[가-힣]/.test(title)) return true;
    return /韩剧|韓劇|韓/.test(title);
  }, []);

  const isJpTmdb = useCallback((item: CardItem) => {
    const lang = (item.originalLanguage || '').toLowerCase();
    if (lang === 'ja') return true;
    const countries = Array.isArray(item.originCountry) ? item.originCountry : [];
    if (countries.includes('JP')) return true;
    const title = item.title || '';
    if (/[ぁ-ゔァ-ヴ]/.test(title)) return true;
    return /日剧|日劇|日版|日本/.test(title);
  }, []);

  const categoryData = useMemo<
    Record<
      CategoryKey,
      { label: string; items: CardItem[]; seeMore?: string; hint: string }
    >
  >(() => {
    if (prefetchedHome) {
      return {
        posterMap: new Map<string, string>(),
        movie: {
          label: tt('Movies', '电影', '電影'),
          items: applyKidsFilter(prefetchedHome.movies || []),
          seeMore: '/douban?type=movie',
          hint: tt('Cinema picks for today', '今日影院精选', '今日影院精選'),
        },
        'tv-cn': {
          label: tt('Chinese TV', '华语剧集', '華語劇集'),
          items: applyKidsFilter(prefetchedHome.tvCn || []),
          seeMore: '/douban?type=tv&region=cn',
          hint: tt('Domestic picks', '热门华语剧', '熱門華語劇'),
        },
        'tv-kr': {
          label: tt('Korean TV', '韩剧', '韓劇'),
          items: applyKidsFilter(prefetchedHome.tvKr || []),
          seeMore: '/douban?type=tv&region=kr',
          hint: tt('Korean hits', '热门韩剧', '熱門韓劇'),
        },
        'tv-jp': {
          label: tt('Japanese TV', '日剧', '日劇'),
          items: applyKidsFilter(prefetchedHome.tvJp || []),
          seeMore: '/douban?type=tv&region=jp',
          hint: tt('Japanese hits', '热门日剧', '熱門日劇'),
        },
        'tv-us': {
          label: tt('US/Europe TV', '欧美剧集', '歐美劇集'),
          items: applyKidsFilter(prefetchedHome.tvUs || []),
          seeMore: '/douban?type=tv&region=us',
          hint: tt('Western series', '热门欧美剧', '熱門歐美劇'),
        },
        variety: {
          label: tt('Variety', '综艺', '綜藝'),
          items: applyKidsFilter(prefetchedHome.variety || []),
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
    }

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
    const tmdbTvKr = mergeCards(
      tmdbTvCards.filter(isKrTmdb),
      tmdbKrCards,
      true,
      posterMap
    );
    const tmdbTvJp = mergeCards(
      tmdbTvCards.filter(isJpTmdb),
      tmdbJpCards,
      true,
      posterMap
    );
    const mergedTvKr = mergeCards(
      mapDoubanCards(hotTvShowsKr, 'tv'),
      tmdbTvKr,
      true,
      posterMap
    );
    const mergedTvJp = mergeCards(
      mapDoubanCards(hotTvShowsJp, 'tv'),
      tmdbTvJp,
      true,
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
      'tv-kr': {
        label: tt('Korean TV', '韩剧', '韓劇'),
        items: applyKidsFilter(mergedTvKr),
        seeMore: '/douban?type=tv&region=kr',
        hint: tt('Korean hits', '热门韩剧', '熱門韓劇'),
      },
      'tv-jp': {
        label: tt('Japanese TV', '日剧', '日劇'),
        items: applyKidsFilter(mergedTvJp),
        seeMore: '/douban?type=tv&region=jp',
        hint: tt('Japanese hits', '热门日剧', '熱門日劇'),
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
    prefetchedHome,
    hotMovies,
    hotTvShowsCn,
    hotTvShowsKr,
    hotTvShowsJp,
    hotTvShowsUsEu,
    hotVarietyShows,
    tmdbMovies,
    tmdbTv,
    tmdbKr,
    tmdbJp,
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
    ? 'flex flex-col gap-8 xl:gap-10'
    : isMobile
    ? 'flex flex-col gap-6'
    : 'flex flex-col gap-6 xl:gap-8';
  const tvCategoryButtonClass = isTV
    ? 'px-5 py-2.5 text-base'
    : 'px-4 py-2 text-sm';
  const tvSortButtonClass = isTV
    ? 'px-4 py-2 text-sm'
    : 'px-3 py-1.5 text-xs sm:text-sm';

  const currentTvSection =
    isTV && activeTab === 'home'
      ? tvSectionList[Math.min(tvSectionIndex, tvSectionList.length - 1)] || null
      : null;

  const renderFavorites = () => (
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
            {tt('No favorites yet', '暂无收藏内容', '暫無收藏內容')}
          </div>
        )}
      </div>
    </section>
  );

  const tvSectionClass = (id: TvSectionId) =>
    isTV && activeTab === 'home'
      ? currentTvSection === id
        ? 'ring-4 ring-emerald-400 shadow-[0_0_0_1px_rgba(16,185,129,0.7)] shadow-emerald-700/40 scale-[1.01] focus-within:ring-4 focus-within:ring-emerald-400/70'
        : 'opacity-60 hover:opacity-80 focus-within:opacity-100 focus-within:ring-4 focus-within:ring-emerald-400/70'
      : '';

  // Global TV remote navigation (DPAD)
  useEffect(() => {
    if (!isTV || activeTab !== 'home') return;

    const getFocusables = (root: HTMLElement | Document = document) =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          '[data-tv-focusable="true"], button, [role="button"], a, [tabindex="0"]'
        )
      ).filter((el) => !el.hasAttribute('disabled'));

    const focusFirstInSection = (id: TvSectionId | null) => {
      if (!id) return false;
      const sectionEl = document.querySelector<HTMLElement>(
        `[data-tv-section="${id}"]`
      );
      if (!sectionEl) return false;
      const focusable = getFocusables(sectionEl)[0];
      if (focusable) {
        focusable.focus({ preventScroll: true });
        return true;
      }
      return false;
    };

    const moveInGroup = (
      group: HTMLElement,
      activeEl: HTMLElement,
      key: string
    ) => {
      const direction = group.getAttribute('data-tv-direction') || 'grid';
      const focusables = getFocusables(group);
      const currentIndex = focusables.indexOf(activeEl);
      if (currentIndex < 0) return false;
      const forwardKeys =
        direction === 'horizontal'
          ? ['ArrowRight']
          : direction === 'vertical'
          ? ['ArrowDown']
          : ['ArrowRight', 'ArrowDown'];
      const backKeys =
        direction === 'horizontal'
          ? ['ArrowLeft']
          : direction === 'vertical'
          ? ['ArrowUp']
          : ['ArrowLeft', 'ArrowUp'];

      if (forwardKeys.includes(key)) {
        const next = focusables[currentIndex + 1];
        if (next) {
          next.focus({ preventScroll: true });
          return true;
        }
      }
      if (backKeys.includes(key)) {
        const prev = focusables[currentIndex - 1];
        if (prev) {
          prev.focus({ preventScroll: true });
          return true;
        }
      }
      return false;
    };

    const moveInSectionLinear = (direction: 'next' | 'prev') => {
      if (!currentTvSection) return false;
      const sectionEl = document.querySelector<HTMLElement>(
        `[data-tv-section="${currentTvSection}"]`
      );
      if (!sectionEl) return false;
      const focusables = getFocusables(sectionEl);
      if (focusables.length === 0) return false;
      const activeEl = document.activeElement as HTMLElement | null;
      const idx = activeEl ? focusables.indexOf(activeEl) : -1;
      const next =
        direction === 'next'
          ? focusables[Math.min(idx + 1, focusables.length - 1)]
          : focusables[Math.max(idx - 1, 0)];
      if (next) {
        next.focus({ preventScroll: true });
        return true;
      }
      return false;
    };

    const handleKey = (e: KeyboardEvent) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const group = activeEl?.closest<HTMLElement>('[data-tv-group]');

      // Move within grouped rails/grids first
      if (group && activeEl) {
        const moved = moveInGroup(group, activeEl, e.key);
        if (moved) {
          e.preventDefault();
          return;
        }
      }

      if (e.key === 'ArrowRight') {
        const moved = moveInSectionLinear('next');
        if (moved) {
          e.preventDefault();
          return;
        }
      }
      if (e.key === 'ArrowLeft') {
        const moved = moveInSectionLinear('prev');
        if (moved) {
          e.preventDefault();
          return;
        }
        const sidebar = document.querySelector<HTMLElement>('[data-sidebar]');
        if (sidebar) {
          const focusables = getFocusables(sidebar);
          if (focusables.length > 0) {
            focusables[0].focus({ preventScroll: true });
            e.preventDefault();
            return;
          }
        }
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setTvSectionIndex((prev) => {
          const next = prev < tvSectionList.length - 1 ? prev + 1 : prev;
          setTimeout(() => focusFirstInSection(tvSectionList[next]), 0);
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setTvSectionIndex((prev) => {
          const next = prev > 0 ? prev - 1 : prev;
          setTimeout(() => focusFirstInSection(tvSectionList[next]), 0);
          return next;
        });
      } else if (e.key === 'Enter') {
        // Let focused element handle click/keypress naturally
        const target = document.activeElement as HTMLElement | null;
        if (target) {
          const evt = new MouseEvent('click', { bubbles: true });
          target.dispatchEvent(evt);
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isTV, activeTab, currentTvSection]);

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

  useEffect(() => {
    if (!isTV || activeTab !== 'home') return;
    if (!currentTvSection) return;

    const sectionEl = document.querySelector<HTMLElement>(
      `[data-tv-section="${currentTvSection}"]`
    );
    if (!sectionEl) return;
    const focusable =
      sectionEl.querySelector<HTMLElement>('[data-tv-focusable="true"]') ||
      sectionEl.querySelector<HTMLElement>('button, [tabindex="0"]');
    focusable?.focus({ preventScroll: true });
  }, [currentTvSection, isTV, activeTab]);

  return (
    <PageLayout topBarModeLabel={topBarModeLabel}>
      <div className="px-2 sm:px-6 lg:px-10 xl:px-12 py-4 sm:py-8 overflow-visible w-full">
        {isKidsMode && (
          <div className="mb-3 flex justify-center">
            <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold dark:bg-amber-900/60 dark:text-amber-50 border border-amber-200 dark:border-amber-700">
              {tt('Kids mode is on', '少儿模式已开启', '少兒模式已開啟')}
            </span>
          </div>
        )}
        {!isTV && (
          <div className="mb-6 sm:mb-8 flex justify-center gap-2">
            <button
              onClick={() => setActiveTab('home')}
              className={`px-4 py-2 rounded-full text-sm font-semibold border ${
                activeTab === 'home'
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-emerald-400'
              }`}
            >
              {tt('Home', '首页', '首頁')}
            </button>
            <button
              onClick={() => setActiveTab('favorites')}
              className={`px-4 py-2 rounded-full text-sm font-semibold border ${
                activeTab === 'favorites'
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-emerald-400'
              }`}
            >
              {tt('Favorites', '收藏夹', '收藏夾')}
            </button>
          </div>
        )}
        <div className="w-full">
          {isTV ? (
            activeTab === 'favorites' ? (
              renderFavorites()
            ) : (
              <>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                  {tt('Home', '首页', '首頁')}
                </h2>
              </div>
              <div className={mainLayoutClass}>
                <div className="flex flex-col gap-6 sm:gap-8">
                  {/* 精选推荐 */}
                  {!loading && !error && (
                    <section
                      data-tv-section="hero"
                      className={tvSectionClass('hero')}
                    >
                      <div
                        className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory scroll-smooth"
                        data-tv-group="hero"
                        data-tv-direction="horizontal"
                      >
                        {heroItems.slice(0, 10).map((item, idx) => (
                          <div
                            key={idx}
                            className="min-w-[240px] max-w-[320px] snap-start"
                          >
                            <VideoCard
                              query={item.query}
                              {...item}
                              id={item.id ? String(item.id) : undefined}
                              size="lg"
                              compactMeta
                              from="douban"
                            />
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* 继续观看 */}
                  <section
                    data-tv-section="continue"
                    className={tvSectionClass('continue')}
                  >
                    <ContinueWatching isTV={isTV} />
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

                  {!loading && !error && (
                    <>
                      {/* Rails */}
                      <section
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
                      </section>
                      <section className={tvSectionClass('rail-movie')}>
                        <ContentRail
                          title={tt('Trending movies (TMDB)', 'TMDB 热门电影', 'TMDB 熱門電影')}
                          href="#"
                          items={applyKidsFilter(
                            applyPosterOverrides(effectiveTmdbMovies)
                          )}
                          screenMode={screenMode}
                          tt={tt}
                        />
                      </section>
                      <section className={tvSectionClass('rail-movie')}>
                        <ContentRail
                          title={tt('Latest movies', '最新电影', '最新電影')}
                          href="#"
                          items={applyKidsFilter(
                            applyPosterOverrides(effectiveLatestMovies)
                          )}
                          screenMode={screenMode}
                          tt={tt}
                        />
                      </section>

                      <section
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
                          title={tt('Trending TV (TMDB)', 'TMDB 热门剧集', 'TMDB 熱門劇集')}
                          href="#"
                          items={applyKidsFilter(
                            applyPosterOverrides(effectiveTmdbTv)
                          )}
                          screenMode={screenMode}
                          tt={tt}
                        />
                        <ContentRail
                          title={tt('Latest TV', '最新剧集', '最新劇集')}
                          href="#"
                          items={applyKidsFilter(
                            applyPosterOverrides(effectiveLatestTv)
                          )}
                          screenMode={screenMode}
                          tt={tt}
                        />
                      </section>
                      {effectiveTmdbPeople.length > 0 && (
                        <section className={tvSectionClass('rail-variety')}>
                          <ContentRail
                            title={tt('Trending people (TMDB)', 'TMDB 热门影人', 'TMDB 熱門影人')}
                            href="#"
                            items={effectiveTmdbPeople}
                            screenMode={screenMode}
                            tt={tt}
                          />
                        </section>
                      )}
                      <section
                        data-tv-section="rail-variety"
                        className={tvSectionClass('rail-variety')}
                      >
                        <ContentRail
                          title={tt('Hot variety', '热门综艺', '熱門綜藝')}
                          href="#"
                          items={categoryData.variety.items}
                          screenMode={screenMode}
                          tt={tt}
                        />
                      </section>
                    </>
                  )}
                </div>
              </div>
              {loading && (
                <div className="w-full h-64 flex items-center justify-center text-gray-500">
                  {tt('Loading...', '加载中...', '載入中...')}
                </div>
              )}
              </>
            )
          ) : activeTab === 'favorites' ? (
            renderFavorites()
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
                    <ContinueWatching isTV={isTV} />
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
                      <div
                        className="flex flex-wrap gap-2"
                        data-tv-group="category"
                        data-tv-direction="horizontal"
                      >
                        {(Object.keys(categoryData) as CategoryKey[]).map(
                          (key) => {
                            const cfg = categoryData[key];
                            const active = category === key;
                            return (
                              <button
                                key={key}
                                onClick={() => setCategory(key)}
                                data-tv-focusable="true"
                                className={`relative ${tvCategoryButtonClass} rounded-full font-semibold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/70 ${
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
                      <div
                        className="flex flex-wrap items-center gap-2 text-xs sm:text-sm"
                        data-tv-group="sort"
                        data-tv-direction="horizontal"
                      >
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
                                data-tv-focusable="true"
                                className={`${tvSortButtonClass} rounded-full border transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400/70 ${
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
                      <div
                        className={`text-gray-600 dark:text-gray-400 flex items-center justify-between ${
                          isTV ? 'text-base' : 'text-sm'
                        }`}
                      >
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
                        <div
                          className={`flex items-center gap-2 uppercase tracking-[0.2em] text-green-700 dark:text-green-300 ${
                            isTV ? 'text-sm' : 'text-xs'
                          }`}
                        >
                          <span>{currentCategory.label}</span>
                          <span className='w-1 h-1 rounded-full bg-green-700 dark:bg-green-500'></span>
                          <span className='text-gray-600 dark:text-gray-300'>
                            {tt('Spotlight', '精选轮播', '精選輪播')}
                          </span>
                        </div>
                        <p className={`${isTV ? 'text-base' : 'text-sm'} text-gray-600 dark:text-gray-300`}>
                          {tt('Swipe through highlights; tap to open.', '左右滑动浏览精选，点击打开播放。', '左右滑動瀏覽精選，點擊開啟播放。')}
                        </p>
                      </div>
                    </div>
                    <div className='px-3 sm:px-4 pb-4'>
                      <div
                        className='flex gap-3 overflow-x-auto [-ms-overflow-style:"none"] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'
                        data-tv-group={isTV ? 'hero' : undefined}
                        data-tv-direction={isTV ? 'horizontal' : undefined}
                      >
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
                                title_en={item.title_en}
                                poster={item.poster}
                                posterAlt={item.posterAlt}
                                posterDouban={item.posterDouban}
                                posterTmdb={item.posterTmdb}
                                douban_id={item.douban_id}
                                imdb_id={item.imdb_id}
                                rate={item.rate}
                                year={item.year}
                                type={item.type}
                                query={item.query || item.title}
                                source_name={item.source_name}
                                size={isTV ? 'lg' : undefined}
                                compactMeta={isTV}
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
                          : isTV
                          ? 'grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-5'
                          : 'grid-cols-3 sm:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4 sm:gap-5'
                      }`}
                      data-tv-group={isTV ? 'spotlight' : undefined}
                      data-tv-direction={isTV ? 'grid' : undefined}
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
                                title_en={item.title_en}
                                poster={item.poster}
                                posterAlt={item.posterAlt}
                                posterDouban={item.posterDouban}
                                posterTmdb={item.posterTmdb}
                                douban_id={item.douban_id}
                                imdb_id={item.imdb_id}
                                rate={item.rate}
                                year={item.year}
                                type={item.type}
                                query={item.query}
                                source_name={item.source_name}
                                size={isTV ? 'lg' : undefined}
                                compactMeta={isTV}
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
                        items={applyKidsFilter(
                          applyPosterOverrides(effectiveTmdbMovies)
                        )}
                        screenMode={screenMode}
                        tt={tt}
                      />
                    </div>
                    <div className={tvSectionClass('rail-movie')}>
                      <ContentRail
                        title={tt('Latest movies', '最新电影', '最新電影')}
                        href="#"
                        items={applyKidsFilter(
                          applyPosterOverrides(effectiveLatestMovies)
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
                        title={tt('Hot KR TV', '热门韩剧', '熱門韓劇')}
                        href="/douban?type=tv&region=kr"
                        items={categoryData['tv-kr'].items}
                        screenMode={screenMode}
                        tt={tt}
                      />
                      <ContentRail
                        title={tt('Hot JP TV', '热门日剧', '熱門日劇')}
                        href="/douban?type=tv&region=jp"
                        items={categoryData['tv-jp'].items}
                        screenMode={screenMode}
                        tt={tt}
                      />
                      <ContentRail
                        title={tt('Trending TV (TMDB)', 'TMDB 热门剧集', 'TMDB 熱門劇集')}
                        href="#"
                        items={applyKidsFilter(
                          applyPosterOverrides(effectiveTmdbTv)
                        )}
                        screenMode={screenMode}
                        tt={tt}
                      />
                      <ContentRail
                        title={tt('Latest TV', '最新剧集', '最新劇集')}
                        href="#"
                        items={applyKidsFilter(
                          applyPosterOverrides(effectiveLatestTv)
                        )}
                        screenMode={screenMode}
                        tt={tt}
                      />
                    </div>
                    {effectiveTmdbPeople.length > 0 && (
                      <div className={tvSectionClass('rail-variety')}>
                        <ContentRail
                          title={tt('Trending people (TMDB)', 'TMDB 热门影人', 'TMDB 熱門影人')}
                          href="#"
                          items={effectiveTmdbPeople}
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
