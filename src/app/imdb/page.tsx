/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { tt } from '@/lib/i18n.client';

import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

type TmdbItem = {
  tmdbId: string;
  title: string;
  year: string;
  poster: string;
};

export default function ImdbPage() {
  const [items, setItems] = useState<TmdbItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/imdb/list', { cache: 'no-store' });
        if (!res.ok) {
          throw new Error(`Failed to load TMDB list (${res.status})`);
        }
        const data = (await res.json()) as { items?: TmdbItem[]; error?: string };
        setItems(Array.isArray(data.items) ? data.items : []);
        if (data.error) {
          setError(data.error);
        } else {
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <PageLayout activePath='/imdb'>
      <div className='px-3 sm:px-8 pt-4 pb-8'>
        <div className='flex items-center justify-between mb-4'>
          <div>
            <h1 className='text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white'>
              TMDB Most Popular
            </h1>
            <p className='text-sm text-gray-600 dark:text-gray-400'>
              {tt(
                'Most popular movies from The Movie Database. Tap a card to search all providers and play.',
                '来自 TMDB 的热门电影，点击卡片会重新搜索来源播放。',
                '來自 TMDB 的熱門電影，點擊卡片會重新搜尋來源播放。'
              )}
            </p>
          </div>
          <Link
            href='https://www.themoviedb.org/movie?language=en-US&sort_by=popularity.desc'
            target='_blank'
            className='text-sm text-green-700 dark:text-green-400 hover:underline'
          >
            TMDB Popular
          </Link>
        </div>

        {error && (
          <div className='p-4 rounded-lg bg-red-50 text-red-700 border border-red-200 mb-4'>
            {error}
          </div>
        )}

        <div
          className='grid gap-4 sm:gap-6'
          style={{
            gridTemplateColumns:
              'repeat(auto-fill, minmax(min(40vw, 180px), 1fr))',
          }}
        >
          {loading &&
            Array.from({ length: 12 }).map((_, idx) => (
              <div
                key={idx}
                className='aspect-[2/3] rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse'
              ></div>
            ))}
          {!loading &&
            items.map((item) => (
              <VideoCard
                key={item.tmdbId}
                from='douban'
                title={item.title}
                poster={item.poster}
                rate=''
                year={item.year}
                query={item.title}
                source_name='TMDB'
              />
            ))}
        </div>

        {!loading && items.length === 0 && !error && (
          <div className='text-center text-gray-500 dark:text-gray-400 py-10'>
            {tt('No data', '暂无数据', '暫無資料')}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
