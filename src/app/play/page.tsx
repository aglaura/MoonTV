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
  PlayRecord,
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

declare global {
  interface HTMLVideoElement {
    hls?: any;
  }
  interface Window {
    __moontv_player?: any;
    __moontv_getVideoInfo?: () => any;
  }
}

function PlayPageClient() {
  const { userLocale } = useUserLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();

  const delayInitialPlaybackRef = useRef<boolean>(
    !(searchParams.get('source') && searchParams.get('id'))
  );
  const initialPlaybackChosenRef = useRef(false);
  const FIRST_PLAY_CANDIDATE_LIMIT = 5;
  const [firstPlayCandidates, setFirstPlayCandidates] = useState<SearchResult[]>(
    []
  );
  const firstPlayCandidatesRef = useRef<SearchResult[]>([]);
  useEffect(() => {
    firstPlayCandidatesRef.current = firstPlayCandidates;
  }, [firstPlayCandidates]);
  const firstPlayProviderSetRef = useRef<Set<string>>(new Set());

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

  const getLiveVideoInfo = useCallback(() => {
    const player = artPlayerRef.current;
    const video = player?.video as HTMLVideoElement | undefined;
    if (!player || !video) return null;

    const buffered = (() => {
      try {
        const ranges: Array<{ start: number; end: number }> = [];
        for (let i = 0; i < video.buffered.length; i += 1) {
          ranges.push({
            start: video.buffered.start(i),
            end: video.buffered.end(i),
          });
        }
        return ranges;
      } catch {
        return [];
      }
    })();

    const quality = (() => {
      const anyVideo = video as any;
      if (typeof anyVideo.getVideoPlaybackQuality === 'function') {
        try {
          return anyVideo.getVideoPlaybackQuality();
        } catch {
          return null;
        }
      }
      return null;
    })();

    const hls = (video as any).hls;
    const hlsInfo = hls
      ? {
          currentLevel: hls.currentLevel,
          loadLevel: hls.loadLevel,
          nextLevel: hls.nextLevel,
          autoLevelEnabled: hls.autoLevelEnabled,
          bandwidthEstimate: hls.bandwidthEstimate,
          liveSyncPosition: hls.liveSyncPosition,
          level:
            hls.levels && hls.currentLevel >= 0
              ? hls.levels[hls.currentLevel]
              : null,
        }
      : null;

    return {
      currentSrc: video.currentSrc || (player.url as string) || '',
      currentTime: video.currentTime,
      duration: video.duration,
      paused: video.paused,
      ended: video.ended,
      readyState: video.readyState,
      networkState: video.networkState,
      playbackRate: video.playbackRate,
      volume: video.volume,
      muted: video.muted,
      width: video.videoWidth,
      height: video.videoHeight,
      buffered,
      decodedFrames:
        quality && typeof quality.totalVideoFrames === 'number'
          ? quality.totalVideoFrames
          : undefined,
      droppedFrames:
        quality && typeof quality.droppedVideoFrames === 'number'
          ? quality.droppedVideoFrames
          : undefined,
      hls: hlsInfo,
    };
  }, []);

  // -----------------------------------------------------------------------------
  // -----------------------------------------------------------------------------
  const [loading, setLoading] = useState(true);
  const [loadingStage, setLoadingStage] = useState<
    'searching' | 'preferring' | 'fetching' | 'ready'
  >('searching');
  const [loadingMessage, setLoadingMessage] = useState(
    'Searching player resources…'
  );
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SearchResult | null>(null);

  const [favorited, setFavorited] = useState(false);

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

  const [videoTitle, setVideoTitle] = useState(searchParams.get('title') || '');
  const [videoYear, setVideoYear] = useState(searchParams.get('year') || '');
  const [videoCover, setVideoCover] = useState('');
  const [currentSource, setCurrentSource] = useState(
    searchParams.get('source') || ''
  );
  const [currentId, setCurrentId] = useState(searchParams.get('id') || '');

  const [searchTitle] = useState(searchParams.get('stitle') || '');

  const [needPrefer, setNeedPrefer] = useState(
    searchParams.get('prefer') === 'true'
  );
  const needPreferRef = useRef(needPrefer);
  useEffect(() => {
    needPreferRef.current = needPrefer;
  }, [needPrefer]);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);

  const currentSourceRef = useRef(currentSource);
  const currentIdRef = useRef(currentId);
  const videoTitleRef = useRef(videoTitle);
  const videoYearRef = useRef(videoYear);
  const detailRef = useRef<SearchResult | null>(detail);
  const currentEpisodeIndexRef = useRef(currentEpisodeIndex);
  const majorityEpisodeCountRef = useRef<number | null>(null);

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
  const providerCountRef = useRef(0);

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
    providerCountRef.current = providerCount;
  }, [providerCount]);

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

  const [videoUrl, setVideoUrl] = useState('');

  const totalEpisodes = detail?.episodes?.length || 0;

  const resumeTimeRef = useRef<number | null>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastVolumeRef = useRef<number>(0.7);
  const [sourceSearchLoading, setSourceSearchLoading] = useState(false);
  const hasStartedRef = useRef<boolean>(false);
  const autoSwitchLockedRef = useRef<boolean>(false);
  const [sourceSearchError, setSourceSearchError] = useState<string | null>(
    null
  );
  const [sourceSearchCompleted, setSourceSearchCompleted] = useState(false);

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

  const [precomputedVideoInfo, setPrecomputedVideoInfo] = useState<
    Map<string, PrecomputedVideoInfoEntry>
  >(new Map());

  // Keep the loading banner informative while sources are being searched.
  useEffect(() => {
    if (loadingStage !== 'searching') return;

    const totalProviders =
      providerCountRef.current || searchStats.total || providerCount || 0;
    const searched = searchStats.total || 0;
    const found = searchStats.found || 0;
    const noSources = (searchStats.notFound || 0) + (searchStats.empty || 0);
    const failed = searchStats.failed || 0;

    setLoadingMessage(
      `Searching player resources… Searched ${searched}/${totalProviders} providers · With sources ${found} · No sources ${noSources} · Failed ${failed}`
    );
  }, [loadingStage, providerCount, searchStats]);
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

  const resumeRecordRef = useRef<PlayRecord | null>(null);
  const resumeAppliedRef = useRef(false);

  const normalizeTitle = useCallback(
    (text?: string | null) =>
      convertToTraditional((text || '').trim().toLowerCase()),
    []
  );

  const scoreInitialPlayCandidate = useCallback(
    (candidate: SearchResult): number => {
      if (!candidate) return -999999;

      const title = candidate.title || candidate.original_title || '';
      const lower = title.toLowerCase();
      if (
        lower.includes('trailer') ||
        title.includes('預告') ||
        title.includes('预告')
      ) {
        return -1000;
      }

      const expectedTitleNorm = normalizeTitle(
        searchTitle || videoTitleRef.current || ''
      );
      const titleNorm = normalizeTitle(candidate.title || '');
      const originalNorm = normalizeTitle(candidate.original_title || '');
      const year = (candidate.year || '').trim();
      const expectedYear = (videoYearRef.current || '').trim();
      const episodeCount = Array.isArray(candidate.episodes)
        ? candidate.episodes.length
        : 0;

      let titleScore = 0;
      if (!expectedTitleNorm) {
        titleScore = 10;
      } else if (titleNorm && titleNorm === expectedTitleNorm) {
        titleScore = 120;
      } else if (originalNorm && originalNorm === expectedTitleNorm) {
        titleScore = 110;
      } else if (
        titleNorm &&
        (titleNorm.includes(expectedTitleNorm) ||
          expectedTitleNorm.includes(titleNorm))
      ) {
        titleScore = 80;
      } else if (
        originalNorm &&
        (originalNorm.includes(expectedTitleNorm) ||
          expectedTitleNorm.includes(originalNorm))
      ) {
        titleScore = 70;
      }

      const yearScore =
        !expectedYear || !year || year === expectedYear ? 20 : 0;

      const episodesScore = Math.min(20, Math.max(0, episodeCount));

      return titleScore + yearScore + episodesScore;
    },
    [normalizeTitle, searchTitle]
  );

  const pickBestInitialCandidate = useCallback(
    (candidates: SearchResult[]): SearchResult | null => {
      if (!candidates || candidates.length === 0) return null;
      let best = candidates[0];
      let bestScore = scoreInitialPlayCandidate(best);
      for (let i = 1; i < candidates.length; i += 1) {
        const s = candidates[i];
        const score = scoreInitialPlayCandidate(s);
        if (score > bestScore) {
          best = s;
          bestScore = score;
        }
      }
      return best;
    },
    [scoreInitialPlayCandidate]
  );

  const tryResumeFromRecord = useCallback((): SearchResult | null => {
    const record = resumeRecordRef.current;
    if (!record || resumeAppliedRef.current) return null;

    const targetTitle =
      normalizeTitle(
        videoTitleRef.current ||
          searchTitle ||
          record.search_title ||
          record.title
      ) || '';
    if (!targetTitle) return null;

    const targetYear =
      (record.year || videoYearRef.current || '').trim() || undefined;
    const sources = availableSourcesRef.current;
    if (!sources.length) return null;

    const match = sources.find((s) => {
      const norm = normalizeTitle(s.title || s.original_title || '');
      if (!norm) return false;
      const yearOk =
        !targetYear ||
        !(s.year || '').trim() ||
        (s.year || '').trim() === targetYear;
      return norm === targetTitle && yearOk;
    });

    if (!match) return null;

    const targetIndex =
      record.index && record.index > 0 ? record.index - 1 : 0;
    const clampedIndex =
      match.episodes && match.episodes.length > 0
        ? Math.min(Math.max(targetIndex, 0), match.episodes.length - 1)
        : Math.max(targetIndex, 0);

    resumeAppliedRef.current = true;
    resumeTimeRef.current = record.play_time ?? 0;
    setCurrentEpisodeIndex(clampedIndex);
    currentEpisodeIndexRef.current = clampedIndex;
    return match;
  }, [normalizeTitle, searchTitle]);

  useEffect(() => {
    const fetchResumeByTitle = async () => {
      try {
        const records = await getAllPlayRecords();
        const all = Object.values(records || {});
        if (!all.length) return;
        const targetTitle =
          normalizeTitle(videoTitleRef.current || searchTitle) || '';
        if (!targetTitle) return;
        const targetYear = (videoYearRef.current || '').trim();
        const found =
          all.find((r) => {
            const norm =
              normalizeTitle(r.title || r.search_title || '') || '';
            if (!norm || norm !== targetTitle) return false;
            if (!targetYear || !r.year || !r.year.trim()) return true;
            return r.year.trim() === targetYear;
          }) || null;
        if (found) {
          resumeRecordRef.current = found;
        }
      } catch (err) {
        console.error('讀取播放紀錄失敗:', err);
      }
    };

    fetchResumeByTitle();
  }, [normalizeTitle, searchTitle]);

  const verifyAndSortSources = useCallback(
    (
      sources: SearchResult[],
      infoOverride?: Map<string, PrecomputedVideoInfoEntry>
    ): SearchResult[] => {
      const all = sources || [];
      const isTrailer = (s: SearchResult) => {
        const title = s.title || '';
        const originalTitle = s.original_title || '';
        return title.includes('預告片') || originalTitle.includes('預告片');
      };

      const getResultKey = (s: SearchResult) =>
        `${getValuationKey(s.source)}-${String(s.id ?? '')}`;

      const targetYear = (videoYearRef.current || '').trim();
      const penalties = new Map<string, string[]>();
      const expectedTitleNorm = normalizeTitle(
        searchTitle || videoTitleRef.current || ''
      );

      const matchesYear = (s: SearchResult) => {
        const y = (s.year || '').trim();
        if (!targetYear) return true; // no requirement
        if (!y) return true; // keep unknown year
        return y === targetYear;
      };

      const titleNoMatchKeys = new Set<string>();
      const matchesTitle = (s: SearchResult) => {
        if (!expectedTitleNorm) return true;
        const t = normalizeTitle(s.title || '');
        const o = normalizeTitle(s.original_title || '');
        if (t && t === expectedTitleNorm) return true;
        if (o && o === expectedTitleNorm) return true;
        if (t && (t.includes(expectedTitleNorm) || expectedTitleNorm.includes(t))) {
          return true;
        }
        if (o && (o.includes(expectedTitleNorm) || expectedTitleNorm.includes(o))) {
          return true;
        }
        return false;
      };

      const sourcesForMajority = all.filter((s) => {
        const len = s.episodes?.length || 0;
        return Array.isArray(s.episodes) && len > 0 && matchesYear(s) && !isTrailer(s);
      });
      const majority =
        sourceSearchCompleted && sourcesForMajority.length > 0
          ? determineMajorityEpisodeCount(sourcesForMajority)
          : null;
      majorityEpisodeCountRef.current = majority;

      all.forEach((s) => {
        const reasons: string[] = [];
        const resultKey = getResultKey(s);
        if (isTrailer(s)) {
          reasons.push('預告片');
        }
        if (!matchesYear(s)) {
          reasons.push('年份不符');
        }
        if (!matchesTitle(s)) {
          reasons.push('標題不符');
          titleNoMatchKeys.add(resultKey);
        }
        const len = s.episodes?.length || 0;
        if (!Array.isArray(s.episodes) || len === 0) {
          reasons.push('缺少集數資訊');
        } else if (sourceSearchCompleted && majority != null) {
          if (Math.abs(len - majority) > 2) {
            reasons.push('集數偏離主流');
          }
        }
        if (Array.isArray(s.episodes) && currentEpisodeIndexRef.current >= len) {
          reasons.push('當前集數超出範圍');
        }
        if (reasons.length) {
          penalties.set(resultKey, reasons);
        }
      });

      const sorted = sortSourcesByValuation(all, infoOverride);
      const infoMap =
        infoOverride && infoOverride.size > 0
          ? infoOverride
          : precomputedVideoInfoRef.current;

      const decorate = (s: SearchResult) => {
        const info = infoMap.get(getValuationKey(s.source));
        const reasons = penalties.get(getResultKey(s));
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

      const titleNoMatch = decorated.filter((s) =>
        titleNoMatchKeys.has(getResultKey(s))
      );
      const rest = decorated.filter(
        (s) => !titleNoMatchKeys.has(getResultKey(s))
      );

      const withPenalty = rest.filter((s) => s.verifyReason);
      const noPenalty = rest.filter((s) => !s.verifyReason);
      return [...noPenalty, ...withPenalty, ...titleNoMatch];
    },
    [
      determineMajorityEpisodeCount,
      sortSourcesByValuation,
      getValuationKey,
      normalizeTitle,
      sourceSearchCompleted,
    ]
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

  const probeResolutionsForSources = useCallback(
    async (sources: SearchResult[]) => {
      const tasks: Promise<void>[] = [];
      const seen = new Set<string>();
      const penalizedProviders = new Set<string>();
      const valuationEntries: SourceValuationPayload[] = [];

      sources.forEach((s) => {
        const valKey = getValuationKey(s.source);
        const sourceKey = `${s.source}-${s.id}`;
        if (!valKey || seen.has(sourceKey)) return;
        seen.add(sourceKey);
        if (!s.episodes || s.episodes.length === 0) return;

        const url = s.episodes[0];
        tasks.push(
          (async () => {
            try {
              const info = await getVideoResolutionFromM3u8(url);
              const speedValue = parseSpeedToKBps(info.loadSpeed);
              setPrecomputedVideoInfo((prev) => {
                const next = new Map(prev);
                // store by valuation key
                next.set(valKey, {
                  quality: info.quality,
                  loadSpeed: info.loadSpeed,
                  pingTime: info.pingTime,
                  speedValue,
                  sampleCount: 1,
                  hasError: false,
                });
                // also store by unique source key for UI lookup
                next.set(sourceKey, {
                  quality: info.quality,
                  loadSpeed: info.loadSpeed,
                  pingTime: info.pingTime,
                  speedValue,
                  sampleCount: 1,
                  hasError: false,
                });
                precomputedVideoInfoRef.current = next;
                return next;
              });
              setAvailableSources((prev) => {
                availableSourcesRef.current = prev;
                return prev;
              });

              valuationEntries.push({
                key: valKey,
                source: s.source,
                id: s.id,
                quality: info.quality,
                loadSpeed: info.loadSpeed,
                pingTime: info.pingTime,
                qualityRank: getQualityRank(info.quality),
                speedValue,
                sampleCount: 1,
                updated_at: Date.now(),
              });
            } catch {
              if (!penalizedProviders.has(valKey)) {
                penalizedProviders.add(valKey);
                valuationEntries.push({
                  key: valKey,
                  source: s.source,
                  id: s.id,
                  quality: 'Unavailable',
                  loadSpeed: 'Unavailable',
                  pingTime: Number.MAX_SAFE_INTEGER,
                  qualityRank: -1,
                  speedValue: 0,
                  sampleCount: 1,
                  updated_at: Date.now(),
                });
              }
            }
          })()
        );
      });

      if (tasks.length) {
        await Promise.allSettled(tasks);
        if (valuationEntries.length) {
          void persistSourceValuations(valuationEntries);
        }
      }
    },
    [getValuationKey, getQualityRank, persistSourceValuations]
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
            const entry: PrecomputedVideoInfoEntry = {
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
            };

            // store by valuation key for sorting
            next.set(key, entry);
            // also store by unique source key for UI resolution badge
            if (value.id) {
              const sourceKey = `${value.source}-${value.id}`;
              next.set(sourceKey, entry);
            }
          });
          updatedInfoMap = next;
          return next;
        });
        if (updatedInfoMap) {
          precomputedVideoInfoRef.current = updatedInfoMap;
        }
      } catch (error) {
        console.warn('Failed to load stored source valuations:', error);
      }
    },
    [getValuationKey, sortSourcesByValuation]
  );

  useEffect(() => {
    precomputedVideoInfoRef.current = precomputedVideoInfo;
  }, [precomputedVideoInfo]);

  const [isEpisodeSelectorCollapsed, setIsEpisodeSelectorCollapsed] =
    useState(false);

  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoLoadingStage, setVideoLoadingStage] = useState<
    'initing' | 'sourceChanging'
  >('initing');

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [clockText, setClockText] = useState(() => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
      now.getSeconds()
    )}`;
  });
  const currentPlayingInfo = useMemo(() => {
    const bySourceKey =
      precomputedVideoInfo.get(`${currentSource}-${currentId}`) ||
      precomputedVideoInfo.get(getValuationKey(currentSource));
    return bySourceKey || null;
  }, [currentSource, currentId, precomputedVideoInfo, getValuationKey]);
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
  // -----------------------------------------------------------------------------
  const formatClock = () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
      now.getSeconds()
    )}`;
  };

  const preferBestSource = async (
    sources: SearchResult[]
  ): Promise<SearchResult> => {
    if (sources.length === 1) return sources[0];

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

    const validPings = successfulResults
      .map((result) => result.testResult.pingTime)
      .filter((ping) => ping > 0);

    const minPing = validPings.length > 0 ? Math.min(...validPings) : 50;
    const maxPing = validPings.length > 0 ? Math.max(...validPings) : 1000;

    const resultsWithScore = successfulResults.map((result) => ({
      ...result,
      score: calculateSourceScore(
        result.testResult,
        maxSpeed,
        minPing,
        maxPing
      ),
    }));

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

    const speedScore = (() => {
      const speedStr = testResult.loadSpeed;
      if (speedStr === '未知' || speedStr === '測量中...') return 30;

      const match = speedStr.match(/^([\d.]+)\s*(KB\/s|MB\/s)$/);
      if (!match) return 30;

      const value = parseFloat(match[1]);
      const unit = match[2];
      const speedKBps = unit === 'MB/s' ? value * 1024 : value;

      const speedRatio = speedKBps / maxSpeed;
      return Math.min(100, Math.max(0, speedRatio * 100));
    })();
    score += speedScore * 0.4;

    const pingScore = (() => {
      const ping = testResult.pingTime;
      if (ping <= 0) return 0; // 无效延迟给默认分

      if (maxPing === minPing) return 100;

      const pingRatio = (maxPing - ping) / (maxPing - minPing);
      return Math.min(100, Math.max(0, pingRatio * 100));
    })();
    score += pingScore * 0.2;

    return Math.round(score * 100) / 100; // 保留两位小数
  };

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
    // When Hls.js is driving playback (common on Android/Chrome), touching <source>
    // can cause reload loops / restarts. Only keep remote playback flags in sync.
    if ((video as any).hls) {
      video.disableRemotePlayback = false;
      if (video.hasAttribute('disableRemotePlayback')) {
        video.removeAttribute('disableRemotePlayback');
      }
      return;
    }
    const sources = Array.from(video.getElementsByTagName('source'));
    const existed = sources.some((s) => s.src === url);
    if (!existed) {
      sources.forEach((s) => s.remove());
      const sourceEl = document.createElement('source');
      sourceEl.src = url;
      video.appendChild(sourceEl);
    }

    video.disableRemotePlayback = false;
    if (video.hasAttribute('disableRemotePlayback')) {
      video.removeAttribute('disableRemotePlayback');
    }
  };

  function filterAdsFromM3U8(m3u8Content: string): string {
    if (!m3u8Content) return '';

    const lines = m3u8Content.split('\n');
    const filteredLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

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
            if (response.data && typeof response.data === 'string') {
              response.data = filterAdsFromM3U8(response.data);
            }
            return onSuccess(response, stats, context, null);
          };
        }
        load(context, config, callbacks);
      };
    }
  }

  useEffect(() => {
    updateVideoUrl(detail, currentEpisodeIndex);
  }, [detail, currentEpisodeIndex]);

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
      let buffer = '';
      initialPlaybackChosenRef.current = false;
      firstPlayProviderSetRef.current.clear();
      firstPlayCandidatesRef.current = [];
      setFirstPlayCandidates([]);
      const allSources: SearchResult[] = [];
      const penaltyEntries: SourceValuationPayload[] = [];

      const initializePlayback = (detailData: SearchResult) => {
        if (initialPlaybackChosenRef.current) return;
        initialPlaybackChosenRef.current = true;

        setNeedPrefer(false);
        setCurrentSource(detailData.source);
        setCurrentId(detailData.id);
        setVideoYear(detailData.year);
        setVideoTitle(detailData.title || videoTitleRef.current);
        setVideoCover(detailData.poster);
        setDetail(detailData);
        if (currentEpisodeIndexRef.current >= detailData.episodes.length) {
          setCurrentEpisodeIndex(0);
          currentEpisodeIndexRef.current = 0;
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
        if (value) {
          buffer += decoder.decode(value, { stream: !done });
        }
        if (done) {
          buffer += decoder.decode();
          keepReading = false;
        }

        const payloads: string[] = [];
        for (let idx = buffer.indexOf('\n'); idx >= 0; idx = buffer.indexOf('\n')) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line) payloads.push(line);
        }
        if (!keepReading) {
          const tail = buffer.trim();
          buffer = '';
          if (tail) payloads.push(tail);
        }
        if (!payloads.length) continue;

        const parsedSources: SearchResult[] = [];
        for (const payload of payloads) {
          try {
            const entries = JSON.parse(payload);
            if (Array.isArray(entries)) {
              parsedSources.push(...entries);
            } else if (entries && typeof entries === 'object') {
              if (entries.__meta) {
                const searchedCount = entries.searched ?? 0;
                setSearchStats({
                  total: searchedCount,
                  found: entries.found ?? 0,
                  notFound: entries.notFound ?? 0,
                  empty: entries.empty ?? 0,
                  failed: entries.failed ?? 0,
                });
                if (searchedCount > 0) {
                  setProviderCount(searchedCount);
                }
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
          availableSourcesRef.current = merged;
          return merged;
        });
        const resumeCandidate = tryResumeFromRecord();
        if (!initialPlaybackChosenRef.current && resumeCandidate) {
          initializePlayback(resumeCandidate);
        }

        if (
          !initialPlaybackChosenRef.current &&
          !delayInitialPlaybackRef.current &&
          currentSourceRef.current &&
          currentIdRef.current
        ) {
          const match =
            newSources.find(
              (s) =>
                s.source === currentSourceRef.current &&
                String(s.id ?? '') === String(currentIdRef.current ?? '')
            ) ||
            availableSourcesRef.current.find(
              (s) =>
                s.source === currentSourceRef.current &&
                String(s.id ?? '') === String(currentIdRef.current ?? '')
            ) ||
            null;
          if (match) {
            initializePlayback(match);
          }
        }

        if (!initialPlaybackChosenRef.current && delayInitialPlaybackRef.current) {
          const grouped = new Map<string, SearchResult[]>();
          newSources.forEach((s) => {
            const key = getValuationKey(s.source);
            if (!key) return;
            if (!Array.isArray(s.episodes) || s.episodes.length === 0) return;
            const arr = grouped.get(key);
            if (arr) {
              arr.push(s);
            } else {
              grouped.set(key, [s]);
            }
          });

          if (grouped.size > 0) {
            const next = [...firstPlayCandidatesRef.current];
            grouped.forEach((items, key) => {
              if (next.length >= FIRST_PLAY_CANDIDATE_LIMIT) return;
              if (firstPlayProviderSetRef.current.has(key)) return;
              const bestFromProvider = pickBestInitialCandidate(items);
              if (!bestFromProvider) return;
              firstPlayProviderSetRef.current.add(key);
              next.push(bestFromProvider);
            });
            if (next.length !== firstPlayCandidatesRef.current.length) {
              const limited = next.slice(0, FIRST_PLAY_CANDIDATE_LIMIT);
              firstPlayCandidatesRef.current = limited;
              setFirstPlayCandidates(limited);
            }
          }

          const candidatesNow = firstPlayCandidatesRef.current;
          if (
            candidatesNow.length >= FIRST_PLAY_CANDIDATE_LIMIT &&
            !initialPlaybackChosenRef.current
          ) {
            const picked = pickBestInitialCandidate(
              candidatesNow.slice(0, FIRST_PLAY_CANDIDATE_LIMIT)
            );
            if (picked) {
              initializePlayback(picked);
            }
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
          }
        }
      }

      setSourceSearchLoading(false);
      setSourceSearchCompleted(true);
      fetchStoredValuations(allSources);
      await probeResolutionsForSources(allSources);
      setAvailableSources(() => {
        const finalSorted = verifyAndSortSources(allSources);
        availableSourcesRef.current = finalSorted;
        return finalSorted;
      });
      const resumeCandidateFinal = tryResumeFromRecord();
      if (!initialPlaybackChosenRef.current && resumeCandidateFinal) {
        initializePlayback(resumeCandidateFinal);
      }

      const uniqueProviders = new Set(
        allSources.map((s) => (s.source_name || s.source || '').toString())
      );
      if (uniqueProviders.size > providerCountRef.current) {
        setProviderCount(uniqueProviders.size);
      }

      if (!initialPlaybackChosenRef.current && delayInitialPlaybackRef.current) {
        const candidates = firstPlayCandidatesRef.current;
        const picked = pickBestInitialCandidate(
          candidates.slice(0, FIRST_PLAY_CANDIDATE_LIMIT)
        );
        if (picked) {
          initializePlayback(picked);
        }
      }

      if (!initialPlaybackChosenRef.current) {
        if (allSources.length > 0) {
          const firstPlayable =
            allSources.find((s) => Array.isArray(s.episodes) && s.episodes.length > 0) ||
            allSources[0];
          initializePlayback(firstPlayable);
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
            bestSource.title,
            { auto: true }
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
          : '🔍 Searching player resources…'
      );

      streamSourcesData(searchTitle || videoTitle);
    };

    initAll();
  }, []);

  useEffect(() => {
    const initFromHistory = async () => {
      if (!currentSource || !currentId) return;

      try {
        const allRecords = await getAllPlayRecords();
        const key = generateStorageKey(currentSource, currentId);
        const record = allRecords[key];

        if (record) {
          const targetIndex = record.index - 1;
          const targetTime = record.play_time;

          if (targetIndex !== currentEpisodeIndex) {
            setCurrentEpisodeIndex(targetIndex);
          }

          resumeTimeRef.current = targetTime;
        }
      } catch (err) {
        console.error('讀取播放紀錄失敗:', err);
      }
    };

    initFromHistory();
  }, []);

  const handleSourceChange = async (
    newSource: string,
    newId: string,
    newTitle: string,
    options?: { auto?: boolean; allowDuringPlayback?: boolean }
  ) => {
    const autoSwitch = options?.auto ?? false;
    const allowDuringPlayback = options?.allowDuringPlayback ?? false;

    if (autoSwitch && autoSwitchLockedRef.current && !allowDuringPlayback) {
      return;
    }

    try {
      setVideoLoadingStage('sourceChanging');
      setIsVideoLoading(true);
      hasStartedRef.current = false;

      const currentPlayTime = artPlayerRef.current?.currentTime || 0;
      console.log('換源前當前播放時間:', currentPlayTime);

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

      let targetIndex = currentEpisodeIndex;

      if (!newDetail.episodes || targetIndex >= newDetail.episodes.length) {
        targetIndex = 0;
      }

      if (targetIndex !== currentEpisodeIndex) {
        resumeTimeRef.current = 0;
      } else if (
        (!resumeTimeRef.current || resumeTimeRef.current === 0) &&
        currentPlayTime > 1
      ) {
        resumeTimeRef.current = currentPlayTime;
      }

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
      handleSourceChange(nextSource.source, nextSource.id, nextSource.title, {
        auto: true,
        allowDuringPlayback: true,
      });
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
    const uaRaw = navigator.userAgent;
    const ua = uaRaw.toLowerCase();
    const findVersion = (regex: RegExp) => {
      const m = uaRaw.match(regex);
      return m?.[1];
    };

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

    const browserVersion = (() => {
      switch (browser) {
        case 'Edge':
          return findVersion(/Edg\/([\d.]+)/);
        case 'Chrome':
          return findVersion(/Chrome\/([\d.]+)/);
        case 'Firefox':
          return findVersion(/Firefox\/([\d.]+)/);
        case 'Safari':
          return findVersion(/Version\/([\d.]+)/);
        default:
          return undefined;
      }
    })();

    const osVersion = (() => {
      switch (os) {
        case 'Windows':
          return findVersion(/Windows NT ([\d.]+)/);
        case 'macOS':
          return findVersion(/Mac OS X ([\d_]+)/)?.replace(/_/g, '.');
        case 'Android':
          return findVersion(/Android ([\d.]+)/);
        case 'iOS':
          return findVersion(/OS ([\d_]+)/)?.replace(/_/g, '.');
        default:
          return undefined;
      }
    })();

    const browserLabel = browserVersion ? `${browser} ${browserVersion}` : browser;
    const osLabel = osVersion ? `${os} ${osVersion}` : os;
    setClientInfo(`${browserLabel} • ${osLabel}`);
  }, []);

  useEffect(() => {
    if (!error) {
      autoErrorRecoveryRef.current = false;
    }
  }, [error]);

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  const handleEpisodeChange = (episodeNumber: number) => {
    if (episodeNumber >= 0 && episodeNumber < totalEpisodes) {
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
  // ---------------------------------------------------------------------------
  const handleKeyboardShortcuts = (e: KeyboardEvent) => {
    if (
      (e.target as HTMLElement).tagName === 'INPUT' ||
      (e.target as HTMLElement).tagName === 'TEXTAREA'
    )
      return;

    if (e.altKey && e.key === 'ArrowLeft') {
      if (detailRef.current && currentEpisodeIndexRef.current > 0) {
        handlePreviousEpisode();
        e.preventDefault();
      }
    }

    if (e.altKey && e.key === 'ArrowRight') {
      const d = detailRef.current;
      const idx = currentEpisodeIndexRef.current;
      if (d && idx < d.episodes.length - 1) {
        handleNextEpisode();
        e.preventDefault();
      }
    }

    if (!e.altKey && e.key === 'ArrowLeft') {
      if (artPlayerRef.current && artPlayerRef.current.currentTime > 5) {
        artPlayerRef.current.currentTime -= 10;
        e.preventDefault();
      }
    }

    if (!e.altKey && e.key === 'ArrowRight') {
      if (
        artPlayerRef.current &&
        artPlayerRef.current.currentTime < artPlayerRef.current.duration - 5
      ) {
        artPlayerRef.current.currentTime += 10;
        e.preventDefault();
      }
    }

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

    if (e.key === ' ') {
      if (artPlayerRef.current) {
        artPlayerRef.current.toggle();
        e.preventDefault();
      }
    }

    if (e.key === 'f' || e.key === 'F') {
      if (artPlayerRef.current) {
        artPlayerRef.current.fullscreen = !artPlayerRef.current.fullscreen;
        e.preventDefault();
      }
    }
  };

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
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
    const handleBeforeUnload = () => {
      saveCurrentPlayProgress();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentPlayProgress();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentEpisodeIndex, detail, artPlayerRef.current]);

  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
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
        await deleteFavorite(currentSourceRef.current, currentIdRef.current);
        setFavorited(false);
      } else {
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

    const isWebkit =
      typeof window !== 'undefined' &&
      typeof (window as any).webkitConvertPointFromNodeToPage === 'function';

    if (!isWebkit && artPlayerRef.current) {
      artPlayerRef.current.switch = videoUrl;
      artPlayerRef.current.title = `${displayTitleWithEnglish} - Episode ${
        currentEpisodeIndex + 1
      }`;
      artPlayerRef.current.poster = videoCover;
      if (artPlayerRef.current?.video) {
        ensureVideoSource(
          artPlayerRef.current.video as HTMLVideoElement,
          videoUrl
        );
      }
      return;
    }

    if (artPlayerRef.current) {
      if (artPlayerRef.current.video && artPlayerRef.current.video.hls) {
        artPlayerRef.current.video.hls.destroy();
      }
      artPlayerRef.current.destroy();
      artPlayerRef.current = null;
    }

    try {
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
        lang: 'en',
        hotkey: false,
        fastForward: true,
        autoOrientation: true,
        lock: true,
        moreVideoAttr: {
          crossOrigin: 'anonymous',
        },
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
            html: 'Ad Block',
            icon: '<text x="50%" y="50%" font-size="20" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">AD</text>',
            tooltip: blockAdEnabled ? 'Enabled' : 'Disabled',
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
              return newVal ? 'Enabled' : 'Disabled';
            },
          },
        ],
        controls: [
          {
            position: 'left',
            index: 13,
            html: '<i class="art-icon flex"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/></svg></i>',
            tooltip: 'Next episode',
            click: function () {
              handleNextEpisode();
            },
          },
        ],
      });
      artPlayerRef.current.title = `${displayTitleWithEnglish} - Episode ${
        currentEpisodeIndex + 1
      }`;

      artPlayerRef.current.on('ready', () => {
        setError(null);
      });

      // Expose for debugging in browser devtools
      if (typeof window !== 'undefined') {
        window.__moontv_player = artPlayerRef.current;
        window.__moontv_getVideoInfo = getLiveVideoInfo;
      }

      artPlayerRef.current.on('video:volumechange', () => {
        lastVolumeRef.current = artPlayerRef.current.volume;
      });

      artPlayerRef.current.on('video:canplay', () => {
        hasStartedRef.current = true;
        autoSwitchLockedRef.current = true;
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
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

        setIsVideoLoading(false);
      });

      artPlayerRef.current.on('error', (err: any) => {
        console.error('播放器錯誤:', err);
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
        setIsVideoLoading(false);
      });

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

      artPlayerRef.current.on('fullscreen', () => {
        setIsFullscreen(true);
      });

      artPlayerRef.current.on('fullscreenCancel', () => {
        setIsFullscreen(false);
      });

      // Web fullscreen mode (fullscreen within page / Fullscreen API wrapper)
      artPlayerRef.current.on('fullscreenWeb', () => {
        setIsFullscreen(true);
      });

      artPlayerRef.current.on('fullscreenWebCancel', () => {
        setIsFullscreen(false);
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
          setIsVideoLoading(false);
          trySwitchToNextSource();
        }
      }, 6000);
    } catch (err) {
      console.error('建立播放器失敗:', err);
      setError('播放器初始化失敗');
    }
  }, [Artplayer, Hls, videoUrl, loading, blockAdEnabled]);

  useEffect(() => {
    if (!artPlayerRef.current) {
      return;
    }
    artPlayerRef.current.title = `${displayTitleWithEnglish} - Episode ${
      currentEpisodeIndex + 1
    }`;
  }, [displayTitleWithEnglish, currentEpisodeIndex]);

  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }
    const tick = () => setClockText(formatClock());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [isFullscreen]);

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
            <div className='space-y-3'>
              <p className='text-xl font-semibold text-gray-800 dark:text-gray-200 animate-pulse'>
                {loadingMessage}
              </p>
              <div className='text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3 space-y-1'>
                <div className='flex justify-between'>
                  <span>Providers searched</span>
                  <span>
                    {searchStats.total || 0}/{providerCountRef.current ||
                      searchStats.total ||
                      providerCount ||
                      0}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span>With sources</span>
                  <span>{searchStats.found || 0}</span>
                </div>
                <div className='flex justify-between'>
                  <span>No sources</span>
                  <span>{(searchStats.notFound || 0) + (searchStats.empty || 0)}</span>
                </div>
                <div className='flex justify-between'>
                  <span>Failed</span>
                  <span>{searchStats.failed || 0}</span>
                </div>
                <div className='flex justify-between'>
                  <span>Pending</span>
                  <span>
                    {Math.max(
                      (providerCountRef.current ||
                        searchStats.total ||
                        providerCount ||
                        0) -
                        (searchStats.total || 0),
                      0
                    )}
                  </span>
                </div>
              </div>
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
                Oops, something went wrong
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
        {/* 播放資訊（置於播放器上方） */}
        {(clientInfo || detail?.source_name || currentPlayingInfo) && (
          <div className='flex flex-wrap items-center gap-3 text-xs text-gray-800 dark:text-gray-100 bg-white/70 dark:bg-gray-800/70 border border-gray-200/70 dark:border-gray-700/70 rounded-lg px-3 py-2 shadow-sm backdrop-blur'>
            {clientInfo && (
              <span className='px-2 py-1 rounded-full bg-white/80 dark:bg-gray-800/80 font-medium border border-gray-200/80 dark:border-gray-700/60'>
                {clientInfo}
              </span>
            )}
            {(detail?.source_name || currentPlayingInfo) && (
              <span className='px-2 py-1 rounded-full bg-white/85 dark:bg-gray-800/85 font-medium border border-gray-200/80 dark:border-gray-700/60'>
                播放來源：
                {convertToTraditional(detail?.source_name || '') ||
                  detail?.source_name ||
                  currentSource}
              </span>
            )}
            {currentPlayingInfo && !currentPlayingInfo.hasError && (
              <>
                <span className='px-2 py-1 rounded-full bg-white/80 dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/60'>
                  解析度：{currentPlayingInfo.quality || 'NA'}
                </span>
                <span className='px-2 py-1 rounded-full bg-white/80 dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/60'>
                  載入速度：{currentPlayingInfo.loadSpeed}
                </span>
                <span className='px-2 py-1 rounded-full bg-white/80 dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/60'>
                  延遲：{currentPlayingInfo.pingTime}ms
                </span>
              </>
            )}
          </div>
        )}

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
              {isFullscreen && (
                <div className='pointer-events-none absolute top-3 right-3 z-[600] rounded-full bg-black/70 px-3 py-1 text-white text-sm tracking-widest'>
                  {clockText}
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
