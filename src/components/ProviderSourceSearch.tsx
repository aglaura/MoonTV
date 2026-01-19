/* eslint-disable @next/next/no-img-element */

import type { Dispatch, SetStateAction } from 'react';

import type { SearchResult } from '@/lib/types';

type SearchStats = {
  searched?: number;
  total: number;
  found: number;
  notFound: number;
  empty?: number;
  failed?: number;
};

export type SourceMetric = {
  source: SearchResult;
  index: number;
  quality: string;
  qualityRank: number;
  loadSpeed: string;
  speedValue: number;
  pingTime?: number;
  hasError?: boolean;
  score: number;
};

export type GroupedSource = {
  key: string;
  sources: SearchResult[];
  metrics: SourceMetric[];
  bestQualityEntry?: SourceMetric;
  bestSpeedEntry?: SourceMetric;
  bestPingEntry?: SourceMetric;
  bestOverall?: SourceMetric;
  hasCurrent: boolean;
  maxEpisodes: number;
  originalIndex: number;
};

type ProviderSourceSearchProps = {
  availableSeasons: number[];
  selectedSeason: number;
  onSeasonChange: (season: number) => void;
  sourceSearchLoading: boolean;
  sourceSearchError?: string | null;
  availableSources: SearchResult[];
  searchStats: SearchStats;
  providerCount: number;
  groupedSources: GroupedSource[];
  expandedProviders: Set<string>;
  setExpandedProviders: Dispatch<SetStateAction<Set<string>>>;
  currentSource?: string;
  currentId?: string;
  onSourceSelect: (source: SearchResult) => void;
  convertToTraditional: (text?: string) => string | undefined;
  buildPosterPlaceholder: (text?: string) => string;
  doubanEnglishMap: Record<number, string>;
  videoTitle?: string;
  onSearchMismatch: (title: string) => void;
};

