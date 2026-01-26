/* eslint-disable no-console */
'use client';

import { useEffect, useMemo, useState } from 'react';

import type { PlayRecord } from '@/lib/db.client';
import {
  clearAllPlayRecords,
  getAllPlayRecords,
  savePlayRecord,
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

type ContinueWatchingMode = 'tv' | 'tablet' | 'mobile';

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
  const episodeUpdateKeysRef = useMemo(() => new Set<string>(), []);
  const mode = useMemo<ContinueWatchingMode>(() => {
    if (isTV) return 'tv';
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      return 'tablet';
    }
    return 'mobile';
  }, [isTV]);

  // 处理播放记录数据更新的函数
  const updatePlayRecords = (allRecords: Record<string, PlayRecord>) => {
    const normalizeTitle = (title?: string) =>
      (title || '').trim().toLowerCase();
    const normalizeImdbId = (value?: string | null) => {
      if (!value) return null;
      const match = value.match(/(tt\d{5,}|imdbt\d+)/i);
      return match ? match[0].toLowerCase() : null;
    };
    const buildMergeKey = (record: PlayRecord & { key: string }) => {
      const imdbId = normalizeImdbId(record.imdbId);
      if (imdbId) return `imdb:${imdbId}`;
      const doubanId =
        typeof record.douban_id === 'number' && Number.isFinite(record.douban_id)
          ? record.douban_id
          : null;
      if (doubanId) return `douban:${doubanId}`;

      const title = normalizeTitle(
        record.search_title || record.title || record.imdbTitle
      );
      const year = (record.year || '').toString().trim();
      const episodeTag = record.total_episodes > 1 ? 'tv' : 'movie';
      if (title && year) return `titleyear:${title}:${year}:${episodeTag}`;
      const cover = (record.cover || '').toString().trim();
      if (title && cover) return `titlecover:${title}:${cover}`;
      if (title) return `title:${title}:${episodeTag}`;
      return `key:${record.key}`;
    };

    // 将记录转换为数组并根据 save_time 由近到远排序
    const recordsArray = Object.entries(allRecords).map(([key, record]) => ({
      ...record,
      key,
    }));

    // 按 save_time 降序排序（最新的在前面）
    const sortedRecords = recordsArray.sort(
      (a, b) => b.save_time - a.save_time
    );

    // 合并不同来源的同一视频，只保留最新记录
    const merged: (PlayRecord & { key: string })[] = [];
    const seen = new Set<string>();
    for (const record of sortedRecords) {
      const mergeKey = buildMergeKey(record);
      if (seen.has(mergeKey)) continue;
      seen.add(mergeKey);
      merged.push(record);
    }

    setPlayRecords(merged);
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

  const maxItems = mode === 'tv' ? 12 : mode === 'tablet' ? 10 : 8;
  const visibleRecords = playRecords.slice(0, maxItems);
  const progressHeight =
    mode === 'tv' ? 'h-2' : mode === 'tablet' ? 'h-1.5' : 'h-1';
  const cardSize = mode === 'tv' ? 'lg' : mode === 'tablet' ? 'md' : 'sm';

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
  const resumeBadgeClass = isTV
    ? 'bg-white/90 text-black'
    : 'bg-black/70 text-white';
  const progressTrackClass = mode === 'tv' ? 'bg-white/25' : undefined;
  const progressFillClass = mode === 'tv' ? 'bg-white' : undefined;

  const handleClear = async () => {
    if (mode !== 'mobile') {
      const ok = window.confirm(
        tt(
          'Clear all watch progress?',
          '确认清空观看记录？',
          '確認清空觀看紀錄？'
        )
      );
      if (!ok) return;
    }
    await clearAllPlayRecords();
    setPlayRecords([]);
  };

  useEffect(() => {
    if (!visibleRecords.length) return;
    let cancelled = false;

    const refreshEpisodeCounts = async () => {
      for (const record of visibleRecords) {
        if (!record?.key) continue;
        if (episodeUpdateKeysRef.has(record.key)) continue;
        episodeUpdateKeysRef.add(record.key);

        const plusIndex = record.key.indexOf('+');
        if (plusIndex <= 0) continue;
        const source = record.key.slice(0, plusIndex);
        const id = record.key.slice(plusIndex + 1);
        if (!source || !id) continue;

        try {
          const res = await fetch(
            `/api/detail?source=${encodeURIComponent(source)}&id=${encodeURIComponent(id)}`
          );
          if (!res.ok) continue;
          const data = await res.json();
          if (cancelled || !data) continue;
          const episodeCount = Array.isArray(data.episodes)
            ? data.episodes.length
            : 0;
          if (episodeCount > 0 && episodeCount !== record.total_episodes) {
            await savePlayRecord(source, id, {
              ...record,
              total_episodes: episodeCount,
            });
          }
        } catch {
          // ignore lookup failures
        }
      }
    };

    void refreshEpisodeCounts();

    return () => {
      cancelled = true;
    };
  }, [visibleRecords, episodeUpdateKeysRef]);

  // 如果没有播放记录，则不渲染组件
  if (!loading && playRecords.length === 0) {
    return null;
  }

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
            onClick={handleClear}
          >
            {tt('Clear', '清空', '清空')}
          </button>
        )}
      </div>
      <ScrollableRow
        {...(isTV
          ? { dataTvGroup: 'continue', dataTvDirection: 'horizontal' }
          : {})}
      >
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
            visibleRecords.map((record) => {
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
                  className={`relative min-w-[96px] w-24 sm:min-w-[180px] sm:w-44 ${
                    isTV ? 'lg:min-w-[220px] lg:w-52' : ''
                  }`}
                >
                  {progress > 0 && (
                    <div
                      className={`absolute top-2 left-2 z-10 px-2 py-0.5 text-xs rounded-full pointer-events-none ${resumeBadgeClass}`}
                    >
                      {tt('Resume', '续播', '續播')}
                    </div>
                  )}
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
                    size={cardSize}
                    progressHeightClassName={progressHeight}
                    progressTrackClassName={progressTrackClass}
                    progressFillClassName={progressFillClass}
                  />
                </div>
              );
            })}
      </ScrollableRow>
    </section>
  );
}
