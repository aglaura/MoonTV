/* eslint-disable no-console,react-hooks/exhaustive-deps,@typescript-eslint/no-explicit-any */

'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getDoubanCategories,
  getDoubanList,
  getDoubanRecommends,
} from '@/lib/douban.client';
import { DoubanItem, DoubanResult } from '@/lib/types';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import DoubanSelector from '@/components/DoubanSelector';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

function DoubanPageClient() {
  const searchParams = useSearchParams();
  const [doubanData, setDoubanData] = useState<DoubanItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectorsReady, setSelectorsReady] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const currentParamsRef = useRef({
    type: '',
    primarySelection: '',
    secondarySelection: '',
    multiLevelSelection: {} as Record<string, string>,
    selectedWeekday: '',
    currentPage: 0,
  });

  const type = searchParams.get('type') || 'movie';

  const [customCategories, setCustomCategories] = useState<
    Array<{ name: string; type: 'movie' | 'tv'; query: string }>
  >([]);

  const [primarySelection, setPrimarySelection] = useState<string>(() => {
    if (type === 'movie') return '热门';
    if (type === 'tv' || type === 'show') return '最近热门';
    if (type === 'anime') return '每日放送';
    return '';
  });
  const [secondarySelection, setSecondarySelection] = useState<string>(() => {
    if (type === 'movie') return '全部';
    if (type === 'tv') return 'tv';
    if (type === 'show') return 'show';
    return '全部';
  });

  const [multiLevelValues, setMultiLevelValues] = useState<
    Record<string, string>
  >({
    type: 'all',
    region: 'all',
    year: 'all',
    platform: 'all',
    label: 'all',
    sort: 'T',
  });

  const [selectedWeekday, setSelectedWeekday] = useState<string>('');

  useEffect(() => {
    const runtimeConfig = (window as any).RUNTIME_CONFIG;
    if (runtimeConfig?.CUSTOM_CATEGORIES?.length > 0) {
      setCustomCategories(runtimeConfig.CUSTOM_CATEGORIES);
    }
  }, []);

  // … keep all the existing logic for state management, loading, infinite scroll, etc.

  const skeletonData = Array.from({ length: 25 }, (_, index) => index);

  const getPageTitle = () => {
    return type === 'movie'
      ? '电影'
      : type === 'tv'
      ? '电视剧'
      : type === 'anime'
      ? '动漫'
      : type === 'show'
      ? '综艺'
      : '自定义';
  };

  const getPageDescription = () => {
    return '来自豆瓣的精选内容';
  };

  const getActivePath = () => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    return `/douban${params.toString() ? `?${params.toString()}` : ''}`;
  };

  return (
    <PageLayout activePath={getActivePath()}>
      <div className="px-4 sm:px-10 py-4 sm:py-8 overflow-visible">
        <div className="mb-6 sm:mb-8 space-y-4 sm:space-y-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-2 dark:text-gray-200">
              {getPageTitle()}
            </h1>
            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
              {getPageDescription()}
            </p>
          </div>

          {/* only DoubanSelector remains */}
          <div className="bg-white/60 dark:bg-gray-800/40 rounded-2xl p-4 sm:p-6 border border-gray-200/30 dark:border-gray-700/30 backdrop-blur-sm">
            <DoubanSelector
              type={type as 'movie' | 'tv' | 'show' | 'anime'}
              primarySelection={primarySelection}
              secondarySelection={secondarySelection}
              onPrimaryChange={setPrimarySelection}
              onSecondaryChange={setSecondarySelection}
              onMultiLevelChange={setMultiLevelValues}
              onWeekdayChange={setSelectedWeekday}
            />
          </div>
        </div>

        <div className="max-w-[95%] mx-auto mt-8 overflow-visible">
          <div className="justify-start grid grid-cols-3 gap-x-2 gap-y-12 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8 sm:gap-y-20">
            {loading || !selectorsReady
              ? skeletonData.map((index) => <DoubanCardSkeleton key={index} />)
              : doubanData.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="w-full">
                    <VideoCard
                      from="douban"
                      title={item.title}
                      poster={item.poster}
                      douban_id={Number(item.id)}
                      rate={item.rate}
                      year={item.year}
                      type={type === 'movie' ? 'movie' : ''}
                    />
                  </div>
                ))}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default function DoubanPage() {
  return (
    <Suspense>
      <DoubanPageClient />
    </Suspense>
  );
}