const ProviderSourceSearch = ({
  availableSeasons,
  selectedSeason,
  onSeasonChange,
  sourceSearchLoading,
  sourceSearchError,
  availableSources,
  searchStats,
  providerCount,
  groupedSources,
  expandedProviders,
  setExpandedProviders,
  currentSource,
  currentId,
  onSourceSelect,
  convertToTraditional,
  buildPosterPlaceholder,
  doubanEnglishMap,
  videoTitle,
  onSearchMismatch,
}: ProviderSourceSearchProps) => {
  return (
    <div className='flex flex-col h-full mt-4'>
      {availableSeasons.length > 1 && (
        <div className='flex flex-wrap items-center gap-2 mb-2 sticky top-0 z-10 bg-black/5 dark:bg-white/5 py-1 pr-1'>
          <div className='flex items-center gap-1'>
            {availableSeasons.map((season) => (
              <button
                key={season}
                onClick={() => onSeasonChange(season)}
                className={`px-3 py-[10px] min-h-[44px] rounded-md text-xs font-medium border transition-colors ${
                  selectedSeason === season
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white/50 dark:bg-white/10 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-white/10 hover:border-green-400 hover:text-green-600'
                }`}
              >
                {`S${season}`}
              </button>
            ))}
          </div>
        </div>
      )}
      {sourceSearchLoading && (
        <div className='flex items-center justify-center py-8'>
          <div className='animate-spin rounded-full h-8 w-8 border-b-2 border-green-500'></div>
          <span className='ml-2 text-sm text-gray-600 dark:text-gray-300'>
            搜索中...
          </span>
        </div>
      )}

      {sourceSearchError && (
        <div className='flex items-center justify-center py-8'>
          <div className='text-center'>
            <div className='text-red-500 text-2xl mb-2'>⚠️</div>
            <p className='text-sm text-red-600 dark:text-red-400'>
              {sourceSearchError}
            </p>
          </div>
        </div>
      )}

      {!sourceSearchLoading && !sourceSearchError && availableSources.length === 0 && (
        <div className='flex items-center justify-center py-8'>
          <div className='text-center'>
            <div className='text-gray-400 text-2xl mb-2'>📺</div>
            <p className='text-sm text-gray-600 dark:text-gray-300'>
              暂无可用的换源
            </p>
          </div>
        </div>
      )}

      {!sourceSearchLoading &&
        !sourceSearchError &&
        availableSources.length > 0 && (
          <div className='flex-1 overflow-y-auto space-y-2 pb-20 pr-1'>
            <div className='text-xs text-gray-600 dark:text-gray-300 mb-2 px-1'>
              Searched {searchStats.searched ?? searchStats.total ?? providerCount}{' '}
              providers · With sources {searchStats.found} · No sources{' '}
              {searchStats.notFound} · Failed {searchStats.failed}
            </div>
            <div className='space-y-2'>
              {groupedSources.map((group) => {
                const pickBestSource = () => {
                  const withEpisodes = group.sources.map((s, idx) => ({
                    s,
                    idx,
                    episodes: Array.isArray(s.episodes) ? s.episodes.length : 0,
                  }));

                  const isYearMismatch = (item: (typeof withEpisodes)[number]) =>
                    item.s.verifyReason?.includes('年份') ||
                    item.s.verifyReason?.toLowerCase().includes('year');

                  const eligible = withEpisodes.filter(
                    (item) =>
                      !item.s.verifyReason &&
                      item.episodes > 0 &&
                      (item.s.title?.trim().length || 0) > 1
                  );
                  const fallbackWithYear = withEpisodes.filter(
                    (item) =>
                      !isYearMismatch(item) &&
                      item.episodes > 0 &&
                      (item.s.title?.trim().length || 0) > 1
                  );
                  const pool =
                    eligible.length > 0
                      ? eligible
                      : fallbackWithYear.length > 0
                      ? fallbackWithYear
                      : withEpisodes.filter((item) => item.episodes > 0) ||
                        withEpisodes;
                  if (!pool || pool.length === 0) return null;

                  const maxEpisodes = Math.max(
                    ...pool.map((item) => item.episodes || 0)
                  );
                  const topByEpisodes = pool.filter(
                    (item) => item.episodes === maxEpisodes
                  );

                  const best =
                    topByEpisodes.length > 0
                      ? topByEpisodes.reduce((best, curr) =>
                          curr.idx < best.idx ? curr : best
                        )
                      : pool[0];

                  return best?.s || null;
                };

                const bestSource = pickBestSource();
                const primary = group.sources[0];
                if (!primary) return null;

                const providerName =
                  convertToTraditional(primary.source_name) ||
                  primary.source_name;

                const groupHasCurrent = group.hasCurrent;

                const providerMetrics = group.metrics;
                const bestQualityEntry = group.bestQualityEntry;
                const bestSpeedEntry = group.bestSpeedEntry;
                const bestPingEntry = group.bestPingEntry;

                const qualityCandidate = bestQualityEntry?.quality ?? '';
                const qualityText =
                  qualityCandidate && qualityCandidate !== '未知' && qualityCandidate !== ''
                    ? qualityCandidate
                    : 'NA';
                const isUltraHigh = ['4K', '2K'].includes(qualityText);
                const isHigh = ['1080p', '720p'].includes(qualityText);
                const qualityTextColor =
                  qualityText === 'NA'
                    ? 'text-gray-500 dark:text-gray-400'
                    : isUltraHigh
                    ? 'text-purple-600 dark:text-purple-400'
                    : isHigh
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-yellow-600 dark:text-yellow-400';

                const loadSpeedCandidate = bestSpeedEntry?.loadSpeed ?? '';
                const loadSpeedText =
                  loadSpeedCandidate && loadSpeedCandidate !== '未知' && loadSpeedCandidate !== ''
                    ? loadSpeedCandidate
                    : '';
                const pingCandidate = bestPingEntry?.pingTime;
                const pingText =
                  typeof pingCandidate === 'number' && pingCandidate > 0
                    ? `${pingCandidate}ms`
                    : '';
                const providerHasError =
                  providerMetrics.length > 0 &&
                  providerMetrics.every((m) => m.hasError);

                return (
                  <div
                    key={group.key}
                    className='rounded-lg border border-gray-200/70 dark:border-white/10 bg-white dark:bg-gray-900/40 overflow-hidden shadow-sm w-full px-1'
                    onClick={() => {
                      setExpandedProviders((prev) => {
                        const next = new Set(prev);
                        if (next.has(group.key)) {
                          next.delete(group.key);
                        } else {
                          next.add(group.key);
                          const best = bestSource || group.sources[0];
                          if (
                            best &&
                            !(
                              best.source?.toString() === currentSource?.toString() &&
                              best.id?.toString() === currentId?.toString()
                            )
                          ) {
                            onSourceSelect(best);
                          }
                        }
                        return next;
                      });
                    }}
                  >
                    <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between px-1.5 py-1 bg-gradient-to-r from-emerald-50/70 via-white to-white dark:from-white/10 dark:via-white/5 dark:to-white/5'>
                      <div className='min-w-0 sm:flex-1'>
                        <div className='flex items-center gap-1.5 min-w-0'>
                          <div
                            className='text-xs font-semibold text-gray-900 dark:text-gray-100 truncate'
                            title={providerName}
                          >
                            {providerName}
                          </div>
                          {groupHasCurrent && (
                            <div className='text-[10px] px-1.5 py-0.5 rounded-full bg-green-800/15 dark:bg-green-700/25 text-green-900 dark:text-green-100'>
                              Playing
                            </div>
                          )}
                        </div>
                      </div>
                      <div className='flex flex-wrap items-center gap-1.5 sm:justify-end'>
                        <button
                          type='button'
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedProviders((prev) => {
                              const next = new Set(prev);
                              if (next.has(group.key)) {
                                next.delete(group.key);
                              } else {
                                next.add(group.key);
                              }
                              return next;
                            });
                          }}
                          className='text-[10px] px-1 py-0.5 rounded-full bg-green-800/15 text-green-900 dark:bg-green-700/25 dark:text-green-100 hover:bg-green-800/25 transition min-h-[24px]'
                        >
                          {group.sources.length} sources
                        </button>
                        {providerHasError ? (
                          <div className='text-[10px] px-1.5 py-0.5 rounded-full bg-gray-500/10 dark:bg-gray-400/20 text-red-600 dark:text-red-400'>
                            檢測失敗
                          </div>
                        ) : (
                          <div
                            className={`text-[10px] px-1.5 py-0.5 rounded-full bg-gray-500/10 dark:bg-gray-400/20 ${qualityTextColor}`}
                          >
                            {qualityText}
                          </div>
                        )}
                        {loadSpeedText && (
                          <div className='text-[10px] px-1.5 py-0.5 rounded-full bg-green-800/15 dark:bg-green-700/25 text-green-900 dark:text-green-100'>
                            {loadSpeedText}
                          </div>
                        )}
                        {pingText && (
                          <div className='text-[10px] px-1.5 py-0.5 rounded-full bg-orange-500/10 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300'>
                            {pingText}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className='px-1 pb-0.5 pt-0.5 flex flex-col gap-0.5'>
                      {(expandedProviders.has(group.key)
                        ? group.sources
                        : bestSource
                        ? [bestSource]
                        : group.sources.slice(0, 1)
                      ).map((source, idx) => {
                        const displaySourceTitle =
                          convertToTraditional(source.title) || source.title;
                        const englishSourceTitle =
                          (source.douban_id && doubanEnglishMap[source.douban_id]) ||
                          source.original_title?.trim();
                        const isCurrentSource =
                          source.source?.toString() === currentSource?.toString() &&
                          source.id?.toString() === currentId?.toString();

                        return (
                          <div
                            key={`${source.source}-${source.id}`}
                            onClick={() => !isCurrentSource && onSourceSelect(source)}
                            className={`relative rounded-lg border pr-1 pl-0 py-0.5 transition-all select-none duration-200 shadow-sm hover:shadow-md overflow-hidden
                              ${
                                isCurrentSource
                                  ? 'bg-green-500/10 dark:bg-green-500/15 border-green-500/30'
                                  : 'bg-white dark:bg-gray-900/80 border-gray-200/60 dark:border-white/10 hover:bg-emerald-50/80 dark:hover:bg-white/10 cursor-pointer'
                              }`.trim()}
                          >
                            <div className='flex items-start gap-1'>
                              <div className='relative flex-shrink-0 w-16 h-[72px] overflow-hidden rounded-sm bg-gray-200 dark:bg-gray-700 p-0'>
                                <img
                                  src={
                                    source.poster || buildPosterPlaceholder(displaySourceTitle)
                                  }
                                  alt={displaySourceTitle}
                                  className='absolute inset-0 w-full h-full object-cover'
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.onerror = null;
                                    target.src = buildPosterPlaceholder(displaySourceTitle);
                                    target.style.display = 'block';
                                  }}
                                />
                              </div>

                              <div className='min-w-0 flex-1 space-y-1'>
                                <div className='flex items-start gap-2'>
                                  <div className='min-w-0 flex-1'>
                                    <div className='flex items-center gap-1 min-w-0'>
                                      <div
                                        className='text-[13px] font-medium text-gray-900 dark:text-gray-100 truncate'
                                        title={displaySourceTitle}
                                      >
                                        {displaySourceTitle}
                                      </div>
                                      {idx === 0 && (
                                        <div className='text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-200 flex-shrink-0'>
                                          最佳
                                        </div>
                                      )}
                                    </div>
                                    {englishSourceTitle && (
                                      <div
                                        className='text-xs text-gray-500 dark:text-gray-400 truncate'
                                        title={englishSourceTitle}
                                      >
                                        {englishSourceTitle}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                <div className='flex flex-wrap items-center gap-1 text-[11px] text-gray-600 dark:text-gray-300'>
                                  {source.episodes.length > 1 && (
                                    <div className='px-1 py-0.5 rounded-full bg-black/5 dark:bg-white/10'>
                                      {source.episodes.length} 集
                                    </div>
                                  )}
                                </div>

                                {source.verifyReason && (
                                  <div className='mt-1 text-xs text-gray-500 dark:text-gray-400 break-words'>
                                    {source.verifyReason}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className='flex-shrink-0 mt-auto pt-2 border-t border-gray-400 dark:border-gray-700'>
              <button
                onClick={() => {
                  if (videoTitle) {
                    onSearchMismatch(videoTitle);
                  }
                }}
                className='w-full text-center text-xs text-gray-500 dark:text-gray-400 hover:text-green-500 dark:hover:text-green-400 transition-colors py-2'
              >
                影片匹配有誤？點擊去搜尋
              </button>
            </div>
          </div>
        )}
    </div>
  );
};

export default ProviderSourceSearch;
