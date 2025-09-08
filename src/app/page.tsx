'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { getDoubanCategories } from '@/lib/douban';
import { DoubanItem } from '@/lib/douban.types';
import VodCard from '@/components/vod-card';
import BangumiSection from '@/components/bangumi-section';
import { fetchFavorites, subscribeToDataUpdates } from '@/lib/favorites';
import { X } from 'lucide-react';

type FavoriteItem = DoubanItem & {
  source: string;
  source_name: string;
  currentEpisode?: number;
  search_title?: string;
  origin?: 'vod' | 'live';
};

function SkeletonCard() {
  return (
    <div className="min-w-[96px] w-24 sm:min-w-[180px] sm:w-44">
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg bg-gray-200 animate-pulse dark:bg-gray-800">
        <div className="absolute inset-0 bg-gray-300 dark:bg-gray-700"></div>
      </div>
      <div className="mt-2 h-4 bg-gray-200 rounded animate-pulse dark:bg-gray-800"></div>
    </div>
  );
}

function HomeClient() {
  const [hotMovies, setHotMovies] = useState<DoubanItem[]>([]);
  const [hotTv, setHotTv] = useState<DoubanItem[]>([]);
  const [hotVariety, setHotVariety] = useState<DoubanItem[]>([]);
  const [bangumiData, setBangumiData] = useState<Record<string, any[]>>({});
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [activeTab, setActiveTab] = useState<'movies' | 'tv' | 'variety' | 'bangumi' | 'favorites'>('movies');
  const [loading, setLoading] = useState(true);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [movies, tv, variety, bangumi] = await Promise.all([
          getDoubanCategories('movie', '热门'),
          getDoubanCategories('tv', '热门'),
          getDoubanCategories('tv', '综艺'),
          fetch('/api/bangumi/calendar').then(res => res.json()),
        ]);

        setHotMovies(movies);
        setHotTv(tv);
        setHotVariety(variety);

        const bangumiByDay = bangumi.reduce((acc: Record<string, any[]>, item: any) => {
          const day = item.weekday?.en || 'Unknown';
          if (!acc[day]) acc[day] = [];
          acc[day].push(item);
          return acc;
        }, {});
        setBangumiData(bangumiByDay);

        const favs = await fetchFavorites();
        setFavorites(favs);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    const stored = localStorage.getItem('announcement');
    if (!stored) {
      setAnnouncement('欢迎使用本站，祝您观影愉快！');
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (announcement) e.preventDefault();
    };
    if (announcement) {
      document.body.classList.add('overflow-hidden');
      document.addEventListener('touchmove', handleTouchMove, { passive: false });
    }
    return () => {
      document.body.classList.remove('overflow-hidden');
      document.removeEventListener('touchmove', handleTouchMove);
    };
  }, [announcement]);

  useEffect(() => {
    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (newFavorites: Record<string, any>) => {
        if (activeTab === 'favorites') {
          const updated = Object.values(newFavorites).map(fav => ({
            ...fav.item,
            source: fav.source,
            source_name: fav.source_name,
            currentEpisode: fav.currentEpisode,
            search_title: fav.search_title,
            origin: fav.origin,
          })) as FavoriteItem[];
          setFavorites(updated);
        }
      }
    );
    return unsubscribe;
  }, [activeTab]);

  const handleCloseAnnouncement = (msg: string) => {
    setAnnouncement(null);
    localStorage.setItem('announcement', msg);
  };

  return (
    <div className="container mx-auto px-2 sm:px-4 pb-16">
      {announcement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md mx-4">
            <CardContent className="p-6 relative">
              <button
                onClick={() => handleCloseAnnouncement(announcement)}
                className="absolute right-4 top-4 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-white transition-colors"
                aria-label="关闭"
              >
                <X className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-bold mb-4">公告</h2>
              <p className="mb-4">{announcement}</p>
              <div className="flex justify-end">
                <button
                  onClick={() => handleCloseAnnouncement(announcement)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  知道了
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="flex space-x-2 mb-4 overflow-x-auto">
        {[
          { key: 'movies', label: '热门电影' },
          { key: 'tv', label: '热门剧集' },
          { key: 'variety', label: '热门综艺' },
          { key: 'bangumi', label: '每日新番' },
          { key: 'favorites', label: '收藏夹' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as typeof activeTab)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'movies' && (
        <section>
          <h2 className="text-xl font-bold mb-4">热门电影</h2>
          <div className="flex overflow-x-auto space-x-2 sm:space-x-4 pb-2">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
              : hotMovies.map(item => <VodCard key={item.id} item={item} />)}
          </div>
        </section>
      )}

      {activeTab === 'tv' && (
        <section>
          <h2 className="text-xl font-bold mb-4">热门剧集</h2>
          <div className="flex overflow-x-auto space-x-2 sm:space-x-4 pb-2">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
              : hotTv.map(item => <VodCard key={item.id} item={item} />)}
          </div>
        </section>
      )}

      {activeTab === 'variety' && (
        <section>
          <h2 className="text-xl font-bold mb-4">热门综艺</h2>
          <div className="flex overflow-x-auto space-x-2 sm:space-x-4 pb-2">
            {loading
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
              : hotVariety.map(item => <VodCard key={item.id} item={item} />)}
          </div>
        </section>
      )}

      {activeTab === 'bangumi' && (
        <section>
          <h2 className="text-xl font-bold mb-4">每日新番</h2>
          <BangumiSection bangumiData={bangumiData} />
        </section>
      )}

      {activeTab === 'favorites' && (
        <section>
          <h2 className="text-xl font-bold mb-4">收藏夹</h2>
          <div className="flex overflow-x-auto space-x-2 sm:space-x-4 pb-2">
            {favorites.length === 0 ? (
              <p className="text-gray-500">暂无收藏</p>
            ) : (
              favorites.map(item => (
                <VodCard
                  key={`${item.id}-${item.source}`}
                  item={item}
                  origin={item.origin}
                />
              ))
            )}
          </div>
        </section>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="text-center py-10">加载中...</div>}>
      <HomeClient />
    </Suspense>
  );
}
