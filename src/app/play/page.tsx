/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { Heart } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  deleteFavorite,
  deletePlayRecord,
  generateStorageKey,
  getAllPlayRecords,
  isFavorited,
  saveFavorite,
  savePlayRecord,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanSubjectDetail } from '@/lib/douban.client';
import { convertToTraditional } from '@/lib/locale';
import { SearchResult } from '@/lib/types';
import {
  formatSpeedFromKBps,
  getQualityLabelFromRank,
  getQualityRank,
  getVideoResolutionFromM3u8,
  parseSpeedToKBps,
  processImageUrl,
} from '@/lib/utils';

import EpisodeSelector from '@/components/EpisodeSelector';
import PageLayout from '@/components/PageLayout';
import { useUserLanguage } from '@/lib/userLanguage.client';

// 扩展 HTMLVideoElement 类型以支持 hls 属性
declare global {
  interface HTMLVideoElement {
    hls?: any;
  }
}

function PlayPageClient() {
  const { userLocale } = useUserLanguage();

  const localeTexts: Record<string, Record<string, string>> = {
    en: {
      timeoutSwitch: 'Source timed out, switching to another source…',
    },
    'zh-Hans': {
      timeoutSwitch: '来源响应超时，自动切换其他来源…',
    },
    'zh-Hant': {
      timeoutSwitch: '來源響應超時，自動切換其他來源…',
    },
  };

  const t = useCallback(
    (key: string) => {
      const locale = userLocale || 'en';
      return (
        localeTexts[locale]?.[key] ??
        localeTexts['en']?.[key] ??
        key
      );
    },
    [userLocale]
  );

  const router = useRouter();
  const searchParams = useSearchParams();

  // -----------------------------------------------------------------------------
  // 状态变量（State）
  // -----------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    'searching' | 'preferring' | 'fetching' | 'ready'
  >('searching');
  const [loadingMessage, setLoadingMessage] = useState('正在搜尋播放源...');
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SearchResult | null>(null);

  // 收藏状态
  const [favorited, setFavorited] = useState(false);

  // 去廣告开关（从 localStorage 继承，默认 true）
  const [blockAdEnabled, setBlockAdEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('enable_blockad');
      if (v !== null) return v === 'true';
    }
    return true;
  });
  const blockAdEnabledRef = useRef(blockAdEnabled);
  useEffect(() => {
    blockAdEnabledRef.current = blockAdEnabled;
  }, [blockAdEnabled]);

  // 视频基本信息
  const [videoTitle, setVideoTitle] = useState(searchParams.get('title') || '');
  const [videoYear, setVideoYear] = useState(searchParams.get('year') || '');
  const [videoCover, setVideoCover] = useState('');
  // 当前源和ID
  const [currentSource, setCurrentSource] = useState(
    searchParams.get('source') || ''
  );
  const [currentId, setCurrentId] = useState(searchParams.get('id') || '');

  // 搜索所需信息
  const [searchTitle] = useState(searchParams.get('stitle') || '');

  // 是否需要优选
  const [needPrefer, setNeedPrefer] = useState(
    searchParams.get('prefer') === 'true'
  );
  const needPreferRef = useRef(needPrefer);
  useEffect(() => {
    needPreferRef.current = needPrefer;
  }, [needPrefer]);
  // 集数相关
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);

  const currentSourceRef = useRef(currentSource);
  const currentIdRef = useRef(currentId);
  const videoTitleRef = useRef(videoTitle);
  const videoYearRef = useRef(videoYear);
  const detailRef = useRef<SearchResult | null>(detail);
  const currentEpisodeIndexRef = useRef(currentEpisodeIndex);
  const majorityEpisodeCountRef = useRef<number | null>(null);

  // 视频播放地址
  const [availableSources, setAvailableSources] = useState<SearchResult[]>([]);
  const availableSourcesRef = useRef<SearchResult[]>([]);
  const [searchStats, setSearchStats] = useState({
    total: 0,
    found: 0,
    notFound: 0,
    empty: 0,
    failed: 0,
  });
  const failedSourcesRef = useRef<Set<string>>(new Set());
  const [providerCount, setProviderCount] = useState(0);

  // 同步最新值到 refs
  useEffect(() => {
    currentSourceRef.current = currentSource;
    currentIdRef.current = currentId;
    detailRef.current = detail;
    currentEpisodeIndexRef.current = currentEpisodeIndex;
    videoTitleRef.current = videoTitle;
    videoYearRef.current = videoYear;
  }, [
    currentSource,
    currentId,
    detail,
    currentEpisodeIndex,
    videoTitle,
    videoYear,
  ]);

  useEffect(() => {
    availableSourcesRef.current = availableSources;
  }, [availableSources]);

  useEffect(() => {
    const doubanId = detail?.douban_id;
    if (!doubanId) {
      setImdbVideoTitle(undefined);
      return;
    }

    let cancelled = false;

    const fetchImdbTitle = async () => {
      try {
        const data = await getDoubanSubjectDetail(doubanId);
        if (cancelled) return;
        const imdbTitle = data?.imdbTitle?.trim();
        const imdbId = data?.imdbId?.trim();
        const original = data?.original_title?.trim();
        const fallback = imdbId ? `IMDb: ${imdbId}` : original || undefined;
        setImdbVideoTitle(imdbTitle || fallback);
        setImdbVideoId(imdbId || undefined);
      } catch {
        if (!cancelled) {
          setImdbVideoTitle(undefined);
          setImdbVideoId(undefined);
        }
      }
    };

    fetchImdbTitle();

    return () => {
      cancelled = true;
    };
  }, [detail?.douban_id]);

  // 视频播放地址
  const [videoUrl, setVideoUrl] = useState('');

  // 总集数
  const totalEpisodes = detail?.episodes?.length || 0;

  // 用于记录是否需要在播放器 ready 后跳转到指定进度
  const resumeTimeRef = useRef<number | null>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // 上次使用的音量，默认 0.7
  const lastVolumeRef = useRef<number>(0.7);
  const [sourceSearchLoading, setSourceSearchLoading] = useState(false);
  const hasStartedRef = useRef<boolean>(false);
  const [sourceSearchError, setSourceSearchError] = useState<string | null>(
    null
  );

  // 优选和测速开关
  const [optimizationEnabled] = useState<boolean>(false);

  type PrecomputedVideoInfoEntry = {
    quality: string;
    loadSpeed: string;
    pingTime: number;
    qualityRank?: number;
    speedValue?: number;
    sampleCount?: number;
    hasError?: boolean;
  };

  // 保存优选时的测速结果，避免EpisodeSelector重复测速
  const [precomputedVideoInfo, setPrecomputedVideoInfo] = useState<
    Map<string, PrecomputedVideoInfoEntry>
  >(new Map());
  const precomputedVideoInfoRef =
    useRef<Map<string, PrecomputedVideoInfoEntry>>(precomputedVideoInfo);

  const getValuationKey = useCallback((source: string) => source.trim(), []);

  const qualityRankToScore = (rank?: number): number => {
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

  const sortSourcesByValuation = useCallback(
    (
      sources: SearchResult[],
      infoOverride?: Map<string, PrecomputedVideoInfoEntry>
    ): SearchResult[] => {
      if (!sources || sources.length <= 1) {
        return sources;
      }

      const infoMap =
        infoOverride && infoOverride.size > 0
          ? infoOverride
          : precomputedVideoInfoRef.current;
      if (!infoMap || infoMap.size === 0) {
        return sources;
      }

      const metrics = sources.map((source, index) => {
        const key = getValuationKey(source.source);
        const info = infoMap.get(key);
        const qualityRank =
          info?.qualityRank ??
          (info?.quality ? getQualityRank(info.quality) : 0);
        const speedValue =
          info?.speedValue ??
          (info?.loadSpeed ? parseSpeedToKBps(info.loadSpeed) : 0);
        const pingTime =
          typeof info?.pingTime === 'number' && info.pingTime > 0
            ? info.pingTime
            : Number.MAX_SAFE_INTEGER;
        const hasInfo = Boolean(info) && (qualityRank > 0 || speedValue > 0);

        return {
          source,
          key,
          index,
          qualityRank,
          speedValue,
          pingTime,
          hasInfo,
        };
      });

      if (!metrics.some((metric) => metric.hasInfo)) {
        return sources;
      }

      const speedValues = metrics
        .map((metric) => metric.speedValue)
        .filter((value) => value && value > 0);
      const maxSpeed =
        speedValues.length > 0 ? Math.max(...speedValues) : 0;

      const pingValues = metrics
        .map((metric) => metric.pingTime)
        .filter((value) => value < Number.MAX_SAFE_INTEGER);
      const minPing =
        pingValues.length > 0 ? Math.min(...pingValues) : Number.NaN;
      const maxPing =
        pingValues.length > 0 ? Math.max(...pingValues) : Number.NaN;

      const scored = metrics.map((metric) => {
        const qualityScore = qualityRankToScore(metric.qualityRank);

        const speedScore =
          maxSpeed > 0 && metric.speedValue > 0
            ? Math.min(
                100,
                Math.max(0, (metric.speedValue / maxSpeed) * 100)
              )
            : 0;

        let pingScore = 0;
        if (metric.pingTime < Number.MAX_SAFE_INTEGER) {
          if (
            Number.isFinite(minPing) &&
            Number.isFinite(maxPing) &&
            maxPing > minPing
          ) {
            pingScore = Math.min(
              100,
              Math.max(
                0,
                ((maxPing - metric.pingTime) / (maxPing - minPing)) * 100
              )
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
          qualityScore * 0.4 + speedScore * 0.4 + pingScore * 0.2;

        return {
          ...metric,
          score: Number.isFinite(score) ? score : 0,
        };
      });

      scored.sort((a, b) => {
        if ((b.score ?? 0) !== (a.score ?? 0)) {
          return (b.score ?? 0) - (a.score ?? 0);
        }
        if ((b.qualityRank ?? 0) !== (a.qualityRank ?? 0)) {
          return (b.qualityRank ?? 0) - (a.qualityRank ?? 0);
        }
        if ((b.speedValue ?? 0) !== (a.speedValue ?? 0)) {
          return (b.speedValue ?? 0) - (a.speedValue ?? 0);
        }
        if (a.pingTime !== b.pingTime) {
          return a.pingTime - b.pingTime;
        }
        return a.index - b.index;
      });

      return scored.map((entry) => entry.source);
    },
    [getValuationKey]
  );

  const determineMajorityEpisodeCount = useCallback(
    (sources: SearchResult[]): number | null => {
      const counts = new Map<number, number>();
      sources.forEach((source) => {
        const len = source.episodes?.length || 0;
        if (len > 0) {
          counts.set(len, (counts.get(len) || 0) + 1);
        }
      });
      if (!counts.size) return null;
      let majorityLen = 0;
      let majorityFreq = 0;
      counts.forEach((freq, len) => {
        if (freq > majorityFreq || (freq === majorityFreq && len > majorityLen)) {
          majorityFreq = freq;
          majorityLen = len;
        }
      });
      return majorityLen || null;
    },
    []
  );

  const verifyAndSortSources = useCallback(
    (
      sources: SearchResult[],
      infoOverride?: Map<string, PrecomputedVideoInfoEntry>
    ): SearchResult[] => {
      const valid = (sources || []).filter((s) => {
        const len = s.episodes?.length || 0;
        return Array.isArray(s.episodes) && len > 0;
      });

      // 先按年份过滤（若有指定年份）
      const targetYear = (videoYearRef.current || '').trim();
      const penalties = new Map<string, string[]>();

      const matchesYear = (s: SearchResult) => {
        const y = (s.year || '').trim();
        if (!targetYear) return true; // no requirement
        if (!y) return true; // keep unknown year
        return y === targetYear;
      };

      const sourcesForMajority = valid.filter(matchesYear);
      const majorityBase = sourcesForMajority.length > 0 ? sourcesForMajority : valid;

      const majority = determineMajorityEpisodeCount(sourcesForMajority);
      majorityEpisodeCountRef.current = majority;

      // 记录不匹配原因（不剔除，只作排序靠后）
      valid.forEach((s) => {
        const reasons: string[] = [];
        if (!matchesYear(s)) {
          reasons.push('年份不符');
        }
        if (majority != null) {
          const len = s.episodes?.length || 0;
          if (Math.abs(len - majority) > 2) {
            reasons.push('集數偏離主流');
          }
        }
        if (currentEpisodeIndexRef.current >= (s.episodes?.length || 0)) {
          reasons.push('當前集數超出範圍');
        }
        if (reasons.length) {
          penalties.set(getValuationKey(s.source), reasons);
        }
      });

      const sorted = sortSourcesByValuation(valid, infoOverride);
      const infoMap =
        infoOverride && infoOverride.size > 0
          ? infoOverride
          : precomputedVideoInfoRef.current;

      const decorate = (s: SearchResult) => {
        const info = infoMap.get(getValuationKey(s.source));
        const reasons = penalties.get(getValuationKey(s.source));
        const base =
          info && info.quality !== undefined
            ? {
                ...s,
                quality: info.quality,
                loadSpeed: info.loadSpeed,
                speedValue: info.speedValue,
                pingTime: info.pingTime,
              }
            : s;
        return reasons && reasons.length
          ? { ...base, verifyReason: reasons.join('；') }
          : base;
      };

      const decorated = sorted.map(decorate);

      // 将有惩罚的排在末尾
      const withPenalty = decorated.filter((s) => s.verifyReason);
      const noPenalty = decorated.filter((s) => !s.verifyReason);
      return [...noPenalty, ...withPenalty];
    },
    [determineMajorityEpisodeCount, sortSourcesByValuation, getValuationKey]
  );

  type SourceValuationPayload = {
    key: string;
    source: string;
    id?: string;
    quality: string;
    loadSpeed: string;
    pingTime: number;
    qualityRank?: number;
    speedValue?: number;
    sampleCount?: number;
    updated_at: number;
  };

  const persistSourceValuations = useCallback(
    async (entries: SourceValuationPayload[]) => {
      if (!entries.length) return;
      try {
        await fetch('/api/source/valuation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valuations: entries }),
        });
      } catch (error) {
        console.warn('Failed to persist source valuations:', error);
      }
    },
    []
  );

  const fetchStoredValuations = useCallback(
    async (sources: SearchResult[]) => {
      if (!sources || sources.length === 0) return;
      const keySet = new Set<string>();
      sources.forEach((source) => {
        keySet.add(getValuationKey(source.source));
      });
      const keys = Array.from(keySet);
      if (keys.length === 0) return;
      try {
        const resp = await fetch(
          `/api/source/valuation?keys=${encodeURIComponent(keys.join(','))}`
        );
        if (!resp.ok) {
          return;
        }
        const payload = await resp.json();
        if (!payload) return;

        const rawItems: SourceValuationPayload[] = Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload)
          ? (payload as SourceValuationPayload[])
          : Object.values(
              (payload.lookup as Record<string, SourceValuationPayload>) ||
                payload ||
                {}
            );

        if (!rawItems.length) return;

        const deduped = new Map<string, SourceValuationPayload>();
        rawItems.forEach((value) => {
          const key = getValuationKey(value.source);
          deduped.set(key, {
            ...value,
            key,
          });
        });

        let updatedInfoMap: Map<string, PrecomputedVideoInfoEntry> | null =
          null;
        setPrecomputedVideoInfo((prev) => {
          const next = new Map(prev);
          deduped.forEach((value, key) => {
            next.set(key, {
              quality: value.quality,
              loadSpeed: value.loadSpeed,
              pingTime: value.pingTime,
              qualityRank:
                value.qualityRank ?? getQualityRank(value.quality),
              speedValue:
                value.speedValue ?? parseSpeedToKBps(value.loadSpeed),
              sampleCount:
                typeof value.sampleCount === 'number'
                  ? value.sampleCount || 1
                  : 1,
              hasError: false,
            });
          });
          updatedInfoMap = next;
          return next;
        });
        if (updatedInfoMap) {
          precomputedVideoInfoRef.current = updatedInfoMap;
          setAvailableSources((prev) => {
            const sorted = verifyAndSortSources(prev, updatedInfoMap!);
            availableSourcesRef.current = sorted;
            return sorted;
          });
        }
      } catch (error) {
        console.warn('Failed to load stored source valuations:', error);
      }
    },
    [getValuationKey, sortSourcesByValuation, verifyAndSortSources]
  );

  useEffect(() => {
    precomputedVideoInfoRef.current = precomputedVideoInfo;
  }, [precomputedVideoInfo]);

  // 折叠状态（仅在 lg 及以上屏幕有效）
  const [isEpisodeSelectorCollapsed, setIsEpisodeSelectorCollapsed] =
    useState(false);

  // 换源加载状态
  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoLoadingStage, setVideoLoadingStage] = useState<
    'initing' | 'sourceChanging'
  >('initing');

  // 播放进度保存相关
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveTimeRef = useRef<number>(0);

  const artPlayerRef = useRef<any>(null);
  const [imdbVideoTitle, setImdbVideoTitle] = useState<string | undefined>(
    undefined
  );
  const [imdbVideoId, setImdbVideoId] = useState<string | undefined>(
    undefined
  );
  const [clientInfo, setClientInfo] = useState<string>('');
  const englishVideoTitle = imdbVideoTitle ?? undefined;
  const displayVideoTitle = useMemo(
    () => convertToTraditional(videoTitle),
    [videoTitle]
  );
  const displayTitleText = displayVideoTitle || '影片標題';
  const displayTitleWithEnglish = englishVideoTitle
    ? `${displayTitleText} (${englishVideoTitle})`
    : displayTitleText;
  const artRef = useRef<HTMLDivElement | null>(null);
  const autoErrorRecoveryRef = useRef(false);

  // -----------------------------------------------------------------------------
  // 工具函数（Utils）
  // -----------------------------------------------------------------------------

  // 播放源优选函数
  const preferBestSource = async (
    sources: SearchResult[]
  ): Promise<SearchResult> => {
    if (sources.length === 1) return sources[0];

    // 将播放源均分为两批，并发测速各批，避免一次性过多请求
    const batchSize = Math.ceil(sources.length / 2);
    const allResults: Array<{
      source: SearchResult;
      testResult: { quality: string; loadSpeed: string; pingTime: number };
    } | null> = [];

    for (let start = 0; start < sources.length; start += batchSize) {
      const batchSources = sources.slice(start, start + batchSize);
      const batchResults = await Promise.all(
        batchSources.map(async (source) => {
          try {
            // 检查是否有第一集的播放地址
            if (!source.episodes || source.episodes.length === 0) {
              console.warn(`播放源 ${source.source_name} 找不到 也不要找爸爸`);
              return null;
            }

            const episodeUrl =
              source.episodes.length > 1
                ? source.episodes[1]
                : source.episodes[0];
            const testResult = await getVideoResolutionFromM3u8(episodeUrl);

            return {
              source,
              testResult,
            };
          } catch (error) {
            return null;
          }
        })
      );
      allResults.push(...batchResults);
    }

    // 等待所有测速完成，包含成功和失败的结果
    // 保存所有测速结果到 precomputedVideoInfo，供 EpisodeSelector 使用（包含错误结果）
    const newVideoInfoMap = new Map<
      string,
      {
        quality: string;
        loadSpeed: string;
        pingTime: number;
        qualityRank?: number;
        speedValue?: number;
        sampleCount?: number;
        hasError?: boolean;
      }
    >();
    allResults.forEach((result, index) => {
      const source = sources[index];
      const sourceKey = getValuationKey(source.source);

      if (result && result.testResult) {
        const { quality, loadSpeed, pingTime } = result.testResult;
        newVideoInfoMap.set(sourceKey, {
          quality,
          loadSpeed,
          pingTime,
          qualityRank: getQualityRank(quality),
          speedValue: parseSpeedToKBps(loadSpeed),
          sampleCount: 1,
        });
      } else {
        newVideoInfoMap.set(sourceKey, {
          quality: '未知',
          loadSpeed: '未知',
          pingTime: 0,
          qualityRank: 0,
          speedValue: 0,
          sampleCount: 0,
          hasError: true,
        });
      }
    });

    // 过滤出成功的结果用于优选计算
    const successfulResults = allResults.filter(Boolean) as Array<{
      source: SearchResult;
      testResult: { quality: string; loadSpeed: string; pingTime: number };
    }>;

    const aggregatedEntries: SourceValuationPayload[] = successfulResults.map(
      (result) => {
        const sourceKey = getValuationKey(result.source.source);
        const measurementRank = getQualityRank(result.testResult.quality);
        const measurementSpeedValue = parseSpeedToKBps(
          result.testResult.loadSpeed
        );
        const measurementPing = Number.isFinite(result.testResult.pingTime)
          ? result.testResult.pingTime
          : 0;

        const previous = precomputedVideoInfoRef.current.get(sourceKey);
        const previousCount = previous?.sampleCount ?? 0;
        const previousRank = previous
          ? previous.qualityRank ?? getQualityRank(previous.quality)
          : 0;
        const previousSpeed = previous
          ? previous.speedValue ?? parseSpeedToKBps(previous.loadSpeed)
          : 0;
        const previousPing = previous?.pingTime ?? 0;

        const hasQuality = measurementRank > 0;
        const hasSpeed = measurementSpeedValue > 0;
        const hasPing = measurementPing > 0;
        const increment = hasQuality || hasSpeed || hasPing ? 1 : 0;
        const combinedCount = previousCount + increment;

        const blendedQualityRank = hasQuality
          ? previousCount > 0
            ? (previousRank * previousCount + measurementRank) /
              (previousCount + 1)
            : measurementRank
          : previousRank;

        const blendedSpeedValue = hasSpeed
          ? previousCount > 0
            ? (previousSpeed * previousCount + measurementSpeedValue) /
              (previousCount + 1)
            : measurementSpeedValue
          : previousSpeed;

        const blendedPingTime = hasPing
          ? previousCount > 0
            ? (previousPing * previousCount + measurementPing) /
              (previousCount + 1)
            : measurementPing
          : previousPing;

        const roundedRank = Math.max(0, Math.round(blendedQualityRank));
        const qualityLabel = getQualityLabelFromRank(
          roundedRank,
          previous?.quality ?? result.testResult.quality
        );
        const formattedSpeed =
          blendedSpeedValue > 0
            ? formatSpeedFromKBps(blendedSpeedValue)
            : previous?.loadSpeed ?? result.testResult.loadSpeed;

        return {
          key: sourceKey,
          source: result.source.source,
          quality: qualityLabel,
          loadSpeed: formattedSpeed,
          pingTime:
            blendedPingTime > 0 || previousCount > 0
              ? Math.round(blendedPingTime)
              : measurementPing,
          qualityRank: roundedRank,
          speedValue: Math.round(blendedSpeedValue),
          sampleCount: Math.max(
            combinedCount,
            increment > 0 ? combinedCount : previousCount
          ),
          updated_at: Date.now(),
        };
      }
    );

    const aggregatedEntryMap = new Map<string, SourceValuationPayload>();
    aggregatedEntries.forEach((entry) => {
      aggregatedEntryMap.set(entry.key, entry);
    });

    aggregatedEntryMap.forEach((entry) => {
      newVideoInfoMap.set(entry.key, {
        quality: entry.quality,
        loadSpeed: entry.loadSpeed,
        pingTime: entry.pingTime,
        qualityRank: entry.qualityRank,
        speedValue: entry.speedValue,
        sampleCount: entry.sampleCount,
        hasError: false,
      });
    });

    const updatedInfoMap = new Map(precomputedVideoInfoRef.current);
    newVideoInfoMap.forEach((value, key) => {
      updatedInfoMap.set(key, value);
    });
    setPrecomputedVideoInfo(updatedInfoMap);
    precomputedVideoInfoRef.current = updatedInfoMap;
    setAvailableSources((prev) => {
      const sorted = verifyAndSortSources(prev, updatedInfoMap);
      availableSourcesRef.current = sorted;
      return sorted;
    });

    const meaningfulAggregatedEntries = Array.from(aggregatedEntryMap.values()).filter(
      (entry) =>
        (entry.qualityRank ?? 0) > 0 ||
        (entry.speedValue ?? 0) > 0 ||
        (entry.pingTime ?? 0) > 0
    );
    if (meaningfulAggregatedEntries.length > 0) {
      void persistSourceValuations(meaningfulAggregatedEntries);
    }

    if (successfulResults.length === 0) {
      console.warn('所有播放源測速都失敗，使用第一個播放源');
      return sources[0];
    }

    // 找出所有有效速度的最大值，用于线性映射
    const validSpeeds = successfulResults
      .map((result) => {
        const speedStr = result.testResult.loadSpeed;
        if (speedStr === '未知' || speedStr === '測量中...') return 0;

        const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
        if (!match) return 0;

        const value = parseFloat(match[1]);
        const unit = match[2];
        return unit === 'MB/s' ? value * 1024 : value; // 统一转换为 KB/s
      })
      .filter((speed) => speed > 0);

    const maxSpeed = validSpeeds.length > 0 ? Math.max(...validSpeeds) : 1024; // 默认1MB/s作为基准

    // 找出所有有效延迟的最小值和最大值，用于线性映射
    const validPings = successfulResults
      .map((result) => result.testResult.pingTime)
      .filter((ping) => ping > 0);

    const minPing = validPings.length > 0 ? Math.min(...validPings) : 50;
    const maxPing = validPings.length > 0 ? Math.max(...validPings) : 1000;

    // 计算每个结果的评分
    const resultsWithScore = successfulResults.map((result) => ({
      ...result,
      score: calculateSourceScore(
        result.testResult,
        maxSpeed,
        minPing,
        maxPing
      ),
    }));

    // 按综合评分排序，选择最佳播放源
    resultsWithScore.sort((a, b) => b.score - a.score);

    console.log('播放源評分排序結果:');
    resultsWithScore.forEach((result, index) => {
      console.log(
        `${index + 1}. ${
          result.source.source_name
        } - 评分: ${result.score.toFixed(2)} (${result.testResult.quality}, ${
          result.testResult.loadSpeed
        }, ${result.testResult.pingTime}ms)`
      );
    });

    return resultsWithScore[0].source;
  };

  const selectBestSourceByValuation = useCallback(
    (sources: SearchResult[]): SearchResult | null => {
      if (!sources || sources.length === 0) return null;

      const enriched = sources.map((source) => {
        const key = getValuationKey(source.source);
        const info = precomputedVideoInfoRef.current.get(key);
        const qualityRank = info?.qualityRank ?? getQualityRank(info?.quality);
        const speedValue =
          info?.speedValue ?? parseSpeedToKBps(info?.loadSpeed);
        const pingTime =
          typeof info?.pingTime === 'number' && info.pingTime > 0
            ? info.pingTime
            : Number.MAX_SAFE_INTEGER;
        const sampleCount = info?.sampleCount ?? 0;
        const hasInfo =
          sampleCount > 0 && (qualityRank > 0 || speedValue > 0);
        return {
          source,
          qualityRank,
          speedValue,
          pingTime,
          hasInfo,
        };
      });

      const candidates = enriched.some((item) => item.hasInfo)
        ? enriched.filter((item) => item.hasInfo)
        : enriched;

      candidates.sort((a, b) => {
        if (b.qualityRank !== a.qualityRank) {
          return b.qualityRank - a.qualityRank;
        }
        if (b.speedValue !== a.speedValue) {
          return b.speedValue - a.speedValue;
        }
        return a.pingTime - b.pingTime;
      });

      return candidates[0]?.source ?? sources[0];
    },
    []
  );

  // 计算播放源综合评分
  const calculateSourceScore = (
    testResult: {
      quality: string;
      loadSpeed: string;
      pingTime: number;
    },
    maxSpeed: number,
    minPing: number,
    maxPing: number
  ): number => {
    let score = 0;

    // 分辨率评分 (40% 权重)
    const qualityScore = (() => {
      switch (testResult.quality) {
        case '4K':
          return 100;
        case '2K':
          return 85;
        case '1080p':
          return 75;
        case '720p':
          return 60;
        case '480p':
          return 40;
        case 'SD':
          return 20;
        default:
          return 0;
      }
    })();
    score += qualityScore * 0.4;

    // 下载速度评分 (40% 权重) - 基于最大速度线性映射
    const speedScore = (() => {
      const speedStr = testResult.loadSpeed;
      if (speedStr === '未知' || speedStr === '測量中...') return 30;

      // 解析速度值
      const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
      if (!match) return 30;

      const value = parseFloat(match[1]);
      const unit = match[2];
      const speedKBps = unit === 'MB/s' ? value * 1024 : value;

      // 基于最大速度线性映射，最高100分
      const speedRatio = speedKBps / maxSpeed;
      return Math.min(100, Math.max(0, speedRatio * 100));
    })();
    score += speedScore * 0.4;

    // 网络延迟评分 (20% 权重) - 基于延迟范围线性映射
    const pingScore = (() => {
      const ping = testResult.pingTime;
      if (ping <= 0) return 0; // 无效延迟给默认分

      // 如果所有延迟都相同，给满分
      if (maxPing === minPing) return 100;

      // 线性映射：最低延迟=100分，最高延迟=0分
      const pingRatio = (maxPing - ping) / (maxPing - minPing);
      return Math.min(100, Math.max(0, pingRatio * 100));
    })();
    score += pingScore * 0.2;

    return Math.round(score * 100) / 100; // 保留两位小数
  };

  // 更新视频地址
  const updateVideoUrl = (
    detailData: SearchResult | null,
    episodeIndex: number
  ) => {
    if (
      !detailData ||
      !detailData.episodes ||
      episodeIndex >= detailData.episodes.length
    ) {
      setVideoUrl('');
      return;
    }
    const newUrl = detailData?.episodes[episodeIndex] || '';
    if (newUrl !== videoUrl) {
      setVideoUrl(newUrl);
    }
  };

  const ensureVideoSource = (video: HTMLVideoElement | null, url: string) => {
    if (!video || !url) return;
    const sources = Array.from(video.getElementsByTagName('source'));
    const existed = sources.some((s) => s.src === url);
    if (!existed) {
      // 移除旧的 source，保持唯一
      sources.forEach((s) => s.remove());
      const sourceEl = document.createElement('source');
      sourceEl.src = url;
      video.appendChild(sourceEl);
    }

    // 始终允许远程播放（AirPlay / Cast）
    video.disableRemotePlayback = false;
    // 如果曾经有禁用属性，移除之
    if (video.hasAttribute('disableRemotePlayback')) {
      video.removeAttribute('disableRemotePlayback');
    }
  };

  // 去廣告相关函数
  function filterAdsFromM3U8(m3u8Content: string): string {
    if (!m3u8Content) return '';

    // 按行分割M3U8内容
    const lines = m3u8Content.split('\n');
    const filteredLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 只过滤#EXT-X-DISCONTINUITY标识
      if (!line.includes('#EXT-X-DISCONTINUITY')) {
        filteredLines.push(line);
      }
    }

    return filteredLines.join('\n');
  }

  class CustomHlsJsLoader extends Hls.DefaultConfig.loader {
    constructor(config: any) {
      super(config);
      const load = this.load.bind(this);
      this.load = function (context: any, config: any, callbacks: any) {
        // 拦截manifest和level请求
        if (
          (context as any).type === 'manifest' ||
          (context as any).type === 'level'
        ) {
          const onSuccess = callbacks.onSuccess;
          callbacks.onSuccess = function (
            response: any,
            stats: any,
            context: any
          ) {
            // 如果是m3u8文件，处理内容以移除广告分段
            if (response.data && typeof response.data === 'string') {
              // 过滤掉广告段 - 实现更精确的广告过滤逻辑
              response.data = filterAdsFromM3U8(response.data);
            }
            return onSuccess(response, stats, context, null);
          };
        }
        // 执行原始load方法
        load(context, config, callbacks);
      };
    }
  }

  // 当集数索引变化时自动更新视频地址
  useEffect(() => {
    updateVideoUrl(detail, currentEpisodeIndex);
  }, [detail, currentEpisodeIndex]);

  // 进入页面时直接获取全部源信息
  useEffect(() => {
    const streamSourcesData = async (query: string) => {
      setSourceSearchLoading(true);
      setSourceSearchError(null);
      failedSourcesRef.current.clear();
      availableSourcesRef.current = [];
      setAvailableSources([]);
      const response = await fetch(
        `/api/search/stream?q=${encodeURIComponent(query.trim())}`
      );

      if (!response.body) {
        setSourceSearchError('搜尋失敗');
        setSourceSearchLoading(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let playbackInitialized = false;
      const allSources: SearchResult[] = [];
      const penaltyEntries: SourceValuationPayload[] = [];

      const initializePlayback = (detailData: SearchResult) => {
        if (playbackInitialized) return;
        playbackInitialized = true;

        setNeedPrefer(false);
        setCurrentSource(detailData.source);
        setCurrentId(detailData.id);
        setVideoYear(detailData.year);
        setVideoTitle(detailData.title || videoTitleRef.current);
        setVideoCover(detailData.poster);
        setDetail(detailData);
        if (currentEpisodeIndex >= detailData.episodes.length) {
          setCurrentEpisodeIndex(0);
        }

        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('source', detailData.source);
        newUrl.searchParams.set('id', detailData.id);
        newUrl.searchParams.set('year', detailData.year);
        newUrl.searchParams.set('title', detailData.title);
        newUrl.searchParams.delete('prefer');
        window.history.replaceState({}, '', newUrl.toString());

        setLoadingStage('ready');
        setLoadingMessage('✨ 準備就緒，即將開始播放...');

        setTimeout(() => {
          setLoading(false);
        }, 1000);
      };

      let keepReading = true;
      while (keepReading) {
        const { done, value } = await reader.read();
        if (done) {
          keepReading = false;
          break;
        }

        const chunk = decoder.decode(value).trim();
        if (!chunk) {
          continue;
        }

        const payloads = chunk
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean);

        const parsedSources: SearchResult[] = [];
        for (const payload of payloads) {
          try {
            const entries = JSON.parse(payload);
            if (Array.isArray(entries)) {
              parsedSources.push(...entries);
            } else if (entries && typeof entries === 'object') {
              if (entries.__meta) {
                setSearchStats({
                  total: entries.searched ?? 0,
                  found: entries.found ?? 0,
                  notFound: entries.notFound ?? 0,
                  empty: entries.empty ?? 0,
                  failed: entries.failed ?? 0,
                });
                continue;
              }
              parsedSources.push(entries as SearchResult);
            }
          } catch (error) {
            console.warn('Failed to parse stream chunk:', error);
          }
        }

        if (!parsedSources.length) {
          continue;
        }
        const newSources: SearchResult[] = parsedSources;
        allSources.push(...newSources);

        setAvailableSources((prev) => {
          const merged = [...prev, ...newSources];
          const sorted = verifyAndSortSources(merged);
          availableSourcesRef.current = sorted;
          return sorted;
        });

        // 首個可用來源就立刻開播，但若已有年份要求，必須匹配年份
        if (!playbackInitialized && availableSourcesRef.current.length > 0) {
          const requiredYear = (videoYearRef.current || '').trim();
          const candidates =
            requiredYear.length > 0
              ? availableSourcesRef.current.filter(
                  (s) => (s.year || '').trim() === requiredYear
                )
              : availableSourcesRef.current;

          if (candidates.length > 0) {
            const bestInitial =
              selectBestSourceByValuation(candidates) || candidates[0];
            initializePlayback(bestInitial);
          }
        }

        newSources.forEach((source) => {
          if (!source.episodes || source.episodes.length === 0) {
            const key = getValuationKey(source.source);
            penaltyEntries.push({
              key,
              source: source.source,
              quality: '未知',
              loadSpeed: '未知',
              pingTime: Number.MAX_SAFE_INTEGER,
              qualityRank: -1,
              speedValue: 0,
              sampleCount: 1,
              updated_at: Date.now(),
            });
          }
        });

        if (penaltyEntries.length) {
          let updatedInfoMap: Map<string, PrecomputedVideoInfoEntry> | null =
            null;
          setPrecomputedVideoInfo((prev) => {
            const next = new Map(prev);
            penaltyEntries.forEach((entry) => {
              next.set(entry.key, {
                quality: entry.quality,
                loadSpeed: entry.loadSpeed,
                pingTime: entry.pingTime,
                qualityRank: entry.qualityRank,
                speedValue: entry.speedValue,
                sampleCount: entry.sampleCount,
                hasError: true,
              });
            });
            updatedInfoMap = next;
            return next;
          });
          penaltyEntries.length = 0;
          if (updatedInfoMap) {
            precomputedVideoInfoRef.current = updatedInfoMap;
            setAvailableSources((prev) => {
              const sorted = verifyAndSortSources(prev, updatedInfoMap!);
              availableSourcesRef.current = sorted;
              return sorted;
            });
          }
        }
      }

      setSourceSearchLoading(false);
      fetchStoredValuations(allSources);
      // 确保搜索完成后使用最终排序结果
      setAvailableSources(() => {
        const finalSorted = verifyAndSortSources(allSources);
        availableSourcesRef.current = finalSorted;
        return finalSorted;
      });

      // 记录已搜索的提供者数量（按源标识去重）
      const uniqueProviders = new Set(
        allSources.map((s) => (s.source_name || s.source || '').toString())
      );
      setProviderCount(uniqueProviders.size);

      if (!playbackInitialized) {
        if (allSources.length > 0) {
          const bestInitial =
            selectBestSourceByValuation(allSources) ?? allSources[0];
          initializePlayback(bestInitial);
        } else {
          setLoadingStage('searching');
          setLoadingMessage('未找到可用的播放來源');
          setError('未找到可用的播放來源');
          setLoading(false);
        }
      }

      if (allSources.length > 1) {
        const bestSource = await preferBestSource(allSources);
        if (
          optimizationEnabled &&
          !hasStartedRef.current &&
          (bestSource.source !== currentSourceRef.current ||
            bestSource.id !== currentIdRef.current)
        ) {
          handleSourceChange(
            bestSource.source,
            bestSource.id,
            bestSource.title
          );
        }
      }
    };

    const initAll = () => {
      if (!currentSource && !currentId && !videoTitle && !searchTitle) {
        setError('缺少必要參數');
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadingStage(currentSource && currentId ? 'fetching' : 'searching');
      setLoadingMessage(
        currentSource && currentId
          ? '🎬 Getting video info.....'
          : '🔍 Serching Player resources...'
      );

      streamSourcesData(searchTitle || videoTitle);
    };

    initAll();
  }, []);

  // 播放记录处理
  useEffect(() => {
    // 仅在初次挂载时检查播放记录
    const initFromHistory = async () => {
      if (!currentSource || !currentId) return;

      try {
        const allRecords = await getAllPlayRecords();
        const key = generateStorageKey(currentSource, currentId);
        const record = allRecords[key];

        if (record) {
          const targetIndex = record.index - 1;
          const targetTime = record.play_time;

          // 更新当前选集索引
          if (targetIndex !== currentEpisodeIndex) {
            setCurrentEpisodeIndex(targetIndex);
          }

          // 保存待恢复的播放进度，待播放器就绪后跳转
          resumeTimeRef.current = targetTime;
        }
      } catch (err) {
        console.error('讀取播放紀錄失敗:', err);
      }
    };

    initFromHistory();
  }, []);

  // 处理换源
  const handleSourceChange = async (
    newSource: string,
    newId: string,
    newTitle: string
  ) => {
    try {
      // 顯示换源加载状态
      setVideoLoadingStage('sourceChanging');
      setIsVideoLoading(true);
      hasStartedRef.current = false;

      // 记录当前播放进度（仅在同一集数切换时恢复）
      const currentPlayTime = artPlayerRef.current?.currentTime || 0;
      console.log('換源前當前播放時間:', currentPlayTime);

      // 清除前一个历史记录
      if (currentSourceRef.current && currentIdRef.current) {
        try {
          await deletePlayRecord(
            currentSourceRef.current,
            currentIdRef.current
          );
          console.log('已清除前一個播放紀錄');
        } catch (err) {
          console.error('清除播放紀錄失敗:', err);
        }
      }

      const newDetail = availableSources.find(
        (source) => source.source === newSource && source.id === newId
      );
      if (!newDetail) {
        setError('未找到匹配結果');
        return;
      }

      failedSourcesRef.current.delete(getValuationKey(newSource));

      // 尝试跳转到当前正在播放的集数
      let targetIndex = currentEpisodeIndex;

      // 如果当前集数超出新源的范围，则跳转到第一集
      if (!newDetail.episodes || targetIndex >= newDetail.episodes.length) {
        targetIndex = 0;
      }

      // 如果仍然是同一集数且播放进度有效，则在播放器就绪后恢复到原始进度
      if (targetIndex !== currentEpisodeIndex) {
        resumeTimeRef.current = 0;
      } else if (
        (!resumeTimeRef.current || resumeTimeRef.current === 0) &&
        currentPlayTime > 1
      ) {
        resumeTimeRef.current = currentPlayTime;
      }

      // 更新URL参数（不刷新页面）
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('source', newSource);
      newUrl.searchParams.set('id', newId);
      newUrl.searchParams.set('year', newDetail.year);
      window.history.replaceState({}, '', newUrl.toString());

      setVideoTitle(newDetail.title || newTitle);
      setVideoYear(newDetail.year);
      setVideoCover(newDetail.poster);
      setCurrentSource(newSource);
      setCurrentId(newId);
      setDetail(newDetail);
      setCurrentEpisodeIndex(targetIndex);
    } catch (err) {
      // 隱藏换源加载状态
      setIsVideoLoading(false);
      setError(err instanceof Error ? err.message : '換源失敗');
    }
  };

  const trySwitchToNextSource = useCallback((): boolean => {
    const currentKey = currentSourceRef.current
      ? getValuationKey(currentSourceRef.current)
      : null;

    if (currentKey) {
      failedSourcesRef.current.add(currentKey);
    }

    const nextSource = availableSourcesRef.current.find((source) => {
      if (!source.episodes || source.episodes.length === 0) return false;
      if (
        source.source === currentSourceRef.current &&
        source.id === currentIdRef.current
      ) {
        return false;
      }
      const key = getValuationKey(source.source);
      if (failedSourcesRef.current.has(key)) return false;
      return currentEpisodeIndexRef.current < source.episodes.length;
    });

    if (nextSource) {
      setError('當前播放來源不可用，自動切換其他來源…');
      handleSourceChange(nextSource.source, nextSource.id, nextSource.title);
      return true;
    }

    setError('當前播放來源不可用，請手動選擇其他來源');
    return false;
  }, [getValuationKey, handleSourceChange]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardShortcuts);
    return () => {
      document.removeEventListener('keydown', handleKeyboardShortcuts);
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const ua = navigator.userAgent.toLowerCase();

    const os = (() => {
      if (/windows nt/.test(ua)) return 'Windows';
      if (/mac os x/.test(ua)) return 'macOS';
      if (/android/.test(ua)) return 'Android';
      if (/(iphone|ipad|ipod)/.test(ua)) return 'iOS';
      if (/linux/.test(ua)) return 'Linux';
      return 'Unknown OS';
    })();

    const browser = (() => {
      if (/edg\//.test(ua)) return 'Edge';
      if (/chrome\//.test(ua) && !/edg\//.test(ua)) return 'Chrome';
      if (/firefox\//.test(ua)) return 'Firefox';
      if (/safari\//.test(ua) && !/chrome\//.test(ua)) return 'Safari';
      return 'Unknown Browser';
    })();

    setClientInfo(`${browser} • ${os}`);
  }, []);

  // 自动错误恢复：出现错误时尝试切换下一可用源
  useEffect(() => {
    if (error && !autoErrorRecoveryRef.current) {
      autoErrorRecoveryRef.current = true;
      const switched = trySwitchToNextSource();
      if (switched) {
        setError(null);
        setLoading(true);
      }
    }
    if (!error) {
      autoErrorRecoveryRef.current = false;
    }
  }, [error, trySwitchToNextSource]);

  // ---------------------------------------------------------------------------
  // 集数切换
  // ---------------------------------------------------------------------------
  // 处理集数切换
  const handleEpisodeChange = (episodeNumber: number) => {
    if (episodeNumber >= 0 && episodeNumber < totalEpisodes) {
      // 在更换集数前保存当前播放进度
      if (artPlayerRef.current && artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      setCurrentEpisodeIndex(episodeNumber);
    }
  };

  const handlePreviousEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (d && d.episodes && idx > 0) {
      if (artPlayerRef.current && !artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      setCurrentEpisodeIndex(idx - 1);
    }
  };

  const handleNextEpisode = () => {
    const d = detailRef.current;
    const idx = currentEpisodeIndexRef.current;
    if (d && d.episodes && idx < d.episodes.length - 1) {
      if (artPlayerRef.current && !artPlayerRef.current.paused) {
        saveCurrentPlayProgress();
      }
      setCurrentEpisodeIndex(idx + 1);
    }
  };

  // ---------------------------------------------------------------------------
  // 键盘快捷键
  // ---------------------------------------------------------------------------
  // 处理全局快捷键
  const handleKeyboardShortcuts = (e: KeyboardEvent) => {
    // 忽略输入框中的按键事件
    if (
      (e.target as HTMLElement).tagName === 'INPUT' ||
      (e.target as HTMLElement).tagName === 'TEXTAREA'
    )
      return;

    // Alt + 左箭头 = 上一集
    if (e.altKey && e.key === 'ArrowLeft') {
      if (detailRef.current && currentEpisodeIndexRef.current > 0) {
        handlePreviousEpisode();
        e.preventDefault();
      }
    }

    // Alt + 右箭头 = 下一集
    if (e.altKey && e.key === 'ArrowRight') {
      const d = detailRef.current;
      const idx = currentEpisodeIndexRef.current;
      if (d && idx < d.episodes.length - 1) {
        handleNextEpisode();
        e.preventDefault();
      }
    }

    // 左箭头 = 快退
    if (!e.altKey && e.key === 'ArrowLeft') {
      if (artPlayerRef.current && artPlayerRef.current.currentTime > 5) {
        artPlayerRef.current.currentTime -= 10;
        e.preventDefault();
      }
    }

    // 右箭头 = 快进
    if (!e.altKey && e.key === 'ArrowRight') {
      if (
        artPlayerRef.current &&
        artPlayerRef.current.currentTime < artPlayerRef.current.duration - 5
      ) {
        artPlayerRef.current.currentTime += 10;
        e.preventDefault();
      }
    }

    // 上箭头 = 音量+
    if (e.key === 'ArrowUp') {
      if (artPlayerRef.current && artPlayerRef.current.volume < 1) {
        artPlayerRef.current.volume =
          Math.round((artPlayerRef.current.volume + 0.1) * 10) / 10;
        artPlayerRef.current.notice.show = `音量: ${Math.round(
          artPlayerRef.current.volume * 100
        )}`;
        e.preventDefault();
      }
    }

    // 下箭头 = 音量-
    if (e.key === 'ArrowDown') {
      if (artPlayerRef.current && artPlayerRef.current.volume > 0) {
        artPlayerRef.current.volume =
          Math.round((artPlayerRef.current.volume - 0.1) * 10) / 10;
        artPlayerRef.current.notice.show = `音量: ${Math.round(
          artPlayerRef.current.volume * 100
        )}`;
        e.preventDefault();
      }
    }

    // 空格 = 播放/暂停
    if (e.key === ' ') {
      if (artPlayerRef.current) {
        artPlayerRef.current.toggle();
        e.preventDefault();
      }
    }

    // f 键 = 切换全屏
    if (e.key === 'f' || e.key === 'F') {
      if (artPlayerRef.current) {
        artPlayerRef.current.fullscreen = !artPlayerRef.current.fullscreen;
        e.preventDefault();
      }
    }
  };

  // ---------------------------------------------------------------------------
  // 播放记录相关
  // ---------------------------------------------------------------------------
  // 保存播放进度
  const saveCurrentPlayProgress = async () => {
    if (
      !artPlayerRef.current ||
      !currentSourceRef.current ||
      !currentIdRef.current ||
      !videoTitleRef.current ||
      !detailRef.current?.source_name
    ) {
      return;
    }

    const player = artPlayerRef.current;
    const currentTime = player.currentTime || 0;
    const duration = player.duration || 0;

    // 如果播放时间太短（少于5秒）或者视频时长无效，不保存
    if (currentTime < 1 || !duration) {
      return;
    }

    try {
      await savePlayRecord(currentSourceRef.current, currentIdRef.current, {
        title: videoTitleRef.current,
        source_name: detailRef.current?.source_name || '',
        year: detailRef.current?.year,
        cover: detailRef.current?.poster || '',
        index: currentEpisodeIndexRef.current + 1, // 转换为1基索引
        total_episodes:
          majorityEpisodeCountRef.current ??
          detailRef.current?.episodes.length ??
          1,
        play_time: Math.floor(currentTime),
        total_time: Math.floor(duration),
        save_time: Date.now(),
          imdbId: imdbVideoId,
          imdbTitle: imdbVideoTitle,
          douban_id: detailRef.current?.douban_id,
        search_title: searchTitle,
      });

      lastSaveTimeRef.current = Date.now();
      console.log('播放進度已保存:', {
        title: videoTitleRef.current,
        episode: currentEpisodeIndexRef.current + 1,
        year: detailRef.current?.year,
        progress: `${Math.floor(currentTime)}/${Math.floor(duration)}`,
      });
    } catch (err) {
      console.error('保存播放進度失敗:', err);
    }
  };

  useEffect(() => {
    // 页面即将卸载时保存播放进度
    const handleBeforeUnload = () => {
      saveCurrentPlayProgress();
    };

    // 页面可见性变化时保存播放进度
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentPlayProgress();
      }
    };

    // 添加事件监听器
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      // 清理事件监听器
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentEpisodeIndex, detail, artPlayerRef.current]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // 收藏相关
  // ---------------------------------------------------------------------------
  // 每当 source 或 id 变化时检查收藏状态
  useEffect(() => {
    if (!currentSource || !currentId) return;
    (async () => {
      try {
        const fav = await isFavorited(currentSource, currentId);
        setFavorited(fav);
      } catch (err) {
        console.error('檢查收藏狀態失敗:', err);
      }
    })();
  }, [currentSource, currentId]);

  // 监听收藏数据更新事件
  useEffect(() => {
    if (!currentSource || !currentId) return;

    const unsubscribe = subscribeToDataUpdates(
      'favoritesUpdated',
      (favorites: Record<string, any>) => {
        const key = generateStorageKey(currentSource, currentId);
        const isFav = !!favorites[key];
        setFavorited(isFav);
      }
    );

    return unsubscribe;
  }, [currentSource, currentId]);

  // 切换收藏
  const handleToggleFavorite = async () => {
    if (
      !videoTitleRef.current ||
      !detailRef.current ||
      !currentSourceRef.current ||
      !currentIdRef.current
    )
      return;

    try {
      if (favorited) {
        // 如果已收藏，删除收藏
        await deleteFavorite(currentSourceRef.current, currentIdRef.current);
        setFavorited(false);
      } else {
        // 如果未收藏，添加收藏
        await saveFavorite(currentSourceRef.current, currentIdRef.current, {
          title: videoTitleRef.current,
          source_name: detailRef.current?.source_name || '',
          year: detailRef.current?.year,
          cover: detailRef.current?.poster || '',
          total_episodes:
            majorityEpisodeCountRef.current ??
            detailRef.current?.episodes.length ??
            1,
          save_time: Date.now(),
          search_title: searchTitle,
        });
        setFavorited(true);
      }
    } catch (err) {
      console.error('切換收藏失敗:', err);
    }
  };

  useEffect(() => {
    if (
      !Artplayer ||
      !Hls ||
      !videoUrl ||
      loading ||
      currentEpisodeIndex === null ||
      !artRef.current
    ) {
      return;
    }

    // 确保选集索引有效
    if (
      !detail ||
      !detail.episodes ||
      currentEpisodeIndex >= detail.episodes.length ||
      currentEpisodeIndex < 0
    ) {
      setError(`選集索引無效，目前共 ${totalEpisodes} 集`);
      return;
    }

    if (!videoUrl) {
      setError('影片地址無效');
      return;
    }
    console.log(videoUrl);

    // 检测是否为WebKit浏览器
    const isWebkit =
      typeof window !== 'undefined' &&
      typeof (window as any).webkitConvertPointFromNodeToPage === 'function';

    // 非WebKit浏览器且播放器已存在，使用switch方法切换
    if (!isWebkit && artPlayerRef.current) {
      artPlayerRef.current.switch = videoUrl;
      artPlayerRef.current.title = `${displayTitleWithEnglish} - 第${
        currentEpisodeIndex + 1
      }集`;
      artPlayerRef.current.poster = videoCover;
      if (artPlayerRef.current?.video) {
        ensureVideoSource(
          artPlayerRef.current.video as HTMLVideoElement,
          videoUrl
        );
      }
      return;
    }

    // WebKit浏览器或首次创建：销毁之前的播放器实例并创建新的
    if (artPlayerRef.current) {
      if (artPlayerRef.current.video && artPlayerRef.current.video.hls) {
        artPlayerRef.current.video.hls.destroy();
      }
      // 销毁播放器实例
      artPlayerRef.current.destroy();
      artPlayerRef.current = null;
    }

    try {
      // 创建新的播放器实例
      Artplayer.PLAYBACK_RATE = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
      Artplayer.USE_RAF = true;

      artPlayerRef.current = new Artplayer({
        container: artRef.current,
        url: videoUrl,
        poster: videoCover,
        volume: 0.7,
        isLive: false,
        muted: false,
        autoplay: true,
        pip: true,
        autoSize: false,
        autoMini: false,
        screenshot: false,
        setting: true,
        loop: false,
        flip: false,
        playbackRate: true,
        aspectRatio: false,
        fullscreen: true,
        fullscreenWeb: true,
        subtitleOffset: false,
        miniProgressBar: false,
        mutex: true,
        playsInline: true,
        autoPlayback: false,
        airplay: true,
        theme: '#22c55e',
        lang: 'zh-cn',
        hotkey: false,
        fastForward: true,
        autoOrientation: true,
        lock: true,
        moreVideoAttr: {
          crossOrigin: 'anonymous',
        },
        // HLS 支持配置
        customType: {
          m3u8: function (video: HTMLVideoElement, url: string) {
            if (!Hls) {
              console.error('HLS.js 未載入');
              return;
            }

            if (video.hls) {
              video.hls.destroy();
            }
            const hls = new Hls({
              debug: false, // 关闭日志
              enableWorker: true, // WebWorker 解码，降低主线程压力
              lowLatencyMode: true, // 开启低延迟 LL-HLS

              /* 缓冲/内存相关 */
              maxBufferLength: 30, // 前向缓冲最大 30s，过大容易导致高延迟
              backBufferLength: 30, // 仅保留 30s 已播放内容，避免内存占用
              maxBufferSize: 60 * 1000 * 1000, // 约 60MB，超出后触发清理

              /* 自定义loader */
              loader: blockAdEnabledRef.current
                ? CustomHlsJsLoader
                : Hls.DefaultConfig.loader,
            });

            hls.loadSource(url);
            hls.attachMedia(video);
            video.hls = hls;

            ensureVideoSource(video, url);

            hls.on(Hls.Events.ERROR, function (event: any, data: any) {
              console.error('HLS Error:', event, data);
              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    console.log('網路錯誤，嘗試恢復...');
                    hls.startLoad();
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    console.log('媒體錯誤，嘗試恢復...');
                    hls.recoverMediaError();
                    break;
                  default:
                    console.log('無法恢復的錯誤');
                    hls.destroy();
                    break;
                }
              }
            });
          },
        },
        icons: {
          loading:
            '<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI1MCIgaGVpZ2h0PSI1MCIgdmlld0JveD0iMCAwIDUwIDUwIj48cGF0aCBkPSJNMjUuMjUxIDYuNDYxYy0xMC4zMTggMC0xOC42ODMgOC4zNjUtMTguNjgzIDE4LjY4M2g0LjA2OGMwLTguMDcgNi41NDUtMTQuNjE1IDE0LjYxNS0xNC42MTVWNi40NjF6IiBmaWxsPSIjMDA5Njg4Ij48YW5pbWF0ZVRyYW5zZm9ybSBhdHRyaWJ1dGVOYW1lPSJ0cmFuc2Zvcm0iIGF0dHJpYnV0ZVR5cGU9IlhNTCIgZHVyPSIxcyIgZnJvbT0iMCAyNSAyNSIgcmVwZWF0Q291bnQ9ImluZGVmaW5pdGUiIHRvPSIzNjAgMjUgMjUiIHR5cGU9InJvdGF0ZSIvPjwvcGF0aD48L3N2Zz4=">',
        },
        settings: [
          {
            html: '去廣告',
            icon: '<text x="50%" y="50%" font-size="20" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">AD</text>',
            tooltip: blockAdEnabled ? '已開啟' : '已關閉',
            onClick() {
              const newVal = !blockAdEnabled;
              try {
                localStorage.setItem('enable_blockad', String(newVal));
                if (artPlayerRef.current) {
                  resumeTimeRef.current = artPlayerRef.current.currentTime;
                  if (
                    artPlayerRef.current.video &&
                    artPlayerRef.current.video.hls
                  ) {
                    artPlayerRef.current.video.hls.destroy();
                  }
                  artPlayerRef.current.destroy();
                  artPlayerRef.current = null;
                }
                setBlockAdEnabled(newVal);
              } catch (_) {
                // ignore
              }
              return newVal ? '當前開啟' : '當前關閉';
            },
          },
        ],
        // 控制栏配置
        controls: [
          {
            position: 'left',
            index: 13,
            html: '<i class="art-icon flex"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/></svg></i>',
            tooltip: '播放下一集',
            click: function () {
              handleNextEpisode();
            },
          },
        ],
      });
      artPlayerRef.current.title = `${displayTitleWithEnglish} - 第${
        currentEpisodeIndex + 1
      }集`;

      // 监听播放器事件
      artPlayerRef.current.on('ready', () => {
        setError(null);
      });

      artPlayerRef.current.on('video:volumechange', () => {
        lastVolumeRef.current = artPlayerRef.current.volume;
      });

      // 监听视频可播放事件，这时恢复播放进度更可靠
      artPlayerRef.current.on('video:canplay', () => {
        hasStartedRef.current = true;
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
        // 若存在需要恢复的播放进度，则跳转
        if (resumeTimeRef.current && resumeTimeRef.current > 0) {
          try {
            const duration = artPlayerRef.current.duration || 0;
            let target = resumeTimeRef.current;
            if (duration && target >= duration - 2) {
              target = Math.max(0, duration - 5);
            }
            artPlayerRef.current.currentTime = target;
            console.log('成功恢復播放進度到:', resumeTimeRef.current);
          } catch (err) {
            console.warn('恢復播放進度失敗:', err);
          }
        }
        resumeTimeRef.current = null;

        setTimeout(() => {
          if (
            Math.abs(artPlayerRef.current.volume - lastVolumeRef.current) > 0.01
          ) {
            artPlayerRef.current.volume = lastVolumeRef.current;
          }
          artPlayerRef.current.notice.show = '';
        }, 0);

        // 隐藏换源加载状态
        setIsVideoLoading(false);
      });

      artPlayerRef.current.on('error', (err: any) => {
        console.error('播放器錯誤:', err);
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
        if (artPlayerRef.current.currentTime > 0) {
          return;
        }
        const switched = trySwitchToNextSource();
        if (!switched) {
          setIsVideoLoading(false);
        }
      });

      // 监听视频播放结束事件，自动播放下一集
      artPlayerRef.current.on('video:ended', () => {
        const d = detailRef.current;
        const idx = currentEpisodeIndexRef.current;
        if (d && d.episodes && idx < d.episodes.length - 1) {
          setTimeout(() => {
            setCurrentEpisodeIndex(idx + 1);
          }, 1000);
        }
      });

      artPlayerRef.current.on('video:timeupdate', () => {
        const now = Date.now();
        if (
          now - lastSaveTimeRef.current >
          (process.env.NEXT_PUBLIC_STORAGE_TYPE === 'd1' ? 10000 : 5000)
        ) {
          saveCurrentPlayProgress();
          lastSaveTimeRef.current = now;
        }
      });

      artPlayerRef.current.on('pause', () => {
        saveCurrentPlayProgress();
      });

      if (artPlayerRef.current?.video) {
        ensureVideoSource(
          artPlayerRef.current.video as HTMLVideoElement,
          videoUrl
        );
      }

      // Fallback timeout: if the video doesn't become playable in 6s, switch source
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
      loadTimeoutRef.current = setTimeout(() => {
        if (
          artPlayerRef.current &&
          Math.max(artPlayerRef.current.currentTime || 0, 0) <= 0
        ) {
          setError(t('timeoutSwitch'));
          const switched = trySwitchToNextSource();
          if (!switched) {
            setIsVideoLoading(false);
          }
        }
      }, 6000);
    } catch (err) {
      console.error('建立播放器失敗:', err);
      setError('播放器初始化失敗');
    }
  }, [Artplayer, Hls, videoUrl, loading, blockAdEnabled, trySwitchToNextSource]);

  useEffect(() => {
    if (!artPlayerRef.current) {
      return;
    }
    artPlayerRef.current.title = `${displayTitleWithEnglish} - 第${
      currentEpisodeIndex + 1
    }集`;
  }, [displayTitleWithEnglish, currentEpisodeIndex]);

  // 当组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  if (loading) {
    return (
      <PageLayout activePath='/play'>
        <div className='flex items-center justify-center min-h-screen bg-transparent'>
          <div className='text-center max-w-md mx-auto px-6'>
            {/* 动画影院图标 */}
            <div className='relative mb-8'>
              <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                <div className='text-white text-4xl'>
                  {loadingStage === 'searching' && '🔍'}
                  {loadingStage === 'preferring' && '⚡'}
                  {loadingStage === 'fetching' && '🎬'}
                  {loadingStage === 'ready' && '✨'}
                </div>
                {/* 旋转光环 */}
                <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
              </div>

              {/* 浮动粒子效果 */}
              <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                <div className='absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full animate-bounce'></div>
                <div
                  className='absolute top-4 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce'
                  style={{ animationDelay: '0.5s' }}
                ></div>
                <div
                  className='absolute bottom-3 left-6 w-1 h-1 bg-lime-400 rounded-full animate-bounce'
                  style={{ animationDelay: '1s' }}
                ></div>
              </div>
            </div>

            {/* 进度指示器 */}
            <div className='mb-6 w-80 mx-auto'>
              <div className='flex justify-center space-x-2 mb-4'>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${
                    loadingStage === 'searching' || loadingStage === 'fetching'
                      ? 'bg-green-500 scale-125'
                      : loadingStage === 'preferring' ||
                        loadingStage === 'ready'
                      ? 'bg-green-500'
                      : 'bg-gray-300'
                  }`}
                ></div>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${
                    loadingStage === 'preferring'
                      ? 'bg-green-500 scale-125'
                      : loadingStage === 'ready'
                      ? 'bg-green-500'
                      : 'bg-gray-300'
                  }`}
                ></div>
                <div
                  className={`w-3 h-3 rounded-full transition-all duration-500 ${
                    loadingStage === 'ready'
                      ? 'bg-green-500 scale-125'
                      : 'bg-gray-300'
                  }`}
                ></div>
              </div>

              {/* 进度条 */}
              <div className='w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden'>
                <div
                  className='h-full bg-gradient-to-r from-green-500 to-emerald-600 rounded-full transition-all duration-1000 ease-out'
                  style={{
                    width:
                      loadingStage === 'searching' ||
                      loadingStage === 'fetching'
                        ? '33%'
                        : loadingStage === 'preferring'
                        ? '66%'
                        : '100%',
                  }}
                ></div>
              </div>
            </div>

            {/* 加载消息 */}
            <div className='space-y-2'>
              <p className='text-xl font-semibold text-gray-800 dark:text-gray-200 animate-pulse'>
                {loadingMessage}
              </p>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return (
      <PageLayout activePath='/play'>
        <div className='flex items-center justify-center min-h-screen bg-transparent'>
          <div className='text-center max-w-md mx-auto px-6'>
            {/* 错误图标 */}
            <div className='relative mb-8'>
              <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                <div className='text-white text-4xl'>😵</div>
                {/* 脉冲效果 */}
                <div className='absolute -inset-2 bg-gradient-to-r from-red-500 to-orange-500 rounded-2xl opacity-20 animate-pulse'></div>
              </div>

              {/* 浮动错误粒子 */}
              <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                <div className='absolute top-2 left-2 w-2 h-2 bg-red-400 rounded-full animate-bounce'></div>
                <div
                  className='absolute top-4 right-4 w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce'
                  style={{ animationDelay: '0.5s' }}
                ></div>
                <div
                  className='absolute bottom-3 left-6 w-1 h-1 bg-yellow-400 rounded-full animate-bounce'
                  style={{ animationDelay: '1s' }}
                ></div>
              </div>
            </div>

            {/* 错误信息 */}
            <div className='space-y-4 mb-8'>
              <h2 className='text-2xl font-bold text-gray-800 dark:text-gray-200'>
                哎呀，出現了一些問題
              </h2>
              <div className='bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4'>
                <p className='text-red-600 dark:text-red-400 font-medium'>
                  {error}
                </p>
              </div>
              <p className='text-sm text-gray-500 dark:text-gray-400'>
                請檢查網路連線或嘗試重新整理頁面
              </p>
            </div>

            {/* 操作按钮 */}
            <div className='space-y-3'>
              <button
                onClick={() =>
                  videoTitle
                    ? router.push(`/search?q=${encodeURIComponent(videoTitle)}`)
                    : router.back()
                }
                className='w-full px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-medium hover:from-green-600 hover:to-emerald-700 transform hover:scale-105 transition-all duration-200 shadow-lg hover:shadow-xl'
              >
                {videoTitle ? '🔍 返回搜尋' : '← 返回上頁'}
              </button>

              <button
                onClick={() => window.location.reload()}
                className='w-full px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors duration-200'
              >
                🔄 重新尝试
              </button>
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout activePath='/play'>
      <div className='flex flex-col gap-3 py-4 px-5 lg:px-[3rem] 2xl:px-20'>
        {/* 第一行：影片標題 */}
        <div className='py-1'>
          <h1 className='text-xl font-semibold text-gray-900 dark:text-gray-100'>
            {displayTitleText}
            {englishVideoTitle && (
              <span className='ml-2 text-base text-gray-500 dark:text-gray-400 font-normal'>
                ({englishVideoTitle})
              </span>
            )}
            {totalEpisodes > 1 && (
              <span className='text-gray-500 dark:text-gray-400'>
                {` > 第 ${currentEpisodeIndex + 1} 集`}
              </span>
            )}
          </h1>
        </div>
        {/* 第二行：播放器和选集 */}
        <div className='space-y-2'>
          {/* 折叠控制 - 仅在 lg 及以上屏幕顯示 */}
          <div className='hidden lg:flex justify-end'>
            <button
              onClick={() =>
                setIsEpisodeSelectorCollapsed(!isEpisodeSelectorCollapsed)
              }
              className='group relative flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/80 hover:bg-white dark:bg-gray-800/80 dark:hover:bg-gray-800 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-sm hover:shadow-md transition-all duration-200'
              title={
                isEpisodeSelectorCollapsed ? '顯示選集面板' : '隱藏選集面板'
              }
            >
              <svg
                className={`w-3.5 h-3.5 text-gray-500 dark:text-gray-400 transition-transform duration-200 ${
                  isEpisodeSelectorCollapsed ? 'rotate-180' : 'rotate-0'
                }`}
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2'
                  d='M9 5l7 7-7 7'
                />
              </svg>
              <span className='text-xs font-medium text-gray-600 dark:text-gray-300'>
                {isEpisodeSelectorCollapsed ? '顯示' : '隱藏'}
              </span>

              {/* 精致的状态指示点 */}
              <div
                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full transition-all duration-200 ${
                  isEpisodeSelectorCollapsed
                    ? 'bg-orange-400 animate-pulse'
                    : 'bg-green-400'
                }`}
              ></div>
            </button>
          </div>

          <div
            className={`grid gap-4 lg:h-[500px] xl:h-[650px] 2xl:h-[750px] transition-all duration-300 ease-in-out ${
              isEpisodeSelectorCollapsed
                ? 'grid-cols-1'
                : 'grid-cols-1 md:grid-cols-4'
            }`}
          >
            {/* 播放器 */}
            <div
            className={`h-full transition-all duration-300 ease-in-out rounded-xl border border-white/0 dark:border-white/30 ${
              isEpisodeSelectorCollapsed ? 'col-span-1' : 'md:col-span-3'
            }`}
          >
            <div className='relative w-full h-[300px] lg:h-full'>
              {clientInfo && (
                <div className='absolute top-2 left-2 z-[501] px-3 py-1 rounded-full bg-white/80 dark:bg-gray-800/80 text-xs font-medium text-gray-700 dark:text-gray-200 shadow-sm border border-gray-200/80 dark:border-gray-700/60 backdrop-blur'>
                  {clientInfo}
                </div>
              )}
              <div
                ref={artRef}
                className='bg-black w-full h-full rounded-xl overflow-hidden shadow-lg'
              ></div>

                {/* 换源加载蒙层 */}
                {isVideoLoading && (
                  <div className='absolute inset-0 bg-black/85 backdrop-blur-sm rounded-xl flex items-center justify-center z-[500] transition-all duration-300'>
                    <div className='text-center max-w-md mx-auto px-6'>
                      {/* 动画影院图标 */}
                      <div className='relative mb-8'>
                        <div className='relative mx-auto w-24 h-24 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl shadow-2xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300'>
                          <div className='text-white text-4xl'>🎬</div>
                          {/* 旋转光环 */}
                          <div className='absolute -inset-2 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl opacity-20 animate-spin'></div>
                        </div>

                        {/* 浮动粒子效果 */}
                        <div className='absolute top-0 left-0 w-full h-full pointer-events-none'>
                          <div className='absolute top-2 left-2 w-2 h-2 bg-green-400 rounded-full animate-bounce'></div>
                          <div
                            className='absolute top-4 right-4 w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce'
                            style={{ animationDelay: '0.5s' }}
                          ></div>
                          <div
                            className='absolute bottom-3 left-6 w-1 h-1 bg-lime-400 rounded-full animate-bounce'
                            style={{ animationDelay: '1s' }}
                          ></div>
                        </div>
                      </div>

                      {/* 换源消息 */}
                      <div className='space-y-2'>
                        <p className='text-xl font-semibold text-white animate-pulse'>
                          {videoLoadingStage === 'sourceChanging'
                            ? '🔄 切換播放源...'
                            : '🔄 影片載入中...'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 选集和换源 - 在移动端始终顯示，在 lg 及以上可折叠 */}
            <div
              className={`h-[300px] lg:h-full md:overflow-hidden transition-all duration-300 ease-in-out ${
                isEpisodeSelectorCollapsed
                  ? 'md:col-span-1 lg:hidden lg:opacity-0 lg:scale-95'
                  : 'md:col-span-1 lg:opacity-100 lg:scale-100'
              }`}
            >
              <EpisodeSelector
                totalEpisodes={totalEpisodes}
                value={currentEpisodeIndex + 1}
                onChange={handleEpisodeChange}
                onSourceChange={handleSourceChange}
                currentSource={currentSource}
                currentId={currentId}
                videoTitle={searchTitle || videoTitle}
                availableSources={availableSources}
                sourceSearchLoading={sourceSearchLoading}
                sourceSearchError={sourceSearchError}
                precomputedVideoInfo={precomputedVideoInfo}
                providerCount={providerCount}
                searchStats={searchStats}
              />
            </div>
          </div>
        </div>

        {/* 详情展示 */}
        <div className='grid grid-cols-1 md:grid-cols-4 gap-4'>
          {/* 文字区 */}
          <div className='md:col-span-3'>
            <div className='p-6 flex flex-col min-h-0'>
              {/* 标题 */}
              <h1 className='text-3xl font-bold mb-2 tracking-wide flex items-center flex-shrink-0 text-center md:text-left w-full'>
                <span>
                  {displayTitleText}
                  {englishVideoTitle && (
                    <span className='ml-2 text-xl font-normal text-gray-500 dark:text-gray-400'>
                      ({englishVideoTitle})
                    </span>
                  )}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleFavorite();
                  }}
                  className='ml-3 flex-shrink-0 hover:opacity-80 transition-opacity'
                >
                  <FavoriteIcon filled={favorited} />
                </button>
              </h1>

              {/* 关键信息行 */}
              <div className='flex flex-wrap items-center gap-3 text-base mb-4 opacity-80 flex-shrink-0'>
                {detail?.class && (
                  <span className='text-green-600 font-semibold'>
                    {convertToTraditional(detail.class) || detail.class}
                  </span>
                )}
                {(detail?.year || videoYear) && (
                  <span>{detail?.year || videoYear}</span>
                )}
                {detail?.source_name && (
                  <span className='border border-gray-500/60 px-2 py-[1px] rounded'>
                    {convertToTraditional(detail.source_name) ||
                      detail.source_name}
                  </span>
                )}
                {detail?.type_name && (
                  <span>
                    {convertToTraditional(detail.type_name) || detail.type_name}
                  </span>
                )}
              </div>
              {/* 剧情简介 */}
              {detail?.desc && (
                <div
                  className='mt-0 text-base leading-relaxed opacity-90 overflow-y-auto pr-2 flex-1 min-h-0 scrollbar-hide'
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {convertToTraditional(detail.desc) || detail.desc}
                </div>
              )}
            </div>
          </div>

          {/* 封面展示 */}
          <div className='hidden md:block md:col-span-1 md:order-first'>
            <div className='pl-0 py-4 pr-6'>
              <div className='bg-gray-300 dark:bg-gray-700 aspect-[2/3] flex items-center justify-center rounded-xl overflow-hidden'>
                {videoCover ? (
                  <img
                    src={processImageUrl(videoCover)}
                    alt={displayTitleWithEnglish}
                    className='w-full h-full object-cover'
                  />
                ) : (
                  <span className='text-gray-600 dark:text-gray-400'>
                    封面图片
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

// FavoriteIcon 组件
const FavoriteIcon = ({ filled }: { filled: boolean }) => {
  if (filled) {
    return (
      <svg
        className='h-7 w-7'
        viewBox='0 0 24 24'
        xmlns='http://www.w3.org/2000/svg'
      >
        <path
          d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
          fill='#ef4444' /* Tailwind red-500 */
          stroke='#ef4444'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    );
  }
  return (
    <Heart className='h-7 w-7 stroke-[1] text-gray-600 dark:text-gray-300' />
  );
};

export default function PlayPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayPageClient />
    </Suspense>
  );
}
