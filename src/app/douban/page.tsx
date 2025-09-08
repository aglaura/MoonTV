/* eslint-disable no-console,react-hooks/exhaustive-deps,@typescript-eslint/no-explicit-any */

'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  getDoubanCategories,
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

  const type = searchParams.get('type') || 'movie';

  // 选择器状态
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

  // MultiLevelSelector 状态
  const [multiLevelValues, setMultiLevelValues] = useState<Record<string, string>>({
    type: 'all',
    region: 'all',
    year: 'all',
    platform: 'all',
    label: 'all',
    sort: 'T',
  });

  // 同步最新参数值到 ref
  const currentParamsRef = useRef({
    type,
    primarySelection,
    secondarySelection,
    multiLevelSelection: multiLevelValues,
    currentPage: 0,
  });

  useEffect(() => {
    currentParamsRef.current = {
      type,
      primarySelection,
      secondarySelection,
      multiLevelSelection: multiLevelValues,
      currentPage,
    };
  }, [type, primarySelection, secondarySelection, multiLevelValues, currentPage]);

  // 初始化时标记选择器为准备好状态
  useEffect(() => {
    const timer = setTimeout(() => setSelectorsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  // type变化时立即重置selectorsReady
  useEffect(() => {
    setSelectorsReady(false);
    setLoading(true);
  }, [type]);

  // 生成骨架屏数据
  const skeletonData = Array.from({ length: 25 }, (_, index) => index);

  const isSnapshotEqual = useCallback(
    (
      snapshot1: any,
      snapshot2: any
    ) => JSON.stringify(snapshot1) === JSON.stringify(snapshot2),
    []
  );

  const getRequestParams = useCallback(
    (pageStart: number) => {
      if (type === 'tv' || type === 'show') {
        return { kind: 'tv' as const, category: type, type: secondarySelection, pageLimit: 25, pageStart };
      }
      return { kind: type as 'tv' | 'movie', category: primarySelection, type: secondarySelection, pageLimit: 25, pageStart };
    },
    [type, primarySelection, secondarySelection]
  );

  const loadInitialData = useCallback(async () => {
    const requestSnapshot = {
      type,
      primarySelection,
      secondarySelection,
      multiLevelSelection: multiLevelValues,
      currentPage: 0,
    };

    try {
      setLoading(true);
      setDoubanData([]);
      setCurrentPage(0);
      setHasMore(true);
      setIsLoadingMore(false);

      let data: DoubanResult;

      if (primarySelection === '全部') {
        data = await getDoubanRecommends({
          kind: type === 'show' ? 'tv' : (type as 'tv' | 'movie'),
          pageLimit: 25,
          pageStart: 0,
          category: multiLevelValues.type || '',
          format: type === 'show' ? '综艺' : type === 'tv' ? '电视剧' : '',
          region: multiLevelValues.region || '',
          year: multiLevelValues.year || '',
          platform: multiLevelValues.platform || '',
          sort: multiLevelValues.sort || '',
          label: multiLevelValues.label || '',
        });
      } else {
        data = await getDoubanCategories(getRequestParams(0));
      }

      if (data.code === 200) {
        const currentSnapshot = { ...currentParamsRef.current };
        if (isSnapshotEqual(requestSnapshot, currentSnapshot)) {
          setDoubanData(data.list);
          setHasMore(data.list.length !== 0);
          setLoading(false);
        }
      } else {
        throw new Error(data.message || '获取数据失败');
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }, [type, primarySelection, secondarySelection, multiLevelValues, getRequestParams, isSnapshotEqual]);

  useEffect(() => {
    if (!selectorsReady) return;
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(() => loadInitialData(), 100);
    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, [selectorsReady, loadInitialData]);

  // 分页加载更多
  useEffect(() => {
    if (currentPage > 0) {
      const fetchMoreData = async () => {
        const requestSnapshot = {
          type,
          primarySelection,
          secondarySelection,
          multiLevelSelection: multiLevelValues,
          currentPage,
        };

        try {
          setIsLoadingMore(true);
          let data: DoubanResult;

          if (primarySelection === '全部') {
            data = await getDoubanRecommends({
              kind: type === 'show' ? 'tv' : (type as 'tv' | 'movie'),
              pageLimit: 25,
              pageStart: currentPage * 25,
              category: multiLevelValues.type || '',
              format: type === 'show' ? '综艺' : type === 'tv' ? '电视剧' : '',
              region: multiLevelValues.region || '',
              year: multiLevelValues.year || '',
              platform: multiLevelValues.platform || '',
              sort: multiLevelValues.sort || '',
              label: multiLevelValues.label || '',
            });
          } else {
            data = await getDoubanCategories(getRequestParams(currentPage * 25));
          }

          if (data.code === 200) {
            const currentSnapshot = { ...currentParamsRef.current };
            if (isSnapshotEqual(requestSnapshot, currentSnapshot)) {
              setDoubanData((prev) => [...prev, ...data.list]);
              setHasMore(data.list.length !== 0);
            }
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsLoadingMore(false);
        }
      };

      fetchMoreData();
    }
  }, [currentPage, type, primarySelection, secondarySelection, multiLevelValues, getRequestParams, isSnapshotEqual]);

  // 监听滚动
  useEffect(() => {
    if (!hasMore || isLoadingMore || loading || !loadingRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          setCurrentPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadingRef.current);
    observerRef.current = observer;

    return () => {
      if (observerRef.current) observerRef.current.disconnect();
    };
  }, [hasMore, isLoadingMore, loading]);

  // 选择器变化处理
  const handlePrimaryChange = useCallback((value: string) => {
    if (value !== primarySelection) {
      setLoading(true);
      setCurrentPage(0);
      setDoubanData([]);
      setHasMore(true);
      setIsLoadingMore(false);
      setPrimarySelection(value);
    }
  }, [primarySelection]);

  const handleSecondaryChange = useCallback((value: string) => {
    if (value !== secondarySelection) {
      setLoading(true);
      setCurrentPage(0);
      setDoubanData([]);
      setHasMore(true);
      setIsLoadingMore(false);
      setSecondarySelection(value);
    }
  }, [secondarySelection]);

  const handleMultiLevelChange = useCallback((values: Record<string, string>) => {
    setLoading(true);
    setCurrentPage(0);
    setDoubanData([]);
    setHasMore(true);
    setIsLoadingMore(false);
    setMultiLevelValues(values);
  }, []);

  const getPageTitle = () => {
    return type === 'movie' ? '电影' :
      type === 'tv' ? '电视剧' :
      type === 'anime' ? '动漫' :
      type === 'show' ? '综艺' : '自定义';
  };

  const getPageDescription = () => '来自豆瓣的精选内容';

  const getActivePath = () => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    const queryString = params.toString();
    return `/douban${queryString ? `?${queryString}` : ''}`;
  };

  return (
    <PageLayout activePath={getActivePath()}>
      <div className='px-4 sm:px-10 py-4 sm:py-8 overflow-visible'>
        <div className='mb-6 sm:mb-8 space-y-4 sm:space-y-6'>
          <div>
            <h1 className='text-2xl sm:text-3xl font-bold text-gray-800 mb-1 sm:mb-2 dark:text-gray-200'>
              {getPageTitle()}
            </h1>
            <p className='text-sm sm:text-base text-gray-600 dark:text-gray-400'>
              {getPageDescription()}
            </p>
          </div>

          <div className='bg-white/60 dark:bg-gray-800/40 rounded-2xl p-4 sm:p-6 border border-gray-200/30 dark:border-gray-700/30 backdrop-blur-sm'>
            <DoubanSelector
              type={type as 'movie' | 'tv' | 'show' | 'anime'}
              primarySelection={primarySelection}
              secondarySelection={secondarySelection}
              onPrimaryChange={handlePrimaryChange}
              onSecondaryChange={handleSecondaryChange}
              onMultiLevelChange={handleMultiLevelChange}
              // eslint-disable-next-line @typescript-eslint/no-empty-function
              onWeekdayChange={() => {}}
            />
          </div>
        </div>

        <div className='max-w-[95%] mx-auto mt-8 overflow-visible'>
          <div className='justify-start grid grid-cols-3 gap-x-2 gap-y-12 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,minmax(160px,1fr))] sm:gap-x-8 sm:gap-y-20'>
            {loading || !selectorsReady
              ? skeletonData.map((index) => <DoubanCardSkeleton key={index} />)
              : doubanData.map((item, index) => (
                <div key={`${item.title}-${index}`} className='w-full'>
                  <VideoCard
                    from='douban'
                    title={item.title}
                    poster={item.poster}
                    douban_id={Number(item.id)}
                    rate={item.rate}
                    year={item.year}
                    type={type === 'movie' ? 'movie' : ''}
                    isBangumi={false}
                  />
                </div>
              ))}
          </div>

          {hasMore && !loading && (
            <div
              ref={(el) => { if (el) loadingRef.current = el; }}
              className='flex justify-center mt-12 py-8'
            >
              {isLoadingMore && (
                <div className='flex items-center gap-2'>
                  <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-green-500'></div>
                  <span className='text-gray-600'>加载中...</span>
                </div>
              )}
            </div>
          )}

          {!hasMore && doubanData.length > 0 && (
            <div className='text-center text-gray-500 py-8'>已加载全部内容</div>
          )}

          {!loading && doubanData.length === 0 && (
            <div className='text-center text-gray-500 py-8'>暂无相关内容</div>
          )}
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
