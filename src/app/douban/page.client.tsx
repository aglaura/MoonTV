/* eslint-disable no-console,react-hooks/exhaustive-deps,@typescript-eslint/no-explicit-any */

'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import {
  BangumiCalendarData,
  GetBangumiCalendarData,
} from '@/lib/bangumi.client';
import { getDoubanCategories, getDoubanRecommends } from '@/lib/douban.client';
import { tt } from '@/lib/i18n.client';
import { convertToSimplified } from '@/lib/locale';
import { DoubanItem, DoubanResult } from '@/lib/types';

import DoubanCardSkeleton from '@/components/DoubanCardSkeleton';
import DoubanSelector from '@/components/DoubanSelector';
import PageLayout from '@/components/PageLayout';
import VideoCard from '@/components/VideoCard';

export interface DoubanPageClientProps {
  initialData?: DoubanItem[];
  initialSnapshot?: {
    type: string;
    primarySelection: string;
    secondarySelection: string;
  };
}

function DoubanPageContent({
  initialData = [],
  initialSnapshot,
}: DoubanPageClientProps) {
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
  const [bangumiCalendarData, setBangumiCalendarData] = useState<
    BangumiCalendarData[] | null
  >(null);

  const currentParamsRef = useRef({
    type,
    primarySelection,
    secondarySelection,
    multiLevelSelection: multiLevelValues,
    selectedWeekday,
    currentPage: 0,
  });

  const initialHydratedRef = useRef(false);

  useEffect(() => {
    currentParamsRef.current = {
      type,
      primarySelection,
      secondarySelection,
      multiLevelSelection: multiLevelValues,
      selectedWeekday,
      currentPage,
    };
  }, [
    type,
    primarySelection,
    secondarySelection,
    multiLevelValues,
    selectedWeekday,
    currentPage,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => setSelectorsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    setSelectorsReady(false);
    setSelectedWeekday('');
    // If we have initial data and it matches the snapshot, hydrate immediately.
    if (
      initialSnapshot &&
      initialSnapshot.type === type &&
      initialSnapshot.primarySelection === primarySelection &&
      initialSnapshot.secondarySelection === secondarySelection &&
      initialData.length > 0 &&
      !initialHydratedRef.current
    ) {
      initialHydratedRef.current = true;
      setDoubanData(initialData);
      setLoading(false);
      setHasMore(initialData.length !== 0);
      setCurrentPage(0);
      return;
    }
    setLoading(true);
  }, [
    type,
    primarySelection,
    secondarySelection,
    initialData,
    initialSnapshot,
  ]);

  const skeletonData = Array.from({ length: 25 }, (_, index) => index);

  const isSnapshotEqual = useCallback(
    (snapshot1: any, snapshot2: any) =>
      JSON.stringify(snapshot1) === JSON.stringify(snapshot2),
    []
  );

  const getRequestParams = useCallback(
    (pageStart: number) => {
      if (type === 'tv' || type === 'show') {
        return {
          kind: 'tv' as const,
          category: type,
          type: secondarySelection,
          pageLimit: 25,
          pageStart,
        };
      }
      return {
        kind: type as 'tv' | 'movie',
        category: primarySelection,
        type: secondarySelection,
        pageLimit: 25,
        pageStart,
      };
    },
    [type, primarySelection, secondarySelection]
  );

  const normalizeOption = useCallback((value?: string) => {
    if (!value || value === 'all' || value === '全部') {
      return '';
    }
    return convertToSimplified(value);
  }, []);

  const normalizeSort = useCallback((value?: string) => {
    if (!value || value === 'T') {
      return '';
    }
    return value;
  }, []);

  const fetchBangumiCalendar = useCallback(async () => {
    if (bangumiCalendarData) {
      return bangumiCalendarData;
    }
    const calendar = await GetBangumiCalendarData();
    setBangumiCalendarData(calendar);
    return calendar;
  }, [bangumiCalendarData]);

  const loadInitialData = useCallback(async () => {
    const requestSnapshot = {
      type,
      primarySelection,
      secondarySelection,
      multiLevelSelection: multiLevelValues,
      selectedWeekday,
      currentPage: 0,
    };

    try {
      setLoading(true);
      setDoubanData([]);
      setCurrentPage(0);
      setHasMore(true);
      setIsLoadingMore(false);

      let data: DoubanResult | null = null;

      if (type === 'anime' && primarySelection === '每日放送') {
        if (!selectedWeekday) {
          return;
        }
        const calendarData = await fetchBangumiCalendar();
        const weekdayData = calendarData.find(
          (item) => item.weekday.en === selectedWeekday
        );
        const list: DoubanItem[] = weekdayData
          ? weekdayData.items.map((item) => ({
              id: item.id?.toString() || '',
              title: item.name_cn || item.name,
              poster:
                item.images?.large ||
                item.images?.common ||
                item.images?.medium ||
                item.images?.small ||
                item.images?.grid,
              rate: item.rating?.score ? item.rating.score.toFixed(1) : '',
              year: item.air_date?.split('-')?.[0] || '',
            }))
          : [];

        data = {
          code: 200,
          message: 'success',
          list,
        };
      } else if (type === 'anime') {
        data = await getDoubanRecommends({
          kind: primarySelection === '番剧' ? 'tv' : 'movie',
          pageLimit: 25,
          pageStart: 0,
          category: '动画',
          format: primarySelection === '番剧' ? '电视剧' : '',
          region: normalizeOption(multiLevelValues.region),
          year: normalizeOption(multiLevelValues.year),
          platform: normalizeOption(multiLevelValues.platform),
          sort: normalizeSort(multiLevelValues.sort),
          label: normalizeOption(multiLevelValues.label),
        });
      } else if (primarySelection === '全部') {
        data = await getDoubanRecommends({
          kind: type === 'show' ? 'tv' : (type as 'tv' | 'movie'),
          pageLimit: 25,
          pageStart: 0,
          category: normalizeOption(multiLevelValues.type),
          format: type === 'show' ? '综艺' : type === 'tv' ? '电视剧' : '',
          region: normalizeOption(multiLevelValues.region),
          year: normalizeOption(multiLevelValues.year),
          platform: normalizeOption(multiLevelValues.platform),
          sort: normalizeSort(multiLevelValues.sort),
          label: normalizeOption(multiLevelValues.label),
        });
      } else {
        data = await getDoubanCategories(getRequestParams(0));
      }

      if (!data) {
        return;
      }

      if (data.code === 200) {
        const currentSnapshot = { ...currentParamsRef.current };
        if (isSnapshotEqual(requestSnapshot, currentSnapshot)) {
          setDoubanData(data.list);
          if (type === 'anime' && primarySelection === '每日放送') {
            setHasMore(false);
          } else {
            setHasMore(data.list.length !== 0);
          }
          setLoading(false);
        }
      } else {
        throw new Error(data.message || '獲取資料失敗');
      }
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }, [
    type,
    primarySelection,
    secondarySelection,
    multiLevelValues,
    selectedWeekday,
    getRequestParams,
    normalizeOption,
    normalizeSort,
    fetchBangumiCalendar,
    isSnapshotEqual,
  ]);

  useEffect(() => {
    if (!selectorsReady) return;
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(() => {
      const snapshot = {
        type,
        primarySelection,
        secondarySelection,
        multiLevelSelection: multiLevelValues,
        selectedWeekday,
        currentPage: 0,
      };
      if (
        initialHydratedRef.current &&
        initialSnapshot &&
        isSnapshotEqual(snapshot, {
          ...initialSnapshot,
          multiLevelSelection: multiLevelValues,
          selectedWeekday,
          currentPage: 0,
        })
      ) {
        // Already hydrated from initial data; skip redundant fetch.
        return;
      }
      loadInitialData();
    }, 100);
    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, [selectorsReady, loadInitialData]);

  useEffect(() => {
    if (currentPage > 0) {
      const fetchMoreData = async () => {
        if (type === 'anime' && primarySelection === '每日放送') {
          return;
        }

        const requestSnapshot = {
          type,
          primarySelection,
          secondarySelection,
          multiLevelSelection: multiLevelValues,
          selectedWeekday,
          currentPage,
        };

        try {
          setIsLoadingMore(true);
          let data: DoubanResult;

          if (type === 'anime') {
            data = await getDoubanRecommends({
              kind: primarySelection === '番剧' ? 'tv' : 'movie',
              pageLimit: 25,
              pageStart: currentPage * 25,
              category: '动画',
              format: primarySelection === '番剧' ? '电视剧' : '',
              region: normalizeOption(multiLevelValues.region),
              year: normalizeOption(multiLevelValues.year),
              platform: normalizeOption(multiLevelValues.platform),
              sort: normalizeSort(multiLevelValues.sort),
              label: normalizeOption(multiLevelValues.label),
            });
          } else if (primarySelection === '全部') {
            data = await getDoubanRecommends({
              kind: type === 'show' ? 'tv' : (type as 'tv' | 'movie'),
              pageLimit: 25,
              pageStart: currentPage * 25,
              category: normalizeOption(multiLevelValues.type),
              format: type === 'show' ? '综艺' : type === 'tv' ? '电视剧' : '',
              region: normalizeOption(multiLevelValues.region),
              year: normalizeOption(multiLevelValues.year),
              platform: normalizeOption(multiLevelValues.platform),
              sort: normalizeSort(multiLevelValues.sort),
              label: normalizeOption(multiLevelValues.label),
            });
          } else {
            data = await getDoubanCategories(
              getRequestParams(currentPage * 25)
            );
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
  }, [
    currentPage,
    type,
    primarySelection,
    secondarySelection,
    selectedWeekday,
    multiLevelValues,
    normalizeOption,
    normalizeSort,
    getRequestParams,
    isSnapshotEqual,
  ]);

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

  const handlePrimaryChange = useCallback(
    (value: string) => {
      if (value !== primarySelection) {
        setLoading(true);
        setCurrentPage(0);
        setDoubanData([]);
        setHasMore(true);
        setIsLoadingMore(false);
        setPrimarySelection(value);
        setMultiLevelValues({
          type: 'all',
          region: 'all',
          year: 'all',
          platform: 'all',
          label: 'all',
          sort: 'T',
        });
        if (value === '每日放送') {
          setSelectedWeekday('');
        }
      }
    },
    [primarySelection]
  );

  const handleSecondaryChange = useCallback(
    (value: string) => {
      if (value !== secondarySelection) {
        setLoading(true);
        setCurrentPage(0);
        setDoubanData([]);
        setHasMore(true);
        setIsLoadingMore(false);
        setSecondarySelection(value);
      }
    },
    [secondarySelection]
  );

  const handleMultiLevelChange = useCallback(
    (values: Record<string, string>) => {
      setLoading(true);
      setCurrentPage(0);
      setDoubanData([]);
      setHasMore(true);
      setIsLoadingMore(false);
      setMultiLevelValues(values);
    },
    []
  );

  const handleWeekdayChange = useCallback(
    (weekday: string) => {
      if (weekday === selectedWeekday) {
        return;
      }
      setSelectedWeekday(weekday);
      setLoading(true);
      setCurrentPage(0);
      setDoubanData([]);
      setHasMore(true);
      setIsLoadingMore(false);
    },
    [selectedWeekday]
  );

  const getPageTitle = () => {
    return type === 'movie'
      ? tt('Movies', '电影', '電影')
      : type === 'tv'
      ? tt('TV shows', '电视剧', '電視劇')
      : type === 'anime'
      ? tt('Anime', '动漫', '動漫')
      : type === 'show'
      ? tt('Variety', '综艺', '綜藝')
      : tt('Custom', '自定义', '自訂');
  };

  const getPageDescription = () =>
    type === 'anime' && primarySelection === '每日放送'
      ? tt(
          'Daily schedule from Bangumi',
          '来自 Bangumi 的每日放送列表',
          '來自 Bangumi 番組計劃的每日放送清單'
        )
      : tt(
          'Curated picks from Douban',
          '来自豆瓣的精选内容',
          '來自豆瓣的精選內容'
        );

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
              onWeekdayChange={handleWeekdayChange}
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
                      isBangumi={
                        type === 'anime' && primarySelection === '每日放送'
                      }
                    />
                  </div>
                ))}
          </div>

          {hasMore && !loading && (
            <div ref={loadingRef} className='flex justify-center mt-12 py-8'>
              {isLoadingMore && (
                <div className='flex items-center gap-2'>
                  <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-green-500'></div>
                  <span className='text-gray-600'>
                    {tt('Loading…', '加载中…', '載入中...')}
                  </span>
                </div>
              )}
            </div>
          )}

          {!hasMore && doubanData.length > 0 && (
            <div className='text-center text-gray-500 py-8'>
              {tt(
                'All content loaded',
                '已加载全部内容',
                '已加載全部內容'
              )}
            </div>
          )}

          {!loading && doubanData.length === 0 && (
            <div className='text-center text-gray-500 py-8'>
              {tt('No results', '暂无相关内容', '暫無相關內容')}
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}

export default function DoubanPageClient(props: DoubanPageClientProps) {
  return (
    <Suspense>
      <DoubanPageContent {...props} />
    </Suspense>
  );
}
