/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';

import {
  clearAllFavorites,
  getAllFavorites,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanCategories } from '@/lib/douban.client';
import { DoubanItem } from '@/lib/types';

import CapsuleSwitch from '@/components/CapsuleSwitch';
import ContinueWatching from '@/components/ContinueWatching';
import PageLayout from '@/components/PageLayout';
import ScrollableRow from '@/components/ScrollableRow';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';

// ====================
// Client-side converter
// ====================
let converter: (s: string) => string = (s) => s;
if (typeof window !== 'undefined') {
  try {
    const OpenCC = require('opencc-js');
    converter = OpenCC.simplifiedToTraditional;
  } catch {
    console.warn('opencc-js not available');
  }
}

function HomeClient() {
  const [activeTab, setActiveTab] = useState<'home' | 'favorites'>('home');
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTvShows, setHotTvShows] = useState<DoubanItem[]>([]);
  const [hotVarietyShows, setHotVarietyShows] = useState<DoubanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { announcement } = useSite();
  const [showAnnouncement, setShowAnnouncement] = useState(false);

  const [favoriteItems, setFavoriteItems] = useState<FavoriteItem[]>([]);

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

  // Announcement handling
  useEffect(() => {
    if (!announcement) return;
    const hasSeen = localStorage.getItem('hasSeenAnnouncement');
    setShowAnnouncement(hasSeen !== announcement);
  }, [announcement]);

  // Fetch recommended data
  useEffect(() => {
    const fetchRecommendData = async () => {
      setLoading(true);
      try {
        const categories = [
          { kind: 'movie', category: '熱門', type: '全部', setter: setHotMovies },
          { kind: 'tv', category: 'tv', type: 'tv', setter: setHotTvShows },
          { kind: 'tv', category: 'show', type: 'show', setter: setHotVarietyShows },
        ];

        await Promise.all(
          categories.map(async ({ kind, category, type, setter }) => {
            const data = await getDoubanCategories({ kind, category, type });
            if (data.code === 200) setter(data.list);
          })
        );
      } catch (err) {
        console.error('獲取推薦數據失敗:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRecommendData();
  }, []);

  // Update favorites
  const updateFavoriteItems = async (allFavorites: Record<string, any>) => {
    const allPlayRecords = await getAllPlayRecords();
    const sorted = Object.entries(allFavorites)
      .sort(([, a], [, b]) => b.save_time - a.save_time)
      .map(([key, fav]) => {
        const [source, id] = key.split('+');
        const playRecord = allPlayRecords[key];
        return {
          id,
          source,
          title: fav.title,
          year: fav.year,
          poster: fav.cover,
          episodes: fav.total_episodes,
          source_name: fav.source_name,
          currentEpisode: playRecord?.index,
          search_title: fav?.search_title,
          origin: fav?.origin,
        } as FavoriteItem;
      });
    setFavoriteItems(sorted);
  };

  // Load favorites when tab is active
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
    localStorage.setItem('hasSeenAnnouncement', announcement);
  };

  const LoadingCard = () => (
    <div className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800" />
      <div className="mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800" />
    </div>
  );

  return (
    <PageLayout>
      <div className="px-2 sm:px-10 py-4 sm:py-8 overflow-visible">
        <div className="mb-8 flex justify-center">
          <CapsuleSwitch
            options={[
              { label: '首頁', value: 'home' },
              { label: '收藏夾', value: 'favorites' },
            ]}
            active={activeTab}
            onChange={(value) => setActiveTab(value as 'home' | 'favorites')}
          />
        </div>

        <div className="max-w-[95%] mx-auto">
          {activeTab === 'favorites' ? (
            <section className="mb-8">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                  我的收藏
                </h2>
                {favoriteItems.length > 0 && (
                  <button
                    className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    onClick={async () => {
                      await clearAllFavorites();
                      setFavoriteItems([]);
                    }}
                  >
                    清空
                  </button>
                )}
              </div>
              <div className="justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8">
                {favoriteItems.length === 0 ? (
                  <div className="col-span-full text-center text-gray-500 py-8 dark:text-gray-400">
                    暫無收藏內容
                  </div>
                ) : (
                  favoriteItems.map((item) => (
                    <div key={item.id + item.source} className="w-full">
                      <VideoCard
                        query={item.search_title}
                        {...item}
                        from="favorite"
                        type={item.episodes > 1 ? 'tv' : ''}
                      />
                    </div>
                  ))
                )}
              </div>
            </section>
          ) : (
            <>
              <ContinueWatching />

              {/* 熱門電影 */}
              <Section title="熱門電影" href="/douban?type=movie" items={hotMovies} loading={loading} type="movie" />

              {/* 熱門劇集 */}
              <Section title="熱門劇集" href="/douban?type=tv" items={hotTvShows} loading={loading} type="tv" />

              {/* 熱門綜藝 */}
              <Section title="熱門綜藝" href="/douban?type=show" items={hotVarietyShows} loading={loading} type="tv" />
            </>
          )}
        </div>
      </div>

      {/* Announcement Modal */}
      {announcement && showAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm dark:bg-black/70 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-2xl font-bold tracking-tight text-gray-800 dark:text-white border-b border-green-500 pb-1">
                提示
              </h3>
              <button
                onClick={() => handleCloseAnnouncement(announcement)}
                className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-white"
                aria-label="關閉"
              />
            </div>
            <div className="mb-6">
              <div className="relative overflow-hidden rounded-lg mb-4 bg-green-50 dark:bg-green-900/20">
                <div className="absolute inset-y-0 left-0 w-1.5 bg-green-500 dark:bg-green-400"></div>
                <p className="ml-4 text-gray-600 dark:text-gray-300 leading-relaxed">
                  {converter(announcement)}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCloseAnnouncement(announcement)}
              className="w-full rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-4 py-3 text-white font-medium shadow-md hover:shadow-lg"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

// ====================
// Reusable Section Component
// ====================
function Section({ title, href, items, loading, type }: { title: string; href: string; items: DoubanItem[]; loading: boolean; type: 'movie' | 'tv' }) {
  const converter = typeof window !== 'undefined' ? require('opencc-js').simplifiedToTraditional : (s: string) => s;
  const LoadingCard = () => (
    <div className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800" />
      <div className="mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800" />
    </div>
  );

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">{title}</h2>
        <Link href={href} className="flex items-center text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          查看更多
          <ChevronRight className="w-4 h-4 ml-1" />
        </Link>
      </div>
      <ScrollableRow>
        {loading ? Array.from({ length: 8 }).map((_, i) => <LoadingCard key={i} />) : items.map((item) => (
          <div key={item.id} className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44">
            <VideoCard
              from="douban"
              title={converter(item.title)}
              poster={item.poster}
              douban_id={Number(item.id)}
              rate={item.rate}
              year={item.year}
              type={type === 'movie' ? 'movie' : 'tv'}
            />
          </div>
        ))}
      </ScrollableRow>
    </section>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="text-center py-8">載入中...</div>}>
      <HomeClient />
    </Suspense>
  );
}
