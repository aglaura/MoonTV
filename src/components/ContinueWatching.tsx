/* eslint-disable no-console */
'use client';

import { useEffect, useState } from 'react';

import type { PlayRecord } from '@/lib/db.client';
import {
  clearAllPlayRecords,
  getAllPlayRecords,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { resolveUiLocale } from '@/lib/i18n.client';
import { useUserLanguage } from '@/lib/userLanguage.client';

import ScrollableRow from '@/components/ScrollableRow';
import VideoCard from '@/components/VideoCard';

interface ContinueWatchingProps {
  className?: string;
  isTV?: boolean;
}

export default function ContinueWatching({
  className,
  isTV = false,
}: ContinueWatchingProps) {
  const { userLocale } = useUserLanguage();
  const uiLocale =
    userLocale === 'en' || userLocale === 'zh-Hans' || userLocale === 'zh-Hant'
      ? userLocale
      : resolveUiLocale();
  const tt = (en: string, zhHans: string, zhHant: string) => {
    if (uiLocale === 'zh-Hans') return zhHans;
    if (uiLocale === 'zh-Hant') return zhHant;
    return en;
  };

  const [playRecords, setPlayRecords] = useState<
    (PlayRecord & { key: string })[]
  >([]);
  const [loading, setLoading] = useState(true);

  // 处理播放记录数据更新的函数
  const updatePlayRecords = (allRecords: Record<string, PlayRecord>) => {
    // 将记录转换为数组并根据 save_time 由近到远排序
    const recordsArray = Object.entries(allRecords).map(([key, record]) => ({
      ...record,
      key,
    }));

    // 按 save_time 降序排序（最新的在前面）
    const sortedRecords = recordsArray.sort(
      (a, b) => b.save_time - a.save_time
    );

    setPlayRecords(sortedRecords);
  };

  useEffect(() => {
    const fetchPlayRecords = async () => {
      try {
        setLoading(true);

        // 从缓存或API获取所有播放记录
        const allRecords = await getAllPlayRecords();
        updatePlayRecords(allRecords);
      } catch (error) {
        console.error('Failed to load play records:', error);
        setPlayRecords([]);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayRecords();

    // 监听播放记录更新事件
    const unsubscribe = subscribeToDataUpdates(
      'playRecordsUpdated',
      (newRecords: Record<string, PlayRecord>) => {
        updatePlayRecords(newRecords);
      }
    );

    return unsubscribe;
  }, []);

  // 如果没有播放记录，则不渲染组件
  if (!loading && playRecords.length === 0) {
    return null;
  }

  const titleClass = isTV
    ? 'text-white'
    : 'text-gray-800 dark:text-gray-200';
  const actionClass = isTV
    ? 'text-white/60 hover:text-white'
    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200';
  const skeletonPosterClass = isTV
    ? 'bg-white/10'
    : 'bg-gray-200 dark:bg-gray-800';
  const skeletonPosterInnerClass = isTV
    ? 'bg-white/15'
    : 'bg-gray-300 dark:bg-gray-700';
  const skeletonLineClass = isTV
    ? 'bg-white/10'
    : 'bg-gray-200 dark:bg-gray-800';

  return (
    <section className={`mb-8 ${className || ''}`}>
      <div className='mb-4 flex items-center justify-between'>
        <h2
          className={`font-bold ${titleClass} ${isTV ? 'text-2xl' : 'text-xl'}`}
        >
          {tt('Continue watching', '继续观看', '繼續觀看')}
        </h2>
        {!loading && playRecords.length > 0 && (
          <button
            className={`${actionClass} ${isTV ? 'text-base' : 'text-sm'}`}
            onClick={async () => {
              await clearAllPlayRecords();
              setPlayRecords([]);
            }}
          >
            {tt('Clear', '清空', '清空')}
          </button>
        )}
      </div>
      <ScrollableRow dataTvGroup='continue' dataTvDirection='horizontal'>
        {loading
          ? // 加载状态显示灰色占位数据
            Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className={`min-w-[96px] w-24 sm:min-w-[180px] sm:w-44 ${
                  isTV ? 'lg:min-w-[220px] lg:w-52' : ''
                }`}
              >
                <div
                  className={`relative aspect-[2/3] w-full overflow-hidden rounded-lg animate-pulse ${skeletonPosterClass}`}
                >
                  <div
                    className={`absolute inset-0 ${skeletonPosterInnerClass}`}
                  ></div>
                </div>
                <div
                  className={`mt-2 h-4 rounded animate-pulse ${skeletonLineClass}`}
                ></div>
                <div
                  className={`mt-1 h-3 rounded animate-pulse ${skeletonLineClass}`}
                ></div>
              </div>
            ))
          : // 显示真实数据
            playRecords.map((record) => {
              const plusIndex = record.key.indexOf('+');
              const source = plusIndex > -1 ? record.key.slice(0, plusIndex) : '';
              const id = plusIndex > -1 ? record.key.slice(plusIndex + 1) : '';
              const progress =
                record.total_time > 0
                  ? Math.max(
                      0,
                      Math.min(
                        100,
                        Math.round((record.play_time / record.total_time) * 100)
                      )
                    )
                  : 0;
              return (
                <div
                  key={record.key}
                  className={`min-w-[96px] w-24 sm:min-w-[180px] sm:w-44 ${
                    isTV ? 'lg:min-w-[220px] lg:w-52' : ''
                  }`}
                >
                  <VideoCard
                    // Render like a normal aggregated card; let /play find the best source
                    id={id}
                    source={source}
                    title={record.title}
                    poster={record.cover}
                    year={record.year}
                    episodes={record.total_episodes}
                    source_name={record.source_name}
                    currentEpisode={record.index}
                    query={record.search_title || record.title}
                    progress={progress}
                    from='playrecord'
                    type={record.total_episodes > 1 ? 'tv' : ''}
                    size={isTV ? 'lg' : undefined}
                  />
                </div>
              );
            })}
      </ScrollableRow>
    </section>
  );
}
