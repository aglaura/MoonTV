/* eslint-disable @next/next/no-img-element */

import { useRouter } from 'next/navigation';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getDoubanSubjectDetail } from '@/lib/douban.client';
import { convertToTraditional } from '@/lib/locale';
import { SearchResult, SourceValuation } from '@/lib/types';
import {
  getQualityRank,
  getVideoResolutionFromM3u8,
  parseSpeedToKBps,
  processImageUrl,
} from '@/lib/utils';

// 定义视频信息类型
interface VideoInfo {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  hasError?: boolean; // 添加错误状态标识
  speedValue?: number;
  qualityRank?: number;
}

interface EpisodeSelectorProps {
  /** 总集数 */
  totalEpisodes: number;
  /** 每页显示多少集，默认 50 */
  episodesPerPage?: number;
  /** 当前选中的集数（1 开始） */
  value?: number;
  /** 用户点击选集后的回调 */
  onChange?: (episodeNumber: number) => void;
  /** 换源相关 */
  onSourceChange?: (source: string, id: string, title: string) => void;
  currentSource?: string;
  currentId?: string;
  videoTitle?: string;
  videoYear?: string;
  availableSources?: SearchResult[];
  sourceSearchLoading?: boolean;
  sourceSearchError?: string | null;
  /** 预计算的测速结果，避免重复测速 */
  precomputedVideoInfo?: Map<string, VideoInfo>;
  /** 已搜索的提供者数量 */
  providerCount?: number;
  /** 搜索统计 */
  searchStats?: {
    searched?: number;
    total: number;
    found: number;
    notFound: number;
    empty?: number;
    failed?: number;
  };
}

/**
 * 选集组件，支持分页、自动滚动聚焦当前分页标签，以及换源功能。
 */
