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
} from '@/lib/utils';

import ProviderSourceSearch, {
  GroupedSource,
  SourceMetric,
} from './ProviderSourceSearch';

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
  /** 布局变体 */
  variant?: 'default' | 'tv';
  /** 剧集时长显示 */
  episodeRuntimeLabel?: string;
  /** 封面图 */
  videoCover?: string;
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
  variant = 'default',
  episodeRuntimeLabel,
  videoCover,
}) => {
  const isTvVariant = variant === 'tv';
  const parseChineseNumber = useCallback((text: string): number | null => {
    const map: Record<string, number> = {
      一: 1,
      二: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
      十: 10,
      零: 0,
    };
    if (!text) return null;
    let total = 0;
    let current = 0;
    for (const char of text) {
      if (map[char] !== undefined) {
        current = map[char];
      } else if (char === '十') {
        current = current === 0 ? 10 : current * 10;
      }
    }
    total += current;
    return total || null;
  }, []);

  const extractSeason = useCallback(
    (title?: string): number => {
      if (!title) return 1;
      const cleaned = title.trim();
      const patterns = [
        /第\s*([0-9一二三四五六七八九十零]+)\s*季/,
        /Season\s*(\d{1,2})/i,
        /\bS(\d{1,2})\b/i,
        /第\s*([0-9一二三四五六七八九十零]+)\s*部/,
      ];
      for (const p of patterns) {
        const m = cleaned.match(p);
        if (m && m[1]) {
          const numText = m[1];
          if (/^\d+$/.test(numText)) {
            const n = parseInt(numText, 10);
            if (n > 0) return n;
          }
          const cn = parseChineseNumber(numText);
          if (cn && cn > 0) return cn;
        }
      }
      return 1;
    },
    [parseChineseNumber]
  );

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
  const [expandAllToggle, setExpandAllToggle] = useState(false);

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

  useEffect(() => {
    if (expandAllToggle) {
      setExpandedProviders((prev) => {
        if (prev.size === providerCount) return prev;
        const all = new Set<string>();
        availableSources.forEach((s) => {
          const key = s.source?.toString() ?? '';
          if (key) all.add(key);
        });
        return all;
      });
    } else {
      setExpandedProviders(new Set());
    }
  }, [expandAllToggle, availableSources, providerCount]);

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
  const [selectedSeason, setSelectedSeason] = useState<number>(1);

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

  const buildPosterPlaceholder = useCallback((text?: string) => {
    const label = (text || 'No Image').slice(0, 12);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="180" viewBox="0 0 120 180"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#e5e7eb" offset="0%"/><stop stop-color="#cbd5e1" offset="100%"/></linearGradient></defs><rect width="120" height="180" fill="url(#g)"/><text x="50%" y="50%" fill="#475569" font-size="14" font-family="Arial, sans-serif" font-weight="600" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
  }, []);

  const seriesPoster = useMemo(() => {
    if (videoCover) return videoCover;
    const fromSource = availableSources.find((source) => source.poster)?.poster;
    return fromSource || buildPosterPlaceholder(videoTitle);
  }, [availableSources, buildPosterPlaceholder, videoCover, videoTitle]);

  const runtimeText = episodeRuntimeLabel || '--';

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
      season: extractSeason(source.title),
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

    return sourcesWithIndex.map(({ source, season }) => ({
      ...source,
      season,
    }));
  }, [availableSources, currentId, currentSource, extractSeason]);

  const availableSeasons = useMemo(() => {
    const seasons = new Set<number>();
    sortedSources.forEach((s: any) => {
      if (typeof s.season === 'number' && s.season > 0) {
        seasons.add(s.season);
      }
    });
    if (seasons.size === 0) seasons.add(1);
    return Array.from(seasons).sort((a, b) => a - b);
  }, [sortedSources]);

  useEffect(() => {
    if (availableSeasons.length > 0) {
      setSelectedSeason((prev) =>
        availableSeasons.includes(prev) ? prev : availableSeasons[0]
      );
    }
  }, [availableSeasons]);

  const seasonFilteredSources = useMemo(() => {
    return sortedSources.filter((s: any) => {
      const season = typeof s.season === 'number' ? s.season : 1;
      return season === selectedSeason;
    });
  }, [sortedSources, selectedSeason]);

  const groupedSources = useMemo<GroupedSource[]>(() => {
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

    const buildMetricsWithScore = (sources: SearchResult[]): SourceMetric[] => {
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
    for (const source of seasonFilteredSources) {
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
          undefined as SourceMetric | undefined
        );
        const bestSpeedEntry = metrics.reduce(
          (best, curr) =>
            (curr.speedValue ?? 0) > (best?.speedValue ?? 0) ? curr : best,
          undefined as SourceMetric | undefined
        );
        const bestPingEntry = metrics.reduce(
          (best, curr) => {
            if (typeof curr.pingTime !== 'number') return best;
            if (!best || typeof best.pingTime !== 'number') {
              return curr;
            }
            return curr.pingTime < best.pingTime ? curr : best;
          },
          undefined as SourceMetric | undefined
        );

        const bestOverall = metrics.reduce((best, curr) => {
          if (!best) return curr;
          if (curr.score !== best.score) {
            return curr.score > best.score ? curr : best;
          }
          if ((curr.qualityRank ?? 0) !== (best.qualityRank ?? 0)) {
            return (curr.qualityRank ?? 0) > (best.qualityRank ?? 0)
              ? curr
              : best;
          }
          if ((curr.speedValue ?? 0) !== (best.speedValue ?? 0)) {
            return (curr.speedValue ?? 0) > (best.speedValue ?? 0)
              ? curr
              : best;
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
        }, undefined as SourceMetric | undefined);

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
  }, [seasonFilteredSources, videoInfoMap, currentId, currentSource]);

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
  const episodeNumbers = useMemo(() => {
    const len = currentEnd - currentStart + 1;
    return Array.from({ length: len }, (_, i) =>
      descending ? currentEnd - i : currentStart + i
    );
  }, [currentEnd, currentStart, descending]);
  const isLowEndTV = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const cores = navigator.hardwareConcurrency || 0;
    const ua = navigator.userAgent || '';
    return (cores > 0 && cores <= 4) || /Amlogic|MTK|Android TV/i.test(ua);
  }, []);
  const motionSafe = !isLowEndTV;

  if (isTvVariant) {
    return (
      <div className='space-y-3'>
        {totalEpisodes > 1 && (
          <div className='flex items-center gap-3 px-2'>
            <div className='flex-1 overflow-x-auto pr-1' ref={categoryContainerRef}>
              <div className='flex gap-2 min-w-max pb-1'>
                {categories.map((label, idx) => {
                  const isActive = idx === currentPage;
                  return (
                    <button
                      key={label}
                      type='button'
                      data-focusable='true'
                      data-tv-selected={isActive ? 'true' : undefined}
                      ref={(el) => {
                        buttonRefs.current[idx] = el;
                      }}
                      onClick={() => handleCategoryClick(idx)}
                      aria-pressed={isActive}
                      className={`px-3 py-1.5 rounded-full text-[11px] uppercase tracking-[0.28em] transition-colors whitespace-nowrap border ${
                        isActive
                          ? 'text-white border-white/50 bg-white/10'
                          : 'text-white/60 border-white/10 hover:text-white'
                      }`.trim()}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {episodeNumbers.length > 1 && (
              <button
                type='button'
                data-focusable='true'
                aria-label={descending ? 'Sort ascending' : 'Sort descending'}
                title={descending ? 'Sort ascending' : 'Sort descending'}
                className='shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-colors'
                onClick={() => {
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
            )}
          </div>
        )}
        <div className='flex gap-4 overflow-x-auto px-2 pb-2' data-tv-scroll='row'>
          {episodeNumbers.map((episodeNumber, index) => {
            const isActive = episodeNumber === value;
            return (
              <button
                key={episodeNumber}
                type='button'
                data-focusable='true'
                data-tv-focusable='true'
                data-tv-card='true'
                data-tv-selected={isActive ? 'true' : undefined}
                data-tv-index={index}
                onClick={() => handleEpisodeClick(episodeNumber - 1)}
                className={`tv-card ${
                  motionSafe ? '' : 'tv-card-lite'
                } group relative flex-shrink-0 w-[220px] sm:w-[240px] lg:w-[260px] rounded-2xl overflow-hidden border bg-black/40 text-left focus-visible:outline-none ${
                  isActive ? 'border-white/30' : 'border-white/10'
                }`}
                aria-current={isActive ? 'true' : undefined}
              >
                <div
                  className='aspect-[16/9] w-full bg-black/50 bg-cover bg-center'
                  style={{ backgroundImage: `url(${seriesPoster})` }}
                />
                <div className='px-3 py-3'>
                  <div className='text-[10px] uppercase tracking-[0.35em] text-white/50'>
                    Episode
                  </div>
                  <div className='mt-1 text-base font-semibold text-white'>
                    E{episodeNumber}
                  </div>
                  <div className='mt-1 text-xs text-white/60'>
                    Runtime {runtimeText}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div
      id='source-panel'
      className='w-full min-w-0 md:ml-0 px-2 sm:px-3 py-0 rounded-xl flex flex-col h-full bg-black/10 dark:bg-white/5 border border-white/0 dark:border-white/30 overflow-hidden'
    >
      {/* 主要的 Tab 切换 - 无缝融入设计 */}
      <div className='flex mb-1 -mx-2 sm:-mx-3 flex-shrink-0 relative z-[10]'>
        {totalEpisodes > 1 && (
          <div
            onClick={() => setActiveTab('episodes')}
            className={`flex-1 py-3 px-3 sm:px-4 text-center cursor-pointer transition-all duration-200 font-medium min-h-[48px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-500
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
          className={`flex-1 py-3 px-3 sm:px-4 text-center cursor-pointer transition-all duration-200 font-medium min-h-[48px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-500
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
          <div className='flex items-center gap-3 mb-3 border-b border-gray-300 dark:border-gray-700 -mx-2 sm:-mx-3 px-2 sm:px-3 flex-shrink-0'>
            <div className='flex-1 overflow-x-auto pr-1' ref={categoryContainerRef}>
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

          {/* 集数列表 */}
          <div className='grid grid-cols-[repeat(auto-fill,minmax(40px,1fr))] auto-rows-[40px] gap-x-3 gap-y-3 overflow-y-auto h-full pb-4'>
            {episodeNumbers.map((episodeNumber) => {
              const isActive = episodeNumber === value;
              return (
                <button
                  key={episodeNumber}
                  onClick={() => handleEpisodeClick(episodeNumber - 1)}
                  className={`h-10 flex items-center justify-center text-sm font-medium rounded-md transition-all duration-200 
                    ${
                      isActive
                        ? 'bg-green-800 text-white shadow-lg shadow-green-800/25 dark:bg-green-700'
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
        <ProviderSourceSearch
          availableSeasons={availableSeasons}
          selectedSeason={selectedSeason}
          onSeasonChange={setSelectedSeason}
          sourceSearchLoading={sourceSearchLoading}
          sourceSearchError={sourceSearchError}
          availableSources={availableSources}
          searchStats={searchStats}
          providerCount={providerCount}
          groupedSources={groupedSources}
          expandedProviders={expandedProviders}
          setExpandedProviders={setExpandedProviders}
          currentSource={currentSource}
          currentId={currentId}
          onSourceSelect={handleSourceClick}
          convertToTraditional={convertToTraditional}
          buildPosterPlaceholder={buildPosterPlaceholder}
          doubanEnglishMap={doubanEnglishMap}
          videoTitle={videoTitle}
          variant={variant}
          onSearchMismatch={(title) => {
            router.push(`/search?q=${encodeURIComponent(title)}`);
          }}
        />
      )}
    </div>
  );
};

export default EpisodeSelector;
