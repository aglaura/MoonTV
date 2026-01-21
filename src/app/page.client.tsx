/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import type { TvRegion, TvSectionId, UiLocale } from '@/lib/home.types';
import { useKidsMode } from '@/lib/kidsMode.client';
import { useHomeData } from '@/lib/useHomeData.client';
import { useHomeAnnouncement } from '@/lib/useHomeAnnouncement.client';
import { useHomeFavorites } from '@/lib/useHomeFavorites.client';
import { useHomeMode } from '@/lib/useHomeMode.client';
import { useHomeRegions } from '@/lib/useHomeRegions.client';
import { useTvSectionNavigation } from '@/lib/useTvSectionNavigation';
import { useUserLanguage } from '@/lib/userLanguage.client';

import ContinueWatching from '@/components/ContinueWatching';
import ContentRail from '@/components/home/ContentRail';
import PageLayout from '@/components/PageLayout';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';

const DEFAULT_TV_SECTIONS: TvSectionId[] = [
  'continue',
  'airing',
  'regional',
  'animation',
  'variety',
  'movies',
];

function resolveUiLocale(): UiLocale {
  try {
    const saved =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('userLocale')
        : null;
    if (saved === 'en' || saved === 'zh-Hans' || saved === 'zh-Hant') {
      return saved;
    }
  } catch {
    // ignore
  }

  const nav =
    typeof navigator !== 'undefined' ? (navigator.language || '') : '';
  const lower = nav.toLowerCase();
  if (lower.startsWith('zh-cn') || lower.startsWith('zh-hans')) return 'zh-Hans';
  if (
    lower.startsWith('zh-tw') ||
    lower.startsWith('zh-hant') ||
    lower.startsWith('zh-hk')
  ) {
    return 'zh-Hant';
  }
  return 'en';
}

