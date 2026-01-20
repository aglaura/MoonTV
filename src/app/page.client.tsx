/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight } from 'lucide-react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

// 客户端收藏 API
import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import type { CategoryKey, TvSectionId, UiLocale } from '@/lib/home.types';
import { useKidsMode } from '@/lib/kidsMode.client';
import { convertToTraditional } from '@/lib/locale';
import {
  detectDeviceInfo,
  setScreenModeOverride,
} from '@/lib/screenMode';
import type { OsFamily, ScreenMode, ScreenModeOverride } from '@/lib/screenMode';
import { useHomeData } from '@/lib/useHomeData.client';
import { useTvSectionNavigation } from '@/lib/useTvSectionNavigation';
import { useUserLanguage } from '@/lib/userLanguage.client';

import ContinueWatching from '@/components/ContinueWatching';
import ContentRail from '@/components/home/ContentRail';
import PageLayout from '@/components/PageLayout';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';

const TvHome = dynamic(() => import('@/components/home/TvHome'), { ssr: false });

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
  const [category, setCategory] = useState<CategoryKey>('movie');
  const [screenMode, setScreenMode] = useState<ScreenMode>(() =>
    typeof window === 'undefined' ? 'tablet' : detectDeviceInfo().screenMode
  );
  const [osFamily, setOsFamily] = useState<OsFamily>(() =>
    typeof window === 'undefined' ? 'other' : detectDeviceInfo().osFamily
  );
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
  const osLabel = useMemo(() => {
    switch (osFamily) {
      case 'windows':
        return 'Windows';
      case 'ios':
        return 'iOS';
      case 'macos':
        return 'macOS';
      case 'android':
        return 'Android';
      case 'linux':
        return 'Linux';
      default:
        return 'Other';
    }
  }, [osFamily]);
  const topBarModeLabel = useMemo(() => {
    const resSuffix = resolutionTag ? ` · ${resolutionTag}` : '';
    const osSuffix = osLabel ? ` · ${osLabel}` : '';
    if (screenMode === 'tv') {
      return `${tt('TV mode', '电视模式', '電視模式')}${osSuffix}${resSuffix}`;
    }
    if (screenMode === 'tablet') {
      return `${tt('Tablet mode', '平板模式', '平板模式')}${osSuffix}${resSuffix}`;
    }
    return undefined;
  }, [osLabel, resolutionTag, screenMode, tt]);
  const canToggleMode = useMemo(
    () => osFamily !== 'windows' && osFamily !== 'ios' && osFamily !== 'macos',
    [osFamily]
  );
  const handleToggleMode = useCallback(() => {
    if (screenMode === 'mobile') return;
    if (!canToggleMode) return;
    const nextMode: ScreenModeOverride = screenMode === 'tv' ? 'tablet' : 'tv';
    setScreenModeOverride(nextMode);
    const nextInfo = detectDeviceInfo();
    setScreenMode(nextInfo.screenMode);
    setOsFamily(nextInfo.osFamily);
    setResolutionTag(computeResolutionTag());
  }, [canToggleMode, computeResolutionTag, screenMode]);
  const [sortMode, setSortMode] = useState<'trending' | 'newest' | 'rating'>(
    'trending'
  );
  const [heroIndex, setHeroIndex] = useState(0);
  const { announcement } = useSite();
  const { isKidsMode } = useKidsMode();
  const {
    loading,
    error,
    categoryData,
    heroItems,
    effectiveTmdbMovies,
    effectiveLatestMovies,
    effectiveTmdbTv,
    effectiveLatestTv,
    effectiveTmdbPeople,
    applyKidsFilter,
    applyPosterOverrides,
  } = useHomeData({ uiLocale, isKidsMode, category });
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
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      const nextInfo = detectDeviceInfo();
      setScreenMode(nextInfo.screenMode);
      setOsFamily(nextInfo.osFamily);
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

  const currentCategory = categoryData[category];

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
    if (uiLocale === 'zh-Hant') {
      return convertToTraditional(announcement);
    }
    return announcement;
  }, [announcement, uiLocale]);

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
  const useCustomTvHomeNav = isTV && activeTab === 'home';

  useTvSectionNavigation({
    enabled: isTV && activeTab === 'home' && !useCustomTvHomeNav,
    sections: tvSectionList,
    currentSection: currentTvSection,
    setSectionIndex: setTvSectionIndex,
  });

  return (
    <PageLayout
      topBarModeLabel={topBarModeLabel}
      onTopBarModeClick={
        topBarModeLabel && canToggleMode ? handleToggleMode : undefined
      }
    >
      <div className="px-2 sm:px-6 lg:px-10 xl:px-12 py-4 sm:py-8 overflow-visible w-full">
        {isKidsMode && (
          <div className="mb-3 flex justify-center">
            <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold dark:bg-amber-900/60 dark:text-amber-50 border border-amber-200 dark:border-amber-700">
              {tt('Kids mode is on', '少儿模式已开启', '少兒模式已開啟')}
            </span>
          </div>
        )}
        {!isTV && (
          <div
            className={`mb-6 sm:mb-8 flex gap-2 ${
              screenMode === 'tablet' ? 'justify-start' : 'justify-center'
            }`}
          >
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
              <TvHome
                tt={tt}
                screenMode={screenMode}
                heroItems={heroItems}
                categoryData={categoryData}
                effectiveTmdbMovies={effectiveTmdbMovies}
                effectiveLatestMovies={effectiveLatestMovies}
                effectiveTmdbTv={effectiveTmdbTv}
                effectiveLatestTv={effectiveLatestTv}
                effectiveTmdbPeople={effectiveTmdbPeople}
                applyKidsFilter={applyKidsFilter}
                applyPosterOverrides={applyPosterOverrides}
                loading={loading}
                error={error}
                tvSectionClass={tvSectionClass}
                ContentRail={ContentRail}
              />
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

                  <section className='rounded-3xl border border-gray-200/60 dark:border-gray-800 bg-white/80 dark:bg-gray-900/70 shadow-sm max-w-6xl mx-auto w-full overflow-hidden'>
                    <div className='relative'>
                      <div className='absolute inset-0'>
                        {currentHero?.poster && (
                          <img
                            src={currentHero?.poster || ''}
                            alt={currentHero?.title || 'Spotlight'}
                            className='h-full w-full object-cover scale-110 opacity-70'
                            loading='lazy'
                          />
                        )}
                        <div className='absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent'></div>
                        <div className='absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent'></div>
                      </div>
                      <div className='relative z-10 grid gap-5 sm:gap-6 lg:grid-cols-[1.2fr_0.8fr] px-4 sm:px-6 py-5 sm:py-6'>
                        <div className='flex flex-col gap-4'>
                          <div
                            className='flex items-center gap-2 uppercase tracking-[0.25em] text-emerald-300 text-xs'
                          >
                            <span>{currentCategory.label}</span>
                            <span className='w-1 h-1 rounded-full bg-emerald-300'></span>
                            <span className='text-emerald-100/80'>
                              {tt('Spotlight', '精选轮播', '精選輪播')}
                            </span>
                          </div>
                          <div className='space-y-2'>
                            <h3 className='text-2xl sm:text-3xl lg:text-4xl font-semibold text-white'>
                              {currentHero?.title || tt('Featured', '精选推荐', '精選推薦')}
                            </h3>
                            {currentHero?.title_en && (
                              <p className='text-sm sm:text-base text-gray-200/80'>
                                {currentHero.title_en}
                              </p>
                            )}
                          </div>
                          <div className='flex flex-wrap items-center gap-2 text-xs sm:text-sm text-gray-200/90'>
                            {currentHero?.rate && (
                              <span className='px-2 py-1 rounded-full bg-white/10 border border-white/20'>
                                {tt('Rating', '评分', '評分')} {currentHero.rate}
                              </span>
                            )}
                            {currentHero?.year && (
                              <span className='px-2 py-1 rounded-full bg-white/10 border border-white/20'>
                                {currentHero.year}
                              </span>
                            )}
                            {currentHero?.type && (
                              <span className='px-2 py-1 rounded-full bg-white/10 border border-white/20'>
                                {currentHero.type}
                              </span>
                            )}
                          </div>
                          <p className='text-sm text-gray-200/80'>
                            {tt(
                              'Hover the cards to preview; tap the poster to play.',
                              '将鼠标停在海报上预览，点击海报播放。',
                              '將滑鼠停在海報上預覽，點擊海報播放。'
                            )}
                          </p>
                        </div>
                        <div className='flex items-center justify-start lg:justify-end'>
                          {currentHero && (
                            <div className='w-36 sm:w-44 md:w-48 lg:w-52 drop-shadow-[0_20px_35px_rgba(0,0,0,0.45)]'>
                              <VideoCard
                                from='douban'
                                title={currentHero.title}
                                title_en={currentHero.title_en}
                                poster={currentHero.poster}
                                posterAlt={currentHero.posterAlt}
                                posterDouban={currentHero.posterDouban}
                                posterTmdb={currentHero.posterTmdb}
                                douban_id={currentHero.douban_id}
                                imdb_id={currentHero.imdb_id}
                                rate={currentHero.rate}
                                year={currentHero.year}
                                type={currentHero.type}
                                query={currentHero.query || currentHero.title}
                                source_name={currentHero.source_name}
                                size='lg'
                                compactMeta
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className='px-4 sm:px-6 pb-5 sm:pb-6'>
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
                              className={`relative flex-shrink-0 w-28 sm:w-32 md:w-36 transition ${
                                active
                                  ? 'ring-2 ring-emerald-300/80 border border-emerald-400/70 scale-[1.03]'
                                  : 'border border-white/10 hover:border-emerald-300/70'
                              } rounded-2xl overflow-hidden bg-white/5`}
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
                                size='sm'
                                compactMeta
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
