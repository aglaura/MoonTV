/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';

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

import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import PageLayout from '@/components/PageLayout';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';

type UiLocale = 'en' | 'zh-Hans' | 'zh-Hant';

type ImdbListItem = {
  tmdbId: string;
  title: string;
  year: string;
  poster: string;
  originalTitle?: string;
};

type CardItem = {
  title: string;
  poster?: string;
  rate?: string;
  year?: string;
  douban_id?: number;
  type?: string;
  query?: string;
  source_name?: string;
  id?: string | number;
};

type CategoryKey = 'movie' | 'tv' | 'variety' | 'anime' | 'imdb';

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

function tt(en: string, zhHans: string, zhHant: string): string {
  const locale = resolveUiLocale();
  if (locale === 'zh-Hans') return zhHans;
  if (locale === 'zh-Hant') return zhHant;
  return en;
}

function ContentRail({
  title,
  href,
  items,
}: {
  title: string;
  href?: string;
  items: CardItem[];
}) {
  return (
    <div className='rounded-2xl border border-gray-200/50 dark:border-gray-800 bg-white/60 dark:bg-gray-900/50 p-3 sm:p-4'>
      <div className='flex items-center justify-between mb-3'>
        <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
          {title}
        </h3>
        {href && (
          <Link
            href={href}
            className='text-sm text-green-700 dark:text-green-400 hover:underline inline-flex items-center gap-1'
          >
            {tt('See more', '查看更多', '查看更多')}
            <ChevronRight className='w-4 h-4' />
          </Link>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:'none'] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.length === 0 && (
          <div className='text-sm text-gray-500 dark:text-gray-400 py-4'>
            {tt('No data', '暂无数据', '暫無資料')}
          </div>
        )}
        {items.map((item, idx) => (
          <div
            key={`${item.title}-${item.douban_id ?? item.id ?? idx}`}
            className='min-w-[140px] w-36 sm:min-w-[180px] sm:w-44'
          >
            <VideoCard
              from='douban'
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
  const [activeTab, setActiveTab] = useState<'home' | 'favorites'>('home');
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);
  const [bangumiCalendarData, setBangumiCalendarData] = useState<
    BangumiCalendarData[]
  >([]);
  const [imdbList, setImdbList] = useState<ImdbListItem[]>([]);
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

  const [showAnnouncement, setShowAnnouncement] = useState(false);

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

  // 收藏夹数据
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

        const [doubanHome, bangumiCalendarData] = await Promise.all([
          fetch('/api/douban/home', { cache: 'force-cache' }).then((r) => {
            if (!r.ok) throw new Error(`Douban home failed (${r.status})`);
            return r.json() as Promise<{
              movies?: DoubanItem[];
              tv?: DoubanItem[];
              variety?: DoubanItem[];
            }>;
          }),
          GetBangumiCalendarData(),
        ]);

        setHotMovies(Array.isArray(doubanHome?.movies) ? doubanHome.movies : []);
        setHotTvShows(Array.isArray(doubanHome?.tv) ? doubanHome.tv : []);
        setHotVarietyShows(
          Array.isArray(doubanHome?.variety) ? doubanHome.variety : []
        );
        setBangumiCalendarData(bangumiCalendarData);

        try {
          const res = await fetch('/api/imdb/list', { cache: 'no-store' });
          if (res.ok) {
            const data = (await res.json()) as { items?: ImdbListItem[] };
            if (Array.isArray(data.items)) {
              setImdbList(data.items);
            }
          }
        } catch {
          /* ignore imdb list errors */
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

  const categoryData = useMemo<
    Record<
      CategoryKey,
      { label: string; items: CardItem[]; seeMore?: string; hint: string }
    >
  >(() => {
    const mapDouban = (items: DoubanItem[], type?: string): CardItem[] =>
      (items || []).map((item) => ({
        title: item.title,
        poster: item.poster,
        rate: item.rate,
        year: item.year,
        douban_id: Number(item.id),
        type,
      }));

    return {
      movie: {
        label: tt('Movies', '电影', '電影'),
        items: mapDouban(hotMovies, 'movie'),
        seeMore: '/douban?type=movie',
        hint: tt('Cinema picks for today', '今日影院精选', '今日影院精選'),
      },
      tv: {
        label: tt('TV Series', '剧集', '劇集'),
        items: mapDouban(hotTvShows, 'tv'),
        seeMore: '/douban?type=tv',
        hint: tt('Binge-worthy shows', '值得追的剧', '值得追的劇'),
      },
      variety: {
        label: tt('Variety', '综艺', '綜藝'),
        items: mapDouban(hotVarietyShows, 'show'),
        seeMore: '/douban?type=show',
        hint: tt('Light entertainment', '轻松综艺', '輕鬆綜藝'),
      },
      anime: {
        label: tt('Anime', '新番', '新番'),
        items: animeList,
        seeMore: '/douban?type=anime',
        hint: tt('Fresh episodes', '最新更新', '最新更新'),
      },
      imdb: {
        label: 'TMDB',
        items: (imdbList || []).map(
          (item) =>
            ({
              title: item.title,
              poster: item.poster,
              rate: '',
              year: item.year,
              type: 'movie',
              query: item.title,
              source_name: 'TMDB',
              id: item.tmdbId,
            } as CardItem)
        ),
        seeMore: '/imdb',
        hint: tt('Most popular movies', '热门电影', '熱門電影'),
      },
    };
  }, [animeList, hotMovies, hotTvShows, hotVarietyShows, imdbList]);

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

  const heroItems = useMemo(
    () => (currentCategory?.items || []).slice(0, 10),
    [currentCategory]
  );
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

  // 处理收藏数据更新的函数
  const updateFavoriteItems = async (allFavorites: Record<string, any>) => {
    const allPlayRecords = await getAllPlayRecords();

    // 根据保存时间排序（从近到远）
    const sorted = Object.entries(allFavorites)
      .sort(([, a], [, b]) => b.save_time - a.save_time)
      .map(([key, fav]) => {
        const plusIndex = key.indexOf('+');
        const source = key.slice(0, plusIndex);
        const id = key.slice(plusIndex + 1);

        // 查找对应的播放记录，获取当前集数
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

  // 当切换到收藏夹时加载收藏数据
  useEffect(() => {
    if (activeTab !== 'favorites') return;

    const loadFavorites = async () => {
      const allFavorites = await getAllFavorites();
      await updateFavoriteItems(allFavorites);
    };

    loadFavorites();

    // 监听收藏更新事件
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        updateFavoriteItems(newFavorites);
      }
    );

    return unsubscribe;
  }, [activeTab]);

  const handleCloseAnnouncement = (announcement: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', announcement); // 记录已查看弹窗
  };

  const isTV = screenMode === 'tv';
  const isMobile = screenMode === 'mobile';
  const mainLayoutClass = isTV
    ? 'flex flex-col gap-6 xl:gap-8'
    : isMobile
    ? 'flex flex-col gap-6'
    : 'grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(320px,1fr)] gap-6 xl:gap-8';

  return (
    <PageLayout>
      <div className='px-2 sm:px-6 lg:px-10 xl:px-12 py-4 sm:py-8 overflow-visible w-full'>
        {/* 顶部 Tab 切换 */}
        <div className='mb-6 sm:mb-8 flex justify-center'>
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

        <div className='w-full'>
          {activeTab === 'favorites' ? (
            // 收藏夾視圖
            <section className='mb-8'>
              <div className='mb-4 flex items-center justify-between'>
                <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                  {tt('My favorites', '我的收藏', '我的收藏')}
                </h2>
                {favoriteItems.length > 0 && (
                  <button
                    className='text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    onClick={async () => {
                      await clearAllFavorites();
                      setFavoriteItems([]);
                    }}
                  >
                    {tt('Clear', '清空', '清空')}
                  </button>
                )}
              </div>
              <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8'>
                {favoriteItems.map((item) => (
                  <div key={item.id + item.source} className='w-full'>
                    <VideoCard
                      query={item.search_title}
                      {...item}
                      from='favorite'
                      type={item.episodes > 1 ? 'tv' : ''}
                    />
                  </div>
                ))}
                {favoriteItems.length === 0 && (
                  <div className='col-span-full text-center text-gray-500 py-8 dark:text-gray-400'>
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
              {/* 主视图：主栏 + 侧栏 */}
              <div className={mainLayoutClass}>
                <div className='flex flex-col gap-6 sm:gap-8'>
                  {/* 继续观看 */}
                  <ContinueWatching />

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

                  {/* Hero 区域 */}
                  <section
                    className={`relative overflow-hidden rounded-2xl border border-gray-200/40 dark:border-gray-800 shadow-lg ${
                      isTV
                        ? 'bg-gradient-to-br from-black via-gray-900 to-emerald-900/50'
                        : 'bg-gray-900/70'
                    }`}
                  >
                    {currentHero?.poster && (
                      <div
                        className={`absolute inset-0 bg-cover bg-center blur-sm scale-105 ${
                          isTV ? 'opacity-60' : 'opacity-50'
                        }`}
                        style={{ backgroundImage: `url(${currentHero.poster})` }}
                      ></div>
                    )}
                    <div className='absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/10'></div>
                    <div
                      className={`relative grid ${
                        isTV
                          ? 'grid-cols-1 gap-6 p-6 lg:p-10'
                          : 'grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)] gap-4 sm:gap-6 p-4 sm:p-6 lg:p-8'
                      }`}
                    >
                      <div className='flex flex-col gap-4 sm:gap-5'>
                        <div className='flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-green-300'>
                          <span>{currentCategory.label}</span>
                          <span className='w-1 h-1 rounded-full bg-green-400'></span>
                          <span>
                            {screenMode === 'mobile'
                              ? tt('Mobile stack', '手机竖屏', '手機豎屏')
                              : screenMode === 'tv'
                              ? tt('TV wall', '电视瀑布流', '電視瀑布流')
                              : tt('Desktop grid', '桌面网格', '桌面網格')}
                          </span>
                        </div>
                        <div className='flex flex-col gap-2 max-w-3xl'>
                          <h2
                            className={`font-bold text-white leading-tight line-clamp-2 ${
                              isTV
                                ? 'text-4xl lg:text-5xl'
                                : 'text-2xl sm:text-3xl lg:text-4xl'
                            }`}
                          >
                            {currentHero?.title || tt('Discover now', '发现好片', '發現好片')}
                          </h2>
                          <p
                            className={`text-gray-200/80 line-clamp-3 ${
                              isTV ? 'text-lg' : 'text-sm sm:text-base'
                            }`}
                          >
                            {tt(
                              'Tap play to start with the first provider, or open details to explore more sources.',
                              '直接播放将从第一个来源开始，详情可查看更多来源。',
                              '直接播放將從第一個來源開始，詳情可查看更多來源。'
                            )}
                          </p>
                          <div className='text-gray-300 text-sm'>
                            {currentHero?.year || ''}
                            {currentHero?.rate ? ` · ${currentHero.rate}` : ''}
                          </div>
                        </div>
                        <div className='flex flex-wrap gap-3'>
                          {currentHero && (
                            <VideoCard
                              from='douban'
                              title={currentHero.title}
                              poster={currentHero.poster}
                              douban_id={currentHero.douban_id}
                              rate={currentHero.rate}
                              year={currentHero.year}
                              type={currentHero.type}
                              query={currentHero.query}
                              source_name={currentHero.source_name}
                            />
                          )}
                        </div>
                      </div>

                      <div className='bg-black/30 border border-white/10 rounded-xl p-3 sm:p-4 h-full'>
                        <div className='flex items-center justify-between mb-3 text-sm text-gray-200'>
                          <span>{tt('Top picks', '精选', '精選')}</span>
                          <span className='text-gray-400'>
                            {tt('Tap to preview', '点击切换预览', '點擊切換預覽')}
                          </span>
                        </div>
                        <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2'>
                          {heroItems.slice(0, 6).map((item, idx) => {
                            const active = heroIndex % heroItems.length === idx;
                            return (
                              <button
                                key={`${item.title}-${idx}`}
                                onClick={() => setHeroIndex(idx)}
                                className={`text-left rounded-lg overflow-hidden border transition ${
                                  active
                                    ? 'border-green-400 ring-2 ring-green-300/60'
                                    : 'border-white/10 hover:border-green-300/50'
                                }`}
                              >
                                <div className='aspect-[2/3] bg-gray-700'>
                                  {item.poster && (
                                    <img
                                      src={item.poster}
                                      alt={item.title}
                                      className='w-full h-full object-cover'
                                    />
                                  )}
                                </div>
                                <div className='p-2 text-xs text-gray-100 line-clamp-2'>
                                  {item.title}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* 分类切换 + 排序 */}
                  <section className='rounded-2xl border border-gray-200/50 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 p-3 sm:p-4'>
                    <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                      <div className='flex flex-wrap gap-2'>
                        {(Object.keys(categoryData) as CategoryKey[]).map((key) => {
                          const cfg = categoryData[key];
                          const active = category === key;
                          return (
                            <button
                              key={key}
                              onClick={() => setCategory(key)}
                              className={`px-3 py-1.5 rounded-full border text-sm transition ${
                                active
                                  ? 'bg-green-600 text-white border-green-600 shadow-sm'
                                  : 'border-gray-300 text-gray-700 dark:text-gray-200 dark:border-gray-600 hover:border-green-500'
                              }`}
                            >
                              {cfg.label}
                            </button>
                          );
                        })}
                      </div>
                      <div className='flex items-center gap-2 text-sm'>
                        {(['trending', 'newest', 'rating'] as const).map((mode) => {
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
                              className={`px-3 py-1 rounded-full border transition ${
                                active
                                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900 border-transparent'
                                  : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:border-green-500'
                              }`}
                            >
                              {labels[mode]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className='mt-2 text-sm text-gray-600 dark:text-gray-400 flex items-center justify-between'>
                      <span>{currentCategory?.hint}</span>
                      {currentCategory?.seeMore && (
                        <Link
                          href={currentCategory.seeMore}
                          className='inline-flex items-center text-green-700 dark:text-green-400 hover:underline'
                        >
                          {tt('See more', '查看更多', '查看更多')}
                          <ChevronRight className='w-4 h-4 ml-1' />
                        </Link>
                      )}
                    </div>
                  </section>

                  {/* Spotlight Grid */}
                  <section className='rounded-2xl border border-gray-200/60 dark:border-gray-800 bg-white/60 dark:bg-gray-900/50 p-3 sm:p-4'>
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
                            className='relative aspect-[2/3] w-full overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse'
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
                                from='douban'
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
                      <div className='text-center text-gray-500 dark:text-gray-400 py-10'>
                        {tt('No data', '暂无数据', '暫無資料')}
                      </div>
                    )}
                  </section>

                  {/* Rails */}
                  <section className='space-y-6'>
                    <ContentRail
                      title={tt('Hot movies', '热门电影', '熱門電影')}
                      href='/douban?type=movie'
                      items={hotMovies.map((movie) => ({
                        title: movie.title,
                        poster: movie.poster,
                        rate: movie.rate,
                        year: movie.year,
                        douban_id: Number(movie.id),
                        type: 'movie',
                      }))}
                    />
                    <ContentRail
                      title={tt('Hot TV shows', '热门剧集', '熱門劇集')}
                      href='/douban?type=tv'
                      items={hotTvShows.map((show) => ({
                        title: show.title,
                        poster: show.poster,
                        rate: show.rate,
                        year: show.year,
                        douban_id: Number(show.id),
                        type: 'tv',
                      }))}
                    />
                    <ContentRail
                      title={tt('Hot variety shows', '热门综艺', '熱門綜藝')}
                      href='/douban?type=show'
                      items={hotVarietyShows.map((show) => ({
                        title: show.title,
                        poster: show.poster,
                        rate: show.rate,
                        year: show.year,
                        douban_id: Number(show.id),
                        type: 'tv',
                      }))}
                />
                {imdbList.length > 0 && (
                  <ContentRail
                    title='TMDB Popular'
                    href='/imdb'
                    items={imdbList.map((item) => ({
                      title: item.title,
                      poster: item.poster,
                      rate: '',
                      year: item.year,
                      query: item.title,
                      source_name: 'TMDB',
                      type: 'movie',
                    }))}
                  />
                )}
              </section>
            </div>

            {/* 侧栏 */}
            <div className='hidden xl:flex flex-col gap-6'>
            {imdbList.length > 0 && (
              <div className='rounded-2xl border border-gray-200/60 dark:border-gray-800 bg-white/70 dark:bg-gray-900/70 p-4 shadow-sm'>
                <div className='flex items-center justify-between mb-3'>
                    <h3 className='text-base font-semibold text-gray-900 dark:text-gray-100'>
                      TMDB
                    </h3>
                    <Link
                      href='/imdb'
                      className='text-xs text-green-700 dark:text-green-400 hover:underline'
                    >
                          {tt('See more', '查看更多', '查看更多')}
                        </Link>
                      </div>
                      <div className='space-y-3'>
                        {imdbList.slice(0, 6).map((item, idx) => (
                          <Link
                            key={`${item.tmdbId}-${idx}`}
                            href='/imdb'
                            className='flex gap-3 items-center group'
                          >
                            <div className='w-12 h-16 rounded-md overflow-hidden bg-gray-200 dark:bg-gray-800'>
                              {item.poster && (
                                <img
                                  src={item.poster}
                                  alt={item.title}
                                  className='w-full h-full object-cover'
                                />
                              )}
                            </div>
                            <div className='flex-1 min-w-0'>
                              <p className='text-sm text-gray-900 dark:text-gray-100 line-clamp-2 group-hover:text-green-700 dark:group-hover:text-green-400'>
                                {item.title}
                              </p>
                              <p className='text-xs text-gray-500 dark:text-gray-400'>
                                {item.year}
                              </p>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  )}
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
            // 如果點擊的是背景區域，阻止觸摸事件冒泡，防止背景滾動
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          onTouchMove={(e) => {
            // 如果觸摸的是背景區域，阻止觸摸移動，防止背景滾動
            if (e.target === e.currentTarget) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onTouchEnd={(e) => {
            // 如果觸摸的是背景區域，阻止觸摸結束事件，防止背景滾動
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          style={{
            touchAction: 'none', // 禁用所有觸摸操作
          }}
        >
          <div
            className='w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 transform transition-all duration-300 hover:shadow-2xl'
            onTouchMove={(e) => {
              // 允許公告內容區域正常滾動，阻止事件冒泡到外層
              e.stopPropagation();
            }}
            style={{
              touchAction: 'auto', // 允許內容區域的正常觸摸操作
            }}
          >
            <div className='flex justify-between items-start mb-4'>
              <h3 className='text-2xl font-bold tracking-tight text-gray-800 dark:text-white border-b border-green-500 pb-1'>
                {tt('Notice', '提示', '提示')}
              </h3>
              <button
                onClick={() => handleCloseAnnouncement(announcement)}
                className='text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-white transition-colors'
                aria-label={tt('Close', '关闭', '關閉')}
              ></button>
            </div>
            <div className='mb-6'>
              <div className='relative overflow-hidden rounded-lg mb-4 bg-green-50 dark:bg-green-900/20'>
                <div className='absolute inset-y-0 left-0 w-1.5 bg-green-500 dark:bg-green-400'></div>
                <p className='ml-4 text-gray-600 dark:text-gray-300 leading-relaxed'>
                  {formattedAnnouncement}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCloseAnnouncement(announcement)}
              className='w-full rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-4 py-3 text-white font-medium shadow-md hover:shadow-lg hover:from-green-700 hover:to-green-800 dark:from-green-600 dark:to-green-700 dark:hover:from-green-700 dark:hover:to-green-800 transition-all duration-300 transform hover:-translate-y-0.5'
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