function HomeClient() {
  const { userLocale } = useUserLanguage();
  const uiLocale: UiLocale = useMemo(() => {
    if (userLocale === 'en' || userLocale === 'zh-Hans' || userLocale === 'zh-Hant') {
      return userLocale;
    }
    return resolveUiLocale();
  }, [userLocale]);
  const tt = useCallback(
    (en: string, zhHans: string, zhHant: string): string => {
      if (uiLocale === 'zh-Hans') return zhHans;
      if (uiLocale === 'zh-Hant') return zhHant;
      return en;
    },
    [uiLocale]
  );

  const [activeTab, setActiveTab] = useState<'home' | 'favorites'>('home');
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  useEffect(() => {
    if (tabParam === 'favorites') {
      setActiveTab('favorites');
    } else if (tabParam === 'home') {
      setActiveTab('home');
    }
  }, [tabParam]);
  const {
    screenMode,
    isTV,
    isMobile,
    topBarModeLabel,
    canToggleMode,
    handleToggleMode,
  } = useHomeMode({ tt });
  const { announcement } = useSite();
  const { isKidsMode } = useKidsMode();
  const {
    error,
    airingRail,
    regionalTv,
    animationItems,
    varietyItems,
    movieItems,
  } = useHomeData({ uiLocale, isKidsMode });
  const { showAnnouncement, handleCloseAnnouncement, formattedAnnouncement } =
    useHomeAnnouncement(announcement, uiLocale);
  const { regionalTab, setRegionalTab, regionOptions, activeRegion } =
    useHomeRegions({ tt, uiLocale });

  // TV section focus index
  const [tvSectionIndex, setTvSectionIndex] = useState(0);
  const tvSectionList = useMemo<TvSectionId[]>(() => {
    const sections = [...DEFAULT_TV_SECTIONS];
    if (screenMode === 'tv' && isKidsMode) {
      return sections.filter((id) => id !== 'movies');
    }
    return sections;
  }, [screenMode, isKidsMode]);
  useEffect(() => {
    setTvSectionIndex(0);
  }, [tvSectionList]);

  const { favoriteItems, clearFavorites } = useHomeFavorites(activeTab);

  useEffect(() => {
    if (screenMode === 'tv' && activeTab !== 'home' && activeTab !== 'favorites') {
      setActiveTab('home');
    }
  }, [screenMode, activeTab]);

  const isTVMode = isTV;
  const isMobileMode = isMobile;
  const mainLayoutClass = isTVMode
    ? 'flex flex-col gap-8 xl:gap-10'
    : isMobileMode
    ? 'flex flex-col gap-6'
    : 'flex flex-col gap-6 xl:gap-8';
  const tvRootClass = isTVMode ? 'min-h-screen bg-black text-white' : '';
  const errorBannerClass = isTVMode
    ? 'mb-2 p-4 bg-amber-500/10 border border-amber-400/30 rounded-lg text-amber-100'
    : 'mb-2 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800';
  const regionWrapperClass = isTVMode
    ? 'space-y-4'
    : 'rounded-2xl border border-gray-200/40 dark:border-gray-800 bg-white/70 dark:bg-gray-900/60 p-4';
  const regionLabelClass = isTVMode
    ? 'text-white/60'
    : 'text-gray-500 dark:text-gray-400';
  const regionRailSpacingClass = isTVMode ? 'mt-2' : 'mt-4';
  const regionTabBaseClass = isTVMode
    ? 'border-white/15 bg-white/5 text-white/70'
    : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-emerald-400';
  const regionTabActiveClass = isTVMode
    ? 'bg-white text-black border-white'
    : 'bg-emerald-500 text-white border-emerald-500';

  const airingTitle =
    airingRail.title ||
    tt('This Week\'s Updates', '本周更新', '本週更新');

  const currentTvSection =
    isTVMode && activeTab === 'home'
      ? tvSectionList[Math.min(tvSectionIndex, tvSectionList.length - 1)] || null
      : null;

  const renderFavorites = () => (
    <section className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-200">
          {tt('My favorites', '我的收藏', '我的收藏')}
        </h2>
        {favoriteItems.length > 0 && (
          <button
            className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            onClick={clearFavorites}
          >
            {tt('Clear', '清空', '清空')}
          </button>
        )}
      </div>
      <div className="justify-start grid grid-cols-3 gap-x-2 gap-y-14 sm:gap-y-20 px-0 sm:px-2 sm:grid-cols-[repeat(auto-fill,_minmax(11rem,_1fr))] sm:gap-x-8">
        {favoriteItems.map((item) => (
          <div key={item.id + item.source} className="w-full">
            <VideoCard
              query={item.search_title}
              {...item}
              from="favorite"
              type={item.episodes > 1 ? 'tv' : ''}
            />
          </div>
        ))}
        {favoriteItems.length === 0 && (
          <div className="col-span-full text-center text-gray-500 py-8 dark:text-gray-400">
            {tt('No favorites yet', '暂无收藏内容', '暫無收藏內容')}
          </div>
        )}
      </div>
    </section>
  );

  const tvSectionClass = (id: TvSectionId) =>
    isTVMode && activeTab === 'home'
      ? currentTvSection === id
        ? 'ring-4 ring-emerald-400 shadow-[0_0_0_1px_rgba(16,185,129,0.7)] shadow-emerald-700/40 scale-[1.01] focus-within:ring-4 focus-within:ring-emerald-400/70'
        : 'opacity-60 hover:opacity-80 focus-within:opacity-100 focus-within:ring-4 focus-within:ring-emerald-400/70'
      : '';

  useTvSectionNavigation({
    enabled: isTVMode && activeTab === 'home',
    sections: tvSectionList,
    currentSection: currentTvSection,
    setSectionIndex: setTvSectionIndex,
    onHorizontalEdge: ({ direction, sectionId, focusSection }) => {
      if (sectionId !== 'regional') return false;
      const order: TvRegion[] = ['cn', 'kr', 'jp', 'en'];
      setRegionalTab((prev) => {
        const idx = order.indexOf(prev);
        const next = order[idx + (direction === 'right' ? 1 : -1)];
        return next ?? prev;
      });
      setTimeout(() => {
        focusSection('regional');
      }, 0);
      return true;
    },
  });

  return (
    <PageLayout
      topBarModeLabel={topBarModeLabel}
      onTopBarModeClick={
        topBarModeLabel && canToggleMode ? handleToggleMode : undefined
      }
    >
      <div
        className={`${tvRootClass} px-2 sm:px-6 lg:px-10 xl:px-12 py-4 sm:py-8 overflow-visible w-full`}
      >
        {isKidsMode && (
          <div className="mb-3 flex justify-center">
            <span className="px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold dark:bg-amber-900/60 dark:text-amber-50 border border-amber-200 dark:border-amber-700">
              {tt('Kids mode is on', '少儿模式已开启', '少兒模式已開啟')}
            </span>
          </div>
        )}
        {!isTVMode && (
          <div
            className={`mb-6 sm:mb-8 flex gap-2 ${
              screenMode === 'tablet' ? 'justify-start' : 'justify-center'
            }`}
          >
            <button
              onClick={() => setActiveTab('home')}
              className={`px-4 py-2 rounded-full text-sm font-semibold border ${
                activeTab === 'home'
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-emerald-400'
              }`}
            >
              {tt('Home', '首页', '首頁')}
            </button>
            <button
              onClick={() => setActiveTab('favorites')}
              className={`px-4 py-2 rounded-full text-sm font-semibold border ${
                activeTab === 'favorites'
                  ? 'bg-emerald-500 text-white border-emerald-500'
                  : 'bg-white text-gray-700 dark:bg-gray-800 dark:text-gray-200 border-gray-200 dark:border-gray-700 hover:border-emerald-400'
              }`}
            >
              {tt('Favorites', '收藏夹', '收藏夾')}
            </button>
          </div>
        )}
        <div className="w-full">
          {activeTab === 'favorites' ? (
            renderFavorites()
          ) : (
            <div className={mainLayoutClass}>
              <div className="flex flex-col gap-6 sm:gap-8">
                <section
                  data-tv-section="continue"
                  className={tvSectionClass('continue')}
                >
                  <ContinueWatching isTV={isTVMode} />
                </section>

                {error && (
                  <div className={errorBannerClass}>
                    <p className="font-bold">
                      {tt(
                        '⚠️ Data load issue',
                        '⚠️ 数据加载异常',
                        '⚠️ 資料載入異常'
                      )}
                    </p>
                    <p>
                      {tt(
                        'Unable to fetch data from Douban and other third-party APIs. Check your network and try again later.',
                        '无法从豆瓣等第三方接口获取数据，请检查网络连接或稍后重试。',
                        '無法從豆瓣等第三方介面取得資料，請檢查網路連線或稍后再試。'
                      )}
                    </p>
                  </div>
                )}

                <section
                  data-tv-section="airing"
                  className={tvSectionClass('airing')}
                >
                  <ContentRail
                    title={airingTitle}
                    items={airingRail.items}
                    screenMode={screenMode}
                    tt={tt}
                  />
                </section>

                <section
                  data-tv-section="regional"
                  className={tvSectionClass('regional')}
                >
                  <div className={regionWrapperClass}>
                    <div
                      className={`flex flex-wrap items-center justify-between gap-3 ${
                        isTVMode ? 'px-1' : ''
                      }`}
                    >
                      <div
                        className={`text-xs uppercase tracking-[0.3em] ${regionLabelClass}`}
                      >
                        {tt('Regional TV Picks', '区域剧集', '區域劇集')}
                      </div>
                      <div
                        className="flex flex-wrap gap-2"
                        data-tv-group="region-tabs"
                        data-tv-direction="horizontal"
                      >
                        {regionOptions.map((option) => {
                          const active = option.key === activeRegion.key;
                          return (
                            <button
                              key={option.key}
                              type="button"
                              disabled={isTVMode}
                              onClick={() => setRegionalTab(option.key)}
                              className={`px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-full border transition ${
                                active
                                  ? regionTabActiveClass
                                  : regionTabBaseClass
                              } ${isTVMode ? 'disabled:opacity-100 disabled:cursor-default' : ''}`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className={regionRailSpacingClass}>
                      <ContentRail
                        title={activeRegion.label}
                        href={activeRegion.href}
                        items={regionalTv[activeRegion.key] || []}
                        screenMode={screenMode}
                        tt={tt}
                      />
                    </div>
                  </div>
                </section>

                {!isMobileMode && (
                  <>
                    <section
                      data-tv-section="animation"
                      className={tvSectionClass('animation')}
                    >
                      <ContentRail
                        title={tt('Animation', '动画', '動畫')}
                        href="/douban?type=anime"
                        items={animationItems}
                        screenMode={screenMode}
                        tt={tt}
                      />
                    </section>

                    <section
                      data-tv-section="variety"
                      className={tvSectionClass('variety')}
                    >
                      <ContentRail
                        title={tt('Variety', '综艺', '綜藝')}
                        href="/douban?type=show"
                        items={varietyItems}
                        screenMode={screenMode}
                        tt={tt}
                      />
                    </section>

                    {!isKidsMode && (
                      <section
                        data-tv-section="movies"
                        className={tvSectionClass('movies')}
                      >
                        <ContentRail
                          title={tt('Movies', '电影', '電影')}
                          href="/douban?type=movie"
                          items={movieItems}
                          screenMode={screenMode}
                          tt={tt}
                        />
                      </section>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
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
            touchAction: 'none',
          }}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 transform transition-all duration-300 hover:shadow-2xl"
            onTouchMove={(e) => {
              e.stopPropagation();
            }}
            style={{
              touchAction: 'auto',
            }}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-2xl font-bold tracking-tight text-gray-800 dark:text-white border-b border-green-500 pb-1">
                {tt('Notice', '提示', '提示')}
              </h3>
              <button
                onClick={() => handleCloseAnnouncement(announcement)}
                className="text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-white transition-colors"
                aria-label={tt('Close', '关闭', '關閉')}
              >
                ×
              </button>
            </div>
            <div className="mb-6">
              <div className="relative overflow-hidden rounded-lg mb-4 bg-green-100 dark:bg-green-900/30">
                <div className="absolute inset-y-0 left-0 w-1.5 bg-green-700 dark:bg-green-400"></div>
                <p className="ml-4 text-gray-600 dark:text-gray-300 leading-relaxed">
                  {formattedAnnouncement || announcement}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCloseAnnouncement(announcement)}
              className="w-full rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-4 py-3 text-white font-medium shadow-md hover:shadow-lg hover:from-green-700 hover:to-green-800 dark:from-green-600 dark:to-green-700 dark:hover:from-green-700 dark:hover:to-green-800 transition-all duration-300 transform hover:-translate-y-0.5"
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