const EpisodeSelector: React.FC<EpisodeSelectorProps> = ({
  totalEpisodes,
  episodesPerPage = 50,
  value = 1,
  onChange,
  onSourceChange,
  currentSource,
  currentId,
  videoTitle,
  availableSources = [],
  sourceSearchLoading = false,
  sourceSearchError = null,
  precomputedVideoInfo,
  providerCount = 0,
  searchStats = { total: 0, found: 0, notFound: 0 },
}) => {
  const router = useRouter();
  const pageCount = Math.ceil(totalEpisodes / episodesPerPage);

  // 存储每个源的视频信息
  const [videoInfoMap, setVideoInfoMap] = useState<Map<string, VideoInfo>>(
    new Map()
  );
  const [attemptedSources, setAttemptedSources] = useState<Set<string>>(
    new Set()
  );
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set()
  );

  // 使用 ref 来避免闭包问题
  const attemptedSourcesRef = useRef<Set<string>>(new Set());
  const videoInfoMapRef = useRef<Map<string, VideoInfo>>(new Map());

  // 同步状态到 ref
  useEffect(() => {
    attemptedSourcesRef.current = attemptedSources;
  }, [attemptedSources]);

  useEffect(() => {
    videoInfoMapRef.current = videoInfoMap;
  }, [videoInfoMap]);

  // 主要的 tab 状态：'episodes' 或 'sources'
  // 当只有一集时默认展示 "换源"，并隐藏 "选集" 标签
  const [activeTab, setActiveTab] = useState<'episodes' | 'sources'>(
    totalEpisodes > 1 ? 'episodes' : 'sources'
  );

  // 当前分页索引（0 开始）
  const initialPage = Math.floor((value - 1) / episodesPerPage);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);

  // 是否倒序显示
  const [descending, setDescending] = useState<boolean>(false);

  // 获取视频信息的函数 - 移除 attemptedSources 依赖避免不必要的重新创建
  const getVideoInfo = useCallback(async (source: SearchResult) => {
    const sourceKey = `${source.source}-${source.id}`;

    // 使用 ref 获取最新的状态，避免闭包问题
    if (attemptedSourcesRef.current.has(sourceKey)) {
      return;
    }

    // 如果已经有提供者级别的分辨率信息，就不再做 m3u8 探测
    const providerQuality = source.quality?.trim();
    if (
      providerQuality &&
      providerQuality !== '未知' &&
      providerQuality !== 'NA' &&
      providerQuality !== '錯誤' &&
      providerQuality !== 'Error' &&
      providerQuality !== 'Unavailable'
    ) {
      return;
    }

    // 获取第一集的URL
    if (!source.episodes || source.episodes.length === 0) {
      return;
    }
    const episodeUrl =
      source.episodes.length > 1 ? source.episodes[1] : source.episodes[0];

    // 标记为已尝试
    setAttemptedSources((prev) => new Set(prev).add(sourceKey));

    try {
      const info = await getVideoResolutionFromM3u8(episodeUrl);
      setVideoInfoMap((prev) => new Map(prev).set(sourceKey, info));
    } catch (error) {
      // 失败时保存错误状态
      setVideoInfoMap((prev) =>
        new Map(prev).set(sourceKey, {
          quality: '錯誤',
          loadSpeed: '未知',
          pingTime: 0,
          hasError: true,
        })
      );
    }
  }, []);

  // 当有预计算结果时，先合并到videoInfoMap中
  useEffect(() => {
    if (precomputedVideoInfo && precomputedVideoInfo.size > 0) {
      // 原子性地更新两个状态，避免时序问题
      setVideoInfoMap((prev) => {
        const newMap = new Map(prev);
        precomputedVideoInfo.forEach((value, key) => {
          newMap.set(key, value);
        });
        return newMap;
      });

      setAttemptedSources((prev) => {
        const newSet = new Set(prev);
        precomputedVideoInfo.forEach((info, key) => {
          if (!info.hasError) {
            newSet.add(key);
          }
        });
        return newSet;
      });

      // 同步更新 ref，确保 getVideoInfo 能立即看到更新
      precomputedVideoInfo.forEach((info, key) => {
        if (!info.hasError) {
          attemptedSourcesRef.current.add(key);
        }
      });
    }
  }, [precomputedVideoInfo]);

  const [doubanEnglishMap, setDoubanEnglishMap] = useState<
    Record<number, string>
  >({});
  const doubanEnglishMapRef = useRef<Record<number, string>>({});

  // 当切换到换源tab并且有源数据时，异步获取视频信息 - 移除 attemptedSources 依赖避免循环触发
  useEffect(() => {
    const fetchVideoInfosInBatches = async () => {
      if (activeTab !== 'sources' || availableSources.length === 0)
        return;

      // 筛选出尚未测速的播放源
      const pendingSources = availableSources.filter((source) => {
        const sourceKey = `${source.source}-${source.id}`;
        if (attemptedSourcesRef.current.has(sourceKey)) return false;

        // 已有提供者级别的分辨率信息就不再探测，避免频繁请求导致卡顿/重渲染
        const providerQuality = source.quality?.trim();
        const qualityIsKnown =
          providerQuality &&
          providerQuality !== '未知' &&
          providerQuality !== 'NA' &&
          providerQuality !== '錯誤' &&
          providerQuality !== 'Error' &&
          providerQuality !== 'Unavailable';
        return !qualityIsKnown;
      });

      if (pendingSources.length === 0) return;

      const batchSize = Math.ceil(pendingSources.length / 2);

      for (let start = 0; start < pendingSources.length; start += batchSize) {
        const batch = pendingSources.slice(start, start + batchSize);
        await Promise.all(batch.map(getVideoInfo));
      }
    };

    fetchVideoInfosInBatches();
    // 依赖项保持与之前一致
  }, [activeTab, availableSources, getVideoInfo]);

  useEffect(() => {
    doubanEnglishMapRef.current = doubanEnglishMap;
  }, [doubanEnglishMap]);

  useEffect(() => {
    const existing = doubanEnglishMapRef.current;
    const pendingIds = Array.from(
      new Set(
        availableSources
          .map((source) => source.douban_id)
          .filter(
            (id): id is number =>
              typeof id === 'number' && Number.isFinite(id) && !existing[id]
          )
      )
    );
    if (pendingIds.length === 0) {
      return;
    }

    let cancelled = false;

    const fetchEnglishTitles = async () => {
      try {
        const results = await Promise.all(
          pendingIds.map(async (id) => {
            try {
              const detail = await getDoubanSubjectDetail(id);
              const imdbTitle = detail?.imdbTitle?.trim();
              const imdbId = detail?.imdbId?.trim();
              const original = detail?.original_title?.trim();
              const fallback = imdbId ? `IMDb: ${imdbId}` : original || '';
              return { id, title: imdbTitle || fallback };
            } catch {
              return { id, title: '' };
            }
          })
        );

        if (cancelled) return;

        setDoubanEnglishMap((prev) => {
          const next = { ...prev };
          for (const { id, title } of results) {
            if (title) {
              next[id] = title;
            }
          }
          return next;
        });
      } catch {
        // ignore single fetch failures
      }
    };

    fetchEnglishTitles();

    return () => {
      cancelled = true;
    };
  }, [availableSources]);

  // 升序分页标签
  const categoriesAsc = useMemo(() => {
    return Array.from({ length: pageCount }, (_, i) => {
      const start = i * episodesPerPage + 1;
      const end = Math.min(start + episodesPerPage - 1, totalEpisodes);
      return `${start}-${end}`;
    });
  }, [pageCount, episodesPerPage, totalEpisodes]);

  // 分页标签始终保持升序
  const categories = categoriesAsc;

  const categoryContainerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // 当分页切换时，将激活的分页标签滚动到视口中间
  useEffect(() => {
    const btn = buttonRefs.current[currentPage];
    const container = categoryContainerRef.current;
    if (btn && container) {
      // 手动计算滚动位置，只滚动分页标签容器
      const containerRect = container.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      const scrollLeft = container.scrollLeft;

      // 计算按钮相对于容器的位置
      const btnLeft = btnRect.left - containerRect.left + scrollLeft;
      const btnWidth = btnRect.width;
      const containerWidth = containerRect.width;

      // 计算目标滚动位置，使按钮居中
      const targetScrollLeft = btnLeft - (containerWidth - btnWidth) / 2;

      // 平滑滚动到目标位置
      container.scrollTo({
        left: targetScrollLeft,
        behavior: 'smooth',
      });
    }
  }, [currentPage, pageCount]);

  // 处理换源tab点击，只在点击时才搜索
  const handleSourceTabClick = () => {
    setActiveTab('sources');
  };

  const handleCategoryClick = useCallback((index: number) => {
    setCurrentPage(index);
  }, []);

  const handleEpisodeClick = useCallback(
    (episodeNumber: number) => {
      onChange?.(episodeNumber);
    },
    [onChange]
  );

  const handleSourceClick = useCallback(
    (source: SearchResult) => {
      onSourceChange?.(source.source, source.id, source.title);
    },
    [onSourceChange]
  );

  const sortedSources = useMemo(() => {
    const sourcesWithIndex = availableSources.map((source, index) => ({
      source,
      index,
    }));

    sourcesWithIndex.sort((a, b) => {
      const aIsCurrent =
        a.source.source?.toString() === currentSource?.toString() &&
        a.source.id?.toString() === currentId?.toString();
      const bIsCurrent =
        b.source.source?.toString() === currentSource?.toString() &&
        b.source.id?.toString() === currentId?.toString();
      if (aIsCurrent && !bIsCurrent) return -1;
      if (!aIsCurrent && bIsCurrent) return 1;
      return a.index - b.index;
    });

    return sourcesWithIndex.map(({ source }) => source);
  }, [availableSources, currentId, currentSource]);

  const groupedSources = useMemo(() => {
    const qualityRankToScore = (rank?: number) => {
      switch (rank) {
        case 4:
          return 100;
        case 3:
          return 85;
        case 2:
          return 75;
        case 1:
          return 60;
        default:
          return 0;
      }
    };

    const QUALITY_WEIGHT = 0.8;
    const SPEED_WEIGHT = 0.1;
    const PING_WEIGHT = 0.1;

    const buildMetricsWithScore = (sources: SearchResult[]) => {
      const baseMetrics = sources.map((source, index) => {
        const key = `${source.source}-${source.id}`;
        const info = videoInfoMap.get(key);
        const quality = info?.quality ?? source.quality ?? '';
        const qualityRank = getQualityRank(quality);
        const loadSpeed =
          info?.hasError === true
            ? ''
            : info?.loadSpeed ?? source.loadSpeed ?? '';
        const speedValue =
          info?.hasError === true
            ? 0
            : info?.speedValue ?? parseSpeedToKBps(loadSpeed) ?? 0;
        const rawPing = info?.hasError ? undefined : info?.pingTime ?? source.pingTime;
        const pingTime =
          typeof rawPing === 'number' && rawPing > 0 ? rawPing : undefined;

        return {
          source,
          index,
          quality,
          qualityRank,
          loadSpeed,
          speedValue,
          pingTime,
          hasError: info?.hasError,
        };
      });

      if (
        !baseMetrics.some(
          (m) =>
            m.qualityRank > 0 ||
            m.speedValue > 0 ||
            typeof m.pingTime === 'number'
        )
      ) {
        return baseMetrics.map((m) => ({ ...m, score: 0 }));
      }

      const maxSpeed = Math.max(...baseMetrics.map((m) => m.speedValue || 0), 0);
      const pingValues = baseMetrics
        .map((m) => m.pingTime)
        .filter((v): v is number => typeof v === 'number');
      const minPing =
        pingValues.length > 0 ? Math.min(...pingValues) : Number.NaN;
      const maxPing =
        pingValues.length > 0 ? Math.max(...pingValues) : Number.NaN;

      return baseMetrics.map((m) => {
        const qualityScore = qualityRankToScore(m.qualityRank);
        const speedScore =
          maxSpeed > 0 && m.speedValue > 0
            ? Math.min(100, Math.max(0, (m.speedValue / maxSpeed) * 100))
            : 0;
        let pingScore = 0;
        if (typeof m.pingTime === 'number') {
          if (
            Number.isFinite(minPing) &&
            Number.isFinite(maxPing) &&
            maxPing > minPing
          ) {
            pingScore = Math.min(
              100,
              Math.max(0, ((maxPing - m.pingTime) / (maxPing - minPing)) * 100)
            );
          } else if (
            Number.isFinite(minPing) &&
            Number.isFinite(maxPing) &&
            maxPing === minPing
          ) {
            pingScore = 100;
          }
        }

        const score =
          qualityScore * QUALITY_WEIGHT +
          speedScore * SPEED_WEIGHT +
          pingScore * PING_WEIGHT;
        return { ...m, score };
      });
    };

    const sortSourcesWithinProvider = (sources: SearchResult[]) => {
      if (sources.length <= 1) return sources;

      const metrics = buildMetricsWithScore(sources);

      metrics.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if ((b.qualityRank ?? 0) !== (a.qualityRank ?? 0)) {
          return (b.qualityRank ?? 0) - (a.qualityRank ?? 0);
        }
        if ((b.speedValue ?? 0) !== (a.speedValue ?? 0)) {
          return (b.speedValue ?? 0) - (a.speedValue ?? 0);
        }
        if (
          (a.pingTime ?? Number.MAX_SAFE_INTEGER) !==
          (b.pingTime ?? Number.MAX_SAFE_INTEGER)
        ) {
          return (
            (a.pingTime ?? Number.MAX_SAFE_INTEGER) -
            (b.pingTime ?? Number.MAX_SAFE_INTEGER)
          );
        }
        return a.index - b.index;
      });

      return metrics.map((m) => m.source);
    };

    const groups = new Map<string, SearchResult[]>();
    for (const source of sortedSources) {
      const groupKey = source.source?.toString() ?? '';
      const existing = groups.get(groupKey);
      if (existing) {
        existing.push(source);
      } else {
        groups.set(groupKey, [source]);
      }
    }

    const enrichedGroups = Array.from(groups.entries()).map(
      ([key, sources], index) => {
        const sorted = sortSourcesWithinProvider(sources);
        const metrics = buildMetricsWithScore(sorted);
        const maxEpisodes = Math.max(
          ...sorted.map((s) => (Array.isArray(s.episodes) ? s.episodes.length : 0)),
          0
        );

        const bestQualityEntry = metrics.reduce(
          (best, curr) =>
            !best || (curr.qualityRank ?? 0) > (best.qualityRank ?? 0)
              ? curr
              : best,
          undefined as typeof metrics[number] | undefined
        );
        const bestSpeedEntry = metrics.reduce(
          (best, curr) =>
            (curr.speedValue ?? 0) > (best?.speedValue ?? 0) ? curr : best,
          undefined as typeof metrics[number] | undefined
        );
        const bestPingEntry = metrics.reduce(
          (best, curr) => {
            if (typeof curr.pingTime !== 'number') return best;
            if (!best || typeof best.pingTime !== 'number') {
              return curr;
            }
            return curr.pingTime < best.pingTime ? curr : best;
          },
          undefined as typeof metrics[number] | undefined
        );

        const bestOverall = metrics.reduce((best, curr) => {
          if (!best) return curr;
          if (curr.score !== best.score) return curr.score > best.score ? curr : best;
          if ((curr.qualityRank ?? 0) !== (best.qualityRank ?? 0)) {
            return (curr.qualityRank ?? 0) > (best.qualityRank ?? 0) ? curr : best;
          }
          if ((curr.speedValue ?? 0) !== (best.speedValue ?? 0)) {
            return (curr.speedValue ?? 0) > (best.speedValue ?? 0) ? curr : best;
          }
          if (
            (curr.pingTime ?? Number.MAX_SAFE_INTEGER) !==
            (best.pingTime ?? Number.MAX_SAFE_INTEGER)
          ) {
            return (curr.pingTime ?? Number.MAX_SAFE_INTEGER) <
              (best.pingTime ?? Number.MAX_SAFE_INTEGER)
              ? curr
              : best;
          }
          return best;
        }, undefined as typeof metrics[number] | undefined);

        const hasCurrent = sorted.some(
          (source) =>
            source.source?.toString() === currentSource?.toString() &&
            source.id?.toString() === currentId?.toString()
        );

        return {
          key,
          sources: sorted,
          metrics,
          bestQualityEntry,
          bestSpeedEntry,
          bestPingEntry,
          bestOverall,
          hasCurrent,
          maxEpisodes,
          originalIndex: index,
        };
      }
    );

    enrichedGroups.sort((a, b) => {
      if (a.hasCurrent && !b.hasCurrent) return -1;
      if (!a.hasCurrent && b.hasCurrent) return 1;

      // Prefer more episodes before other metrics.
      const aEpisodes = a.maxEpisodes ?? 0;
      const bEpisodes = b.maxEpisodes ?? 0;
      if (bEpisodes !== aEpisodes) {
        return bEpisodes - aEpisodes;
      }

      const aScore = a.bestOverall?.score ?? -1;
      const bScore = b.bestOverall?.score ?? -1;
      if (bScore !== aScore) return bScore - aScore;

      const aQuality = a.bestOverall?.qualityRank ?? 0;
      const bQuality = b.bestOverall?.qualityRank ?? 0;
      if (bQuality !== aQuality) return bQuality - aQuality;

      const aSpeed = a.bestOverall?.speedValue ?? 0;
      const bSpeed = b.bestOverall?.speedValue ?? 0;
      if (bSpeed !== aSpeed) return bSpeed - aSpeed;

      const aPing = a.bestOverall?.pingTime ?? Number.MAX_SAFE_INTEGER;
      const bPing = b.bestOverall?.pingTime ?? Number.MAX_SAFE_INTEGER;
      if (aPing !== bPing) return aPing - bPing;

      return a.originalIndex - b.originalIndex;
    });

    return enrichedGroups;
  }, [sortedSources, videoInfoMap, currentId, currentSource]);

  // Persist provider valuations using the best entry per provider and the current priority order.
  useEffect(() => {
    if (!groupedSources.length) return;

    const entries = groupedSources
      .map<SourceValuation | null>((group, idx) => {
        const sample = group.sources[0];
        if (!sample) return null;
        const key = sample.source?.toString().trim();
        if (!key) return null;
        const best = group.bestOverall;
        const quality = best?.quality ?? sample.quality ?? '未知';
        const loadSpeed = best?.loadSpeed ?? sample.loadSpeed ?? '未知';
        const pingTime =
          typeof best?.pingTime === 'number' && best.pingTime > 0
            ? best.pingTime
            : typeof sample.pingTime === 'number' && sample.pingTime > 0
            ? sample.pingTime
            : Number.MAX_SAFE_INTEGER;
        const qualityRank = best?.qualityRank ?? getQualityRank(quality);
        const speedValue =
          best?.speedValue ?? parseSpeedToKBps(loadSpeed) ?? 0;
        const priorityScore = groupedSources.length - idx;

        return {
          key,
          source: sample.source,
          quality,
          loadSpeed,
          pingTime,
          qualityRank,
          speedValue,
          sampleCount: 1,
          priorityScore,
          updated_at: Date.now(),
        };
      })
      .filter((entry): entry is SourceValuation => Boolean(entry));

    if (entries.length === 0) return;
    // Fire and forget; no user-facing impact if it fails.
    void fetch('/api/source/valuation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valuations: entries }),
    }).catch((error) => {
      console.warn('Failed to persist provider priority valuations', error);
    });
  }, [groupedSources]);

  const currentStart = currentPage * episodesPerPage + 1;
  const currentEnd = Math.min(
    currentStart + episodesPerPage - 1,
    totalEpisodes
  );

  return (
    <div className='md:ml-2 px-4 py-0 h-full rounded-xl bg-black/10 dark:bg-white/5 flex flex-col border border-white/0 dark:border-white/30 overflow-hidden'>
      {/* 主要的 Tab 切换 - 无缝融入设计 */}
      <div className='flex mb-1 -mx-6 flex-shrink-0 relative z-[10]'>
        {totalEpisodes > 1 && (
          <div
            onClick={() => setActiveTab('episodes')}
            className={`flex-1 py-3 px-6 text-center cursor-pointer transition-all duration-200 font-medium
              ${
                activeTab === 'episodes'
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-700 hover:text-green-600 bg-black/5 dark:bg-white/5 dark:text-gray-300 dark:hover:text-green-400 hover:bg-black/3 dark:hover:bg-white/3'
              }
            `.trim()}
          >
            選集
          </div>
        )}
        <div
          onClick={handleSourceTabClick}
          className={`flex-1 py-3 px-6 text-center cursor-pointer transition-all duration-200 font-medium
            ${
              activeTab === 'sources'
                ? 'text-green-600 dark:text-green-400'
                : 'text-gray-700 hover:text-green-600 bg-black/5 dark:bg-white/5 dark:text-gray-300 dark:hover:text-green-400 hover:bg-black/3 dark:hover:bg-white/3'
            }
          `.trim()}
        >
          換源
        </div>
      </div>

      {/* 选集 Tab 内容 */}
      {activeTab === 'episodes' && (
        <>
          {/* 分类标签 */}
          <div className='flex items-center gap-4 mb-4 border-b border-gray-300 dark:border-gray-700 -mx-6 px-6 flex-shrink-0'>
            <div className='flex-1 overflow-x-auto' ref={categoryContainerRef}>
              <div className='flex gap-2 min-w-max'>
                {categories.map((label, idx) => {
                  const isActive = idx === currentPage;
                  return (
                    <button
                      key={label}
                      ref={(el) => {
                        buttonRefs.current[idx] = el;
                      }}
                      onClick={() => handleCategoryClick(idx)}
                      className={`w-20 relative py-2 text-sm font-medium transition-colors whitespace-nowrap flex-shrink-0 text-center 
                        ${
                          isActive
                            ? 'text-green-500 dark:text-green-400'
                            : 'text-gray-700 hover:text-green-600 dark:text-gray-300 dark:hover:text-green-400'
                        }
                      `.trim()}
                    >
                      {label}
                      {isActive && (
                        <div className='absolute bottom-0 left-0 right-0 h-0.5 bg-green-500 dark:bg-green-400' />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* 向上/向下按钮 */}
            <button
              className='flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center text-gray-700 hover:text-green-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-green-400 dark:hover:bg-white/20 transition-colors transform translate-y-[-4px]'
              onClick={() => {
                // 切换集数排序（正序/倒序）
                setDescending((prev) => !prev);
              }}
            >
              <svg
                className='w-4 h-4'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  d='M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4'
                />
              </svg>
            </button>
          </div>

          {/* 集数网格 */}
          <div className='grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))] auto-rows-[40px] gap-x-3 gap-y-3 overflow-y-auto h-full pb-4'>
            {(() => {
              const len = currentEnd - currentStart + 1;
              const episodes = Array.from({ length: len }, (_, i) =>
                descending ? currentEnd - i : currentStart + i
              );
              return episodes;
            })().map((episodeNumber) => {
              const isActive = episodeNumber === value;
              return (
                <button
                  key={episodeNumber}
                  onClick={() => handleEpisodeClick(episodeNumber - 1)}
                  className={`h-10 flex items-center justify-center text-sm font-medium rounded-md transition-all duration-200 
                    ${
                      isActive
                        ? 'bg-green-500 text-white shadow-lg shadow-green-500/25 dark:bg-green-600'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300 hover:scale-105 dark:bg-white/10 dark:text-gray-300 dark:hover:bg-white/20'
                    }`.trim()}
                >
                  {episodeNumber}
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* 换源 Tab 内容 */}
      {activeTab === 'sources' && (
        <div className='flex flex-col h-full mt-4'>
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

          {!sourceSearchLoading &&
            !sourceSearchError &&
            availableSources.length === 0 && (
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
              <div className='flex-1 overflow-y-auto space-y-2 pb-20'>
                <div className='text-xs text-gray-600 dark:text-gray-300 mb-2 px-1'>
                  Searched{' '}
                  {searchStats.searched ?? searchStats.total ?? providerCount}{' '}
                  providers · With sources {searchStats.found} · No sources{' '}
                  {searchStats.notFound} · Failed {searchStats.failed}
                </div>
                <div className='space-y-3'>
                  {groupedSources.map((group) => {
                    const pickBestSource = () => {
                      const withEpisodes = group.sources.map((s, idx) => ({
                        s,
                        idx,
                        episodes: Array.isArray(s.episodes)
                          ? s.episodes.length
                          : 0,
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
                    const providerCode = primary.source?.toString() ?? '';

                    const groupHasCurrent = group.hasCurrent;

                    const providerMetrics = group.metrics;
                    const bestQualityEntry = group.bestQualityEntry;
                    const bestSpeedEntry = group.bestSpeedEntry;
                    const bestPingEntry = group.bestPingEntry;

                    const qualityCandidate = bestQualityEntry?.quality ?? '';
                    const qualityText =
                      qualityCandidate &&
                      qualityCandidate !== '未知' &&
                      qualityCandidate !== ''
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
                      loadSpeedCandidate &&
                      loadSpeedCandidate !== '未知' &&
                      loadSpeedCandidate !== ''
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
                        className='rounded-xl border border-gray-200/60 dark:border-white/10 bg-white dark:bg-gray-900/30 overflow-hidden shadow-sm'
                        onClick={() => {
                          // Toggle expand/collapse on tap. If collapsed, also play best.
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
                                  best.source?.toString() ===
                                    currentSource?.toString() &&
                                  best.id?.toString() === currentId?.toString()
                                )
                              ) {
                                handleSourceClick(best);
                              }
                            }
                            return next;
                          });
                        }}
                      >
                        <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between px-3 py-2 bg-gradient-to-r from-emerald-50/80 via-white to-white dark:from-white/10 dark:via-white/5 dark:to-white/5'>
                          <div className='min-w-0 sm:flex-1'>
                            <div className='flex items-center gap-2 min-w-0'>
                              <div
                                className='text-xs font-medium text-gray-900 dark:text-gray-100 truncate'
                                title={providerName}
                              >
                                {providerName}
                              </div>
                              {providerCode && (
                                <div className='text-[11px] text-gray-500 dark:text-gray-400'>
                                  {providerCode}
                                </div>
                              )}
                              {groupHasCurrent && (
                                <div className='text-[11px] px-2 py-0.5 rounded-full bg-green-500/15 dark:bg-green-500/20 text-green-700 dark:text-green-300'>
                                  Playing
                                </div>
                              )}
                            </div>
                          </div>
                            <div className='flex flex-wrap items-center gap-2 sm:justify-end'>
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
                              className='text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-200 hover:bg-emerald-500/20 transition'
                            >
                              {group.sources.length} sources
                            </button>
                            {providerHasError ? (
                              <div className='text-[11px] px-2 py-0.5 rounded-full bg-gray-500/10 dark:bg-gray-400/20 text-red-600 dark:text-red-400'>
                                檢測失敗
                              </div>
                            ) : (
                              <div
                                className={`text-[11px] px-2 py-0.5 rounded-full bg-gray-500/10 dark:bg-gray-400/20 ${qualityTextColor}`}
                              >
                                {qualityText}
                              </div>
                            )}
                            {loadSpeedText && (
                              <div className='text-[11px] px-2 py-0.5 rounded-full bg-green-500/10 dark:bg-green-500/15 text-green-700 dark:text-green-300'>
                                {loadSpeedText}
                              </div>
                            )}
                            {pingText && (
                              <div className='text-[11px] px-2 py-0.5 rounded-full bg-orange-500/10 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300'>
                                {pingText}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className='p-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
                          {(expandedProviders.has(group.key)
                            ? group.sources
                            : bestSource
                            ? [bestSource]
                            : group.sources.slice(0, 1)
                          ).map((source, idx) => {
                            const displaySourceTitle =
                              convertToTraditional(source.title) || source.title;
                            const englishSourceTitle =
                              (source.douban_id &&
                                doubanEnglishMap[source.douban_id]) ||
                              source.original_title?.trim();
                            const isCurrentSource =
                              source.source?.toString() ===
                                currentSource?.toString() &&
                              source.id?.toString() === currentId?.toString();

                            return (
                              <div
                                key={`${source.source}-${source.id}`}
                                onClick={() =>
                                  !isCurrentSource && handleSourceClick(source)
                                }
                                className={`relative rounded-xl border px-2.5 py-2 transition-all select-none duration-200 shadow-md hover:shadow-lg overflow-visible
                                  ${
                                    isCurrentSource
                                      ? 'bg-green-500/10 dark:bg-green-500/15 border-green-500/30'
                                      : 'bg-white dark:bg-gray-900/80 border-gray-200/60 dark:border-white/10 hover:bg-emerald-50/80 dark:hover:bg-white/10 cursor-pointer'
                                  }`.trim()}
                                style={{
                                  zIndex: group.sources.length - idx,
                                  marginTop: idx === 0 ? 0 : -6,
                                  transform: `translateY(${-idx * 4}px) translateX(${idx * 2}px)`,
                                }}
                              >
                                {group.sources.length > 1 &&
                                  !expandedProviders.has(group.key) &&
                                  idx === 0 && (
                                    <div
                                      className='absolute inset-0 -z-10 translate-y-1 translate-x-0 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/70'
                                      aria-hidden
                                    ></div>
                                  )}
                                <div className='flex items-start gap-3'>
                                  <div className='flex-shrink-0 w-14 h-24 bg-gray-200 dark:bg-gray-700 rounded-md overflow-hidden shadow-inner'>
                                    {source.episodes &&
                                      source.episodes.length > 0 && (
                                        <div className='relative w-full h-full'>
                                          <img
                                            src={processImageUrl(source.poster)}
                                            alt={displaySourceTitle}
                                            className='w-full h-full object-cover rounded-md'
                                            onError={(e) => {
                                              const target =
                                                e.target as HTMLImageElement;
                                              target.style.display = 'none';
                                            }}
                                          />
                                          {group.sources.length > 1 &&
                                            !expandedProviders.has(group.key) &&
                                            idx === 0 && (
                                              <div className='absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full shadow'>
                                                +{group.sources.length - 1}
                                              </div>
                                            )}
                                        </div>
                                      )}
                                  </div>

                                    <div className='min-w-0 flex-1'>
                                      <div className='flex items-start justify-between gap-3'>
                                        <div className='min-w-0'>
                                          <div
                                            className='text-sm font-medium text-gray-900 dark:text-gray-100 truncate'
                                            title={displaySourceTitle}
                                          >
                                            {displaySourceTitle}
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
                                        {idx === 0 && (
                                          <div className='text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-200'>
                                            最佳
                                          </div>
                                        )}
                                      </div>

                                      <div className='mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-600 dark:text-gray-300'>
                                        {source.episodes.length > 1 && (
                                          <div className='px-2 py-0.5 rounded-full bg-black/5 dark:bg-white/10'>
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
                        router.push(
                          `/search?q=${encodeURIComponent(videoTitle)}`
                        );
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
      )}
    </div>
  );
};

export default EpisodeSelector;
