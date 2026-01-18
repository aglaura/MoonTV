'use client';

import React, { memo, useCallback, useMemo } from 'react';

import ContinueWatching from '@/components/ContinueWatching';
import VideoCard from '@/components/VideoCard';
import type { ScreenMode } from '@/lib/screenMode';

type CardItem = {
  title: string;
  title_en?: string;
  poster?: string;
  posterAlt?: string[];
  posterDouban?: string;
  posterTmdb?: string;
  douban_id?: number;
  imdb_id?: string;
  rate?: string;
  year?: string;
  type?: string;
  query?: string;
  source_name?: string;
  id?: string | number;
};

type ContentRailProps = {
  title: string;
  href?: string;
  items: CardItem[];
  screenMode: ScreenMode;
  tt: (en: string, zhHans: string, zhHant: string) => string;
};

type CategoryData = Record<string, { items: CardItem[] }>;

type TvHomeProps = {
  tt: (en: string, zhHans: string, zhHant: string) => string;
  screenMode: ScreenMode;
  heroItems: CardItem[];
  categoryData: CategoryData;
  effectiveTmdbMovies: CardItem[];
  effectiveLatestMovies: CardItem[];
  effectiveTmdbTv: CardItem[];
  effectiveLatestTv: CardItem[];
  effectiveTmdbPeople: CardItem[];
  applyKidsFilter: (items: CardItem[]) => CardItem[];
  applyPosterOverrides: (items: CardItem[]) => CardItem[];
  loading: boolean;
  error: boolean;
  tvSectionClass: (id: 'hero' | 'continue' | 'rail-movie' | 'rail-tv' | 'rail-variety') => string;
  ContentRail: React.ComponentType<ContentRailProps>;
};

const TvHome = ({
  tt,
  screenMode,
  heroItems,
  categoryData,
  effectiveTmdbMovies,
  effectiveLatestMovies,
  effectiveTmdbTv,
  effectiveLatestTv,
  effectiveTmdbPeople,
  applyKidsFilter,
  applyPosterOverrides,
  loading,
  error,
  tvSectionClass,
  ContentRail,
}: TvHomeProps) => {
  const isTV = screenMode === 'tv';
  const HERO_COUNT = 8;
  const RAIL_COUNT = 24;
  const heroList = useMemo(() => heroItems.slice(0, HERO_COUNT), [heroItems]);
  const railSlice = useCallback(
    (items: CardItem[] = []) => items.slice(0, RAIL_COUNT),
    []
  );

  return (
    <>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
          {tt('Home', '首页', '首頁')}
        </h2>
      </div>
      <div className={isTV ? 'flex flex-col gap-8 xl:gap-10' : 'flex flex-col gap-6'}>
        <div className='flex flex-col gap-6 sm:gap-8'>
          {/* Spotlight row */}
          {!loading && !error && (
            <section data-tv-section='hero' className={tvSectionClass('hero')}>
              <div
                className='flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory scroll-smooth'
                data-tv-group='hero'
                data-tv-direction='horizontal'
              >
                {heroList.map((item, idx) => (
                  <div key={idx} className='min-w-[240px] max-w-[320px] snap-start'>
                    <VideoCard
                      query={item.query}
                      {...item}
                      id={item.id ? String(item.id) : undefined}
                      size='lg'
                      compactMeta
                      from='douban'
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Continue watching */}
          <section data-tv-section='continue' className={tvSectionClass('continue')}>
            <ContinueWatching isTV={isTV} />
          </section>

          {/* Error banner */}
          {error && (
            <div className='mb-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800'>
              <p className='font-bold'>
                {tt('⚠️ Data load issue', '⚠️ 数据加载异常', '⚠️ 資料載入異常')}
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

          {!loading && !error && (
            <>
              <section data-tv-section='rail-movie' className={tvSectionClass('rail-movie')}>
                <ContentRail
                  title={tt('Hot movies', '热门电影', '熱門電影')}
                  href='/douban?type=movie'
                  items={railSlice(categoryData.movie?.items || [])}
                  screenMode={screenMode}
                  tt={tt}
                />
              </section>
              <section className={tvSectionClass('rail-movie')}>
                <ContentRail
                  title={tt('Trending movies (TMDB)', 'TMDB 热门电影', 'TMDB 熱門電影')}
                  href='#'
                  items={railSlice(applyKidsFilter(applyPosterOverrides(effectiveTmdbMovies)))}
                  screenMode={screenMode}
                  tt={tt}
                />
              </section>
              <section className={tvSectionClass('rail-movie')}>
                <ContentRail
                  title={tt('Latest movies', '最新电影', '最新電影')}
                  href='#'
                  items={railSlice(applyKidsFilter(applyPosterOverrides(effectiveLatestMovies)))}
                  screenMode={screenMode}
                  tt={tt}
                />
              </section>

              <section data-tv-section='rail-tv' className={tvSectionClass('rail-tv')}>
                <ContentRail
                  title={tt('Hot CN TV', '热门华语剧', '熱門華語劇')}
                  href='/douban?type=tv&region=cn'
                  items={railSlice(categoryData['tv-cn']?.items || [])}
                  screenMode={screenMode}
                  tt={tt}
                />
                <ContentRail
                  title={tt('Trending TV (TMDB)', 'TMDB 热门剧集', 'TMDB 熱門劇集')}
                  href='#'
                  items={railSlice(applyKidsFilter(applyPosterOverrides(effectiveTmdbTv)))}
                  screenMode={screenMode}
                  tt={tt}
                />
                <ContentRail
                  title={tt('Latest TV', '最新剧集', '最新劇集')}
                  href='#'
                  items={railSlice(applyKidsFilter(applyPosterOverrides(effectiveLatestTv)))}
                  screenMode={screenMode}
                  tt={tt}
                />
              </section>
              {effectiveTmdbPeople.length > 0 && (
                <section className={tvSectionClass('rail-variety')}>
                  <ContentRail
                    title={tt('Trending people (TMDB)', 'TMDB 热门影人', 'TMDB 熱門影人')}
                    href='#'
                    items={railSlice(effectiveTmdbPeople)}
                    screenMode={screenMode}
                    tt={tt}
                  />
                </section>
              )}
              <section data-tv-section='rail-variety' className={tvSectionClass('rail-variety')}>
                <ContentRail
                  title={tt('Hot variety', '热门综艺', '熱門綜藝')}
                  href='#'
                  items={railSlice(categoryData.variety?.items || [])}
                  screenMode={screenMode}
                  tt={tt}
                />
              </section>
            </>
          )}
        </div>
      </div>
      {loading && (
        <div className='w-full h-64 flex items-center justify-center text-gray-500'>
          {tt('Loading...', '加载中...', '載入中...')}
        </div>
      )}
    </>
  );
};

export default memo(TvHome);
