/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';

import {
  BangumiCalendarData,
  GetBangumiCalendarData,
} from '@/lib/bangumi.client';
import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanCategories } from '@/lib/douban.client';
import { tt } from '@/lib/i18n.client';
import { convertToTraditional } from '@/lib/locale';
import { DoubanItem, SearchResult } from '@/lib/types';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';

function HomeClient() {
  const [activeTab, setActiveTab] = useState<'home' | 'favorites'>('home');
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);
  const [bangumiCalendarData, setBangumiCalendarData] = useState<
    BangumiCalendarData[]
  >([]);
  const [loading, setLoading] = useState(true);
  const { announcement } = useSite();

  const [showAnnouncement, setShowAnnouncement] = useState(false);

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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    const fetchRecommendData = async () => {
      try {
        setLoading(true);

        const [moviesData, tvShowsData, varietyShowsData, bangumiCalendarData] =
          await Promise.all([
            getDoubanCategories({
              kind: 'movie',
              category: '热门',
              type: '全部',
            }),
            getDoubanCategories({ kind: 'tv', category: 'tv', type: 'tv' }),
            getDoubanCategories({ kind: 'tv', category: 'show', type: 'show' }),
            GetBangumiCalendarData(),
          ]);

        if (moviesData.code === 200) {
          setHotMovies(moviesData.list);
        }

        if (tvShowsData.code === 200) {
          setHotTvShows(tvShowsData.list);
        }

        if (varietyShowsData.code === 200) {
          setHotVarietyShows(varietyShowsData.list);
        }

        setBangumiCalendarData(bangumiCalendarData);
      } catch (error) {
        console.error('獲取推薦資料失敗:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendData();
  }, []);

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

  const handleCloseAnnouncement = (announcement: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', announcement); // 记录已查看弹窗
  };

  return (
    <PageLayout>
      <div className='px-2 sm:px-10 py-4 sm:py-8 overflow-visible'>
        <section className='mb-10'>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              let trimmed = searchQuery.trim();
              if (!trimmed) {
                setSearchResults([]);
                setHasSearched(false);
                setSearchError(null);
                return;
              }

              // Check if the query looks like an English title (mostly ASCII characters)
              // Avoid control characters in regex to satisfy ESLint/no-control-regex.
              const isLikelyEnglish = Array.from(trimmed).every((ch) => {
                const code = ch.charCodeAt(0);
                // treat printable ASCII (space .. DEL) and common whitespace as English
                return (
                  (code >= 32 && code <= 127) ||
                  ch === '\n' ||
                  ch === '\r' ||
                  ch === '\t'
                );
              });
              
              if (isLikelyEnglish) {
                try {
                  // Try to convert English title to Chinese using Wikipedia
                  const response = await fetch(
                    `/api/title-convert?title=${encodeURIComponent(trimmed)}`
                  );
                  if (response.ok) {
                    const data = await response.json();
                    if (data.title) {
                      // Use the Chinese title for search
                      trimmed = data.title;
                    }
                  }
                } catch (error) {
                  // If conversion fails, continue with original English title
                  console.warn('Failed to convert English title to Chinese:', error);
                }
              }

              const performSearch = async () => {
                try {
                  setSearching(true);
                  setSearchError(null);
                  const response = await fetch(
                    `/api/search?q=${encodeURIComponent(trimmed)}`
                  );
                  if (!response.ok) {
                    throw new Error(
                      tt(
                        `Search failed (${response.status})`,
                        `搜索失败 (${response.status})`,
                        `搜尋失敗 (${response.status})`
                      )
                    );
                  }
                  const data = (await response.json()) as {
                    results?: SearchResult[];
                  };
                  setSearchResults(data.results ?? []);
                  setHasSearched(true);
                } catch (err) {
                  setSearchError(
                    err instanceof Error
                      ? err.message
                      : tt('Search failed', '搜索失败', '搜尋失敗')
                  );
                  setSearchResults([]);
                  setHasSearched(true);
                } finally {
                  setSearching(false);
                }
              };

              void performSearch();
            }}
            className='max-w-3xl mx-auto'
          >
            <div className='relative shadow-lg rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/60 backdrop-blur'>
              <input
                type='text'
                className='w-full py-4 px-6 pr-20 text-base sm:text-lg bg-transparent focus:outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400'
                placeholder={tt(
                  'Search for a title, actor, or keyword',
                  '输入影片、演员或关键字',
                  '輸入想看的影片、演員或關鍵字'
                )}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete='off'
              />
              <div className='absolute inset-y-0 right-0 flex items-center gap-2 pr-4'>
                {searchQuery && (
                  <button
                    type='button'
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                      setHasSearched(false);
                      setSearchError(null);
                    }}
                    className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors'
                  >
                    {tt('Clear', '清除', '清除')}
                  </button>
                )}
                <button
                  type='submit'
                  className='px-4 py-2 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors'
                  disabled={searching}
                >
                  {tt('Search', '搜索', '搜尋')}
                </button>
              </div>
            </div>
          </form>

          <div className='mt-6'>
            {searchError && (
              <p className='text-sm text-red-600 dark:text-red-400 text-center'>
                {searchError}
              </p>
            )}

            {searching && (
              <div className='mt-8 grid gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'>
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div
                    key={idx}
                    className='h-56 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse'
                  />
                ))}
              </div>
            )}

            {hasSearched &&
              !searching &&
              searchResults.length === 0 &&
              !searchError && (
                <p className='mt-8 text-center text-gray-500 dark:text-gray-400'>
                  {tt(
                    'No results. Try a different keyword.',
                    '找不到相关内容，试试其他关键字。',
                    '找不到相關內容，試試其他關鍵字。'
                  )}
                </p>
              )}

            {searchResults.length > 0 && (
              <div className='mt-8'>
                <div className='flex items-center justify-between mb-4'>
                  <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                    {tt('Search results', '搜索结果', '搜尋結果')}
                  </h2>
                  <span className='text-sm text-gray-500 dark:text-gray-400'>
                    {tt(
                      `Total ${searchResults.length}`,
                      `共 ${searchResults.length} 条`,
                      `共 ${searchResults.length} 筆`
                    )}
                  </span>
                </div>
                <div className='grid gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'>
                  {searchResults.map((item, index) => (
                    <VideoCard
                      key={`${item.source}-${item.id}-${index}`}
                      id={item.id}
                      source={item.source}
                      title={item.title}
                      poster={item.poster}
                      douban_id={item.douban_id}
                      rate={item.rate}
                      year={item.year}
                      episodes={item.episodes?.length}
                      source_name={item.source_name}
                      query={item.title}
                      from='search'
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {(!hasSearched || searchResults.length === 0) && (
          <>
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
                onChange={(value) =>
                  setActiveTab(value as 'home' | 'favorites')
                }
              />
            </div>

            <div className='max-w-[95%] mx-auto'>
              {activeTab === 'favorites' ? (
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
                <>
                  {/* 继续观看 */}
                  <ContinueWatching />

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

                            const todayAnimes =
                              bangumiCalendarData.find(
                                (item) => item.weekday.en === currentWeekday
                              )?.items || [];

                            return todayAnimes.map((anime, index) => (
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
                </>
              )}
            </div>
          </>
        )}
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
            touchAction: 'none', // 禁用所有觸摸操作
          }}
        >
          <div
            className='w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 transform transition-all duration-300 hover:shadow-2xl'
            onTouchMove={(e) => {
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
                  {convertToTraditional(announcement)}
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
