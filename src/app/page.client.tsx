/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

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
import { DoubanItem } from '@/lib/types';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import PageLayout from '@/components/PageLayout';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';

type UiLocale = 'en' | 'zh-Hans' | 'zh-Hant';

type ImdbListItem = {
  imdbId: string;
  title: string;
  year: string;
  poster: string;
};

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

function HomeClient() {
  const [activeTab, setActiveTab] = useState<'home' | 'favorites'>('home');
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);
  const [bangumiCalendarData, setBangumiCalendarData] = useState<
    BangumiCalendarData[]
  >([]);
  const [imdbList, setImdbList] = useState<ImdbListItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<
    'movie' | 'tv' | 'variety' | 'anime' | 'imdb'
  >('movie');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
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
          const res = await fetch('/api/imdb/list', { cache: 'force-cache' });
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

  const animeList = useMemo(() => {
    if (!bangumiCalendarData || bangumiCalendarData.length === 0) return [];
    const items: DoubanItem[] = [];
    bangumiCalendarData.forEach((day) => {
      day.items.forEach((anime) => {
        items.push({
          id: anime.id?.toString() || '',
          title: anime.name_cn || anime.name,
          poster:
            anime.images?.large ||
            anime.images?.common ||
            anime.images?.medium ||
            anime.images?.small ||
            anime.images?.grid,
          rate: anime.rating?.score ? anime.rating.score.toFixed(1) : '',
          year: anime.air_date?.split('-')?.[0] || '',
        });
      });
    });
    return items.slice(0, 40);
  }, [bangumiCalendarData]);

  const categoryItems = useMemo(() => {
    const toCards = (items: DoubanItem[]) =>
      items.map((item) => ({
        key: `douban-${item.id}`,
        title: item.title,
        poster: item.poster,
        rate: item.rate,
        year: item.year,
        douban_id: Number(item.id),
        query: item.title,
      }));

    if (activeCategory === 'movie') return toCards(hotMovies);
    if (activeCategory === 'tv') return toCards(hotTvShows);
    if (activeCategory === 'variety') return toCards(hotVarietyShows);
    if (activeCategory === 'anime')
      return animeList.map((anime) => ({
        key: `anime-${anime.id}`,
        title: anime.title,
        poster: anime.poster,
        rate: anime.rate,
        year: anime.year,
        douban_id: Number(anime.id),
        isBangumi: true,
        query: anime.title,
      }));
    return imdbList.map((item) => ({
      key: `imdb-${item.imdbId}`,
      title: item.title,
      poster: item.poster,
      rate: '',
      year: item.year,
      query: item.title,
      source_name: 'IMDb',
    }));
  }, [activeCategory, animeList, hotMovies, hotTvShows, hotVarietyShows, imdbList]);

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

  return (
    <PageLayout>
      <div className='px-2 sm:px-10 py-4 sm:py-8 overflow-visible'>
        {/* 顶部 Tab 切换 */}
        <div className='mb-8 flex justify-center'>
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

        <div className='max-w-[95%] mx-auto'>
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
              {/* 继续观看 */}
              <ContinueWatching />

              {/* 错误提示 */}
              {error && (
                <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
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

              {/* 熱門電影 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                    {tt('Hot movies', '热门电影', '熱門電影')}
                  </h2>
                  <Link
                    href='/douban?type=movie'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  >
                    {tt('See more', '查看更多', '查看更多')}
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow>
                  {loading
                    ? // 加載狀態顯示灰色占位數據
                      Array.from({ length: 8 }).map((_, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                            <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                          </div>
                          <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                        </div>
                      ))
                    : error || hotMovies.length === 0
                    ? // 显示空状态或错误状态
                      <div className='text-center text-gray-500 py-8 dark:text-gray-400 w-full'>
                        {error
                          ? tt(
                              'Failed to load data',
                              '数据加载失败',
                              '資料載入失敗'
                            )
                          : tt('No data', '暂无数据', '暫無資料')}
                      </div>
                    : // 顯示真實數據
                      hotMovies.map((movie, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            title={movie.title}
                            poster={movie.poster}
                            douban_id={Number(movie.id)}
                            rate={movie.rate}
                            year={movie.year}
                            type='movie'
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 熱門劇集 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                    {tt('Hot TV shows', '热门剧集', '熱門劇集')}
                  </h2>
                  <Link
                    href='/douban?type=tv'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  >
                    {tt('See more', '查看更多', '查看更多')}
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow>
                  {loading
                    ? // 加載狀態顯示灰色占位數據
                      Array.from({ length: 8 }).map((_, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                            <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                          </div>
                          <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                        </div>
                      ))
                    : error || hotTvShows.length === 0
                    ? // 显示空状态或错误状态
                      <div className='text-center text-gray-500 py-8 dark:text-gray-400 w-full'>
                        {error
                          ? tt(
                              'Failed to load data',
                              '数据加载失败',
                              '資料載入失敗'
                            )
                          : tt('No data', '暂无数据', '暫無資料')}
                      </div>
                    : // 顯示真實數據
                      hotTvShows.map((show, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            title={show.title}
                            poster={show.poster}
                            douban_id={Number(show.id)}
                            rate={show.rate}
                            year={show.year}
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {/* 每日新番放送 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                    {tt('Airing today', '新番放送', '新番放送')}
                  </h2>
                  <Link
                    href='/douban?type=anime'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  >
                    {tt('See more', '查看更多', '查看更多')}
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow>
                  {loading
                    ? // 加載狀態顯示灰色占位數據
                      Array.from({ length: 8 }).map((_, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                            <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                          </div>
                          <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                        </div>
                      ))
                    : // 展示當前日期的番劇
                      (() => {
                        // 獲取當前日期對應的星期
                        const today = new Date();
                        const weekdays = [
                          'Sun',
                          'Mon',
                          'Tue',
                          'Wed',
                          'Thu',
                          'Fri',
                          'Sat',
                        ];
                        const currentWeekday = weekdays[today.getDay()];

                        // 找到當前星期對應的番劇數據
                        const todayAnimes =
                          bangumiCalendarData.find(
                            (item) => item.weekday.en === currentWeekday
                          )?.items || [];

                        return todayAnimes.length === 0
                          ? // 显示空状态
                            <div className='text-center text-gray-500 py-8 dark:text-gray-400 w-full'>
                              {tt(
                                'No anime data for today',
                                '暂无番剧数据',
                                '暫無番劇資料'
                              )}
                            </div>
                          : todayAnimes.map((anime, index) => (
                              <div
                                key={`${anime.id}-${index}`}
                                className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                              >
                                <VideoCard
                                  from='douban'
                                  title={anime.name_cn || anime.name}
                                  poster={
                                    anime.images.large ||
                                    anime.images.common ||
                                    anime.images.medium ||
                                    anime.images.small ||
                                    anime.images.grid
                                  }
                                  douban_id={anime.id}
                                  rate={anime.rating?.score?.toFixed(1) || ''}
                                  year={anime.air_date?.split('-')?.[0] || ''}
                                  isBangumi={true}
                                />
                              </div>
                            ));
                      })()}
                </ScrollableRow>
              </section>

              {/* 熱門綜藝 */}
              <section className='mb-8'>
                <div className='mb-4 flex items-center justify-between'>
                  <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                    {tt('Hot variety shows', '热门综艺', '熱門綜藝')}
                  </h2>
                  <Link
                    href='/douban?type=show'
                    className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                  >
                    {tt('See more', '查看更多', '查看更多')}
                    <ChevronRight className='w-4 h-4 ml-1' />
                  </Link>
                </div>
                <ScrollableRow>
                  {loading
                    ? // 加載狀態顯示灰色占位數據
                      Array.from({ length: 8 }).map((_, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <div className='relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800'>
                            <div className='absolute inset-0 bg-gray-300 dark:bg-gray-700'></div>
                          </div>
                          <div className='mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800'></div>
                        </div>
                      ))
                    : error || hotVarietyShows.length === 0
                    ? // 显示空状态或错误状态
                      <div className='text-center text-gray-500 py-8 dark:text-gray-400 w-full'>
                        {error
                          ? tt(
                              'Failed to load data',
                              '数据加载失败',
                              '資料載入失敗'
                            )
                          : tt('No data', '暂无数据', '暫無資料')}
                      </div>
                    : // 顯示真實數據
                      hotVarietyShows.map((show, index) => (
                        <div
                          key={index}
                          className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                        >
                          <VideoCard
                            from='douban'
                            title={show.title}
                            poster={show.poster}
                            douban_id={Number(show.id)}
                            rate={show.rate}
                            year={show.year}
                          />
                        </div>
                      ))}
                </ScrollableRow>
              </section>

              {imdbList.length > 0 && (
                <section className='mb-12'>
                  <div className='mb-4 flex items-center justify-between'>
                    <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                      IMDb Top Picks
                    </h2>
                    <Link
                      href='https://www.imdb.com/chart/top'
                      target='_blank'
                      className='flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                    >
                      {tt('See more', '查看更多', '查看更多')}
                      <ChevronRight className='w-4 h-4 ml-1' />
                    </Link>
                  </div>
                  <ScrollableRow>
                    {imdbList.map((item) => (
                      <div
                        key={item.imdbId}
                        className='min-w-[96px] w-24 sm:min-w-[180px] sm:w-44'
                      >
                        <VideoCard
                          from='douban'
                          title={item.title}
                          poster={item.poster}
                          rate=''
                          year={item.year}
                          type='movie'
                          douban_id={undefined}
                          query={item.title}
                          source_name='IMDb'
                        />
                      </div>
                    ))}
                  </ScrollableRow>
                </section>
              )}
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
                  {announcement}
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
