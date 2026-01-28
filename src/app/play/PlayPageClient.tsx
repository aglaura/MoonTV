/* eslint-disable @typescript-eslint/ban-ts-comment, @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console, @next/next/no-img-element */

'use client';

import Artplayer from 'artplayer';
import Hls from 'hls.js';
import { useSearchParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';

const isIOSDevice = () => {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  const platform = ((navigator as any).platform || '').toLowerCase();
  const isTouchMac =
    platform === 'macintel' && (navigator as any).maxTouchPoints > 1;
  const isAppleDesktopSafari =
    /macintosh|mac os x/.test(ua) &&
    /safari/.test(ua) &&
    !/chrome|crios|fxios|edgios/.test(ua) &&
    !/firefox|fxios/.test(ua);
  const isSafari =
    /safari/.test(ua) &&
    !/chrome|crios|fxios|edgios/.test(ua) &&
    !/firefox|fxios/.test(ua);
  const hasTouch = (navigator as any).maxTouchPoints > 0;
  return (
    /iphone|ipad|ipod/.test(ua) ||
    isTouchMac ||
    isAppleDesktopSafari ||
    (isSafari && hasTouch)
  );
};

import {
  deleteFavorite,
  generateStorageKey,
  getAllPlayRecords,
  isFavorited,
  PlayRecord,
  saveFavorite,
  savePlayRecord,
  subscribeToDataUpdates,
} from '@/lib/db.client';
import { getDoubanSubjectDetail } from '@/lib/douban.client';
import { getOMDBData, type OMDBEnrichment } from '@/lib/omdb.client';
import {
  getTvmazeContribution,
  type TvmazeContribution,
} from '@/lib/tvmaze.client';
import { convertToTraditional } from '@/lib/locale';
import { SearchResult } from '@/lib/types';
import { useUserLanguage } from '@/lib/userLanguage.client';
import {
  DOWNLOAD_RECORDS_EVENT,
  readDownloadRecords,
  resolveDownloadStorageKey,
  type DownloadRecord,
  writeDownloadRecords,
} from '@/lib/downloadRecords.client';
import { normalizeConfigJsonBase } from '@/lib/configjson';
import {
  formatSpeedFromKBps,
  getQualityLabelFromRank,
  getQualityRank,
  getVideoResolutionFromM3u8,
  parseSpeedToKBps,
} from '@/lib/utils';

import EpisodeSelector from '@/components/EpisodeSelector';
import PageLayout from '@/components/PageLayout';
import PlayDetails from '@/components/play/PlayDetails';

declare global {
  interface HTMLVideoElement {
    hls?: any;
  }
  interface Window {
    __moontv_player?: any;
    __moontv_getVideoInfo?: () => any;
  }
}

export type PlayPageVariant = 'default' | 'tv';

export type PlayerErrorType =
  | 'playback'
  | 'source'
  | 'search'
  | 'network'
  | 'params'
  | 'unknown';

export type CurrentPlayingInfo = {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  hasError?: boolean;
};

export type ActualPlaybackInfo = {
  width: number;
  height: number;
  quality: string;
  level?: number;
} | null;

export type TvPlayLayoutProps = {
  title: string;
  englishTitle?: string;
  episodeLabel?: string;
  introTags: string[];
  synopsisText?: string;
  clientInfo?: string;
  sourceName?: string;
  currentSource?: string;
  currentPlayingInfo: CurrentPlayingInfo | null;
  actualPlaybackInfo: ActualPlaybackInfo;
  localizeInfoLabel: (label: string) => string;
  downloadButtonLabel: string;
  downloadButtonDisabled: boolean;
  isPlaying: boolean;
  onDownload: () => void;
  onTogglePlayback: () => void;
  artRef: RefObject<HTMLDivElement>;
  playerHeightClass: string;
  forceRotate: boolean;
  error: string | null;
  errorType: PlayerErrorType;
  onClearError: () => void;
  onTryNextSource: () => void;
  isVideoLoading: boolean;
  videoLoadingStage: 'initing' | 'sourceChanging';
  episodeSelector: ReactNode;
  tmdbRecommendations: any[];
  tt: (en: string, zhHans: string, zhHant: string) => string;
  convertToTraditional: (text?: string) => string | undefined;
};

export type PlayPageClientProps = {
  variant?: PlayPageVariant;
  TvLayout?: (props: TvPlayLayoutProps) => JSX.Element;
};

export function PlayPageClient({
  variant = 'default',
  TvLayout,
}: PlayPageClientProps) {
  const { userLocale } = useUserLanguage();
  const isTvVariant = variant === 'tv';
  const searchParams = useSearchParams();
  const isIOS = useMemo(() => isIOSDevice(), []);
  const configJsonBase = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const runtimeConfig = (window as any).RUNTIME_CONFIG || {};
    return normalizeConfigJsonBase(runtimeConfig.CONFIGJSON || '') || '';
  }, []);

  type UiLocale = 'en' | 'zh-Hans' | 'zh-Hant';
  const uiLocale: UiLocale =
    userLocale === 'zh-Hans' || userLocale === 'zh-Hant' ? userLocale : 'en';
  const tt = useCallback(
    (en: string, zhHans: string, zhHant: string) => {
      if (uiLocale === 'zh-Hans') return zhHans;
      if (uiLocale === 'zh-Hant') return zhHant;
      return en;
    },
    [uiLocale]
  );
  const formatTimeLabel = useCallback((seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const secs = safe % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    return `${minutes}:${String(secs).padStart(2, '0')}`;
  }, []);

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
    tt(
      'Searching player resources…',
      '正在搜索播放资源…',
      '正在搜尋播放資源…'
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<PlayerErrorType>('unknown');
  const reportError = useCallback(
    (message: string, type: PlayerErrorType = 'unknown') => {
      setErrorType(type);
      setError(message);
    },
    []
  );
  const clearError = useCallback(() => {
    setError(null);
    setErrorType('unknown');
  }, []);
  const [detail, setDetail] = useState<SearchResult | null>(null);

  const [favorited, setFavorited] = useState(false);

  const [blockAdEnabled, setBlockAdEnabled] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('enable_blockad');
      if (v !== null) return v === 'true';
    }
    return true;
  });
  const [blockAdMode, setBlockAdMode] = useState<'smart' | 'simple'>(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('blockad_mode');
      if (v === 'simple') return 'simple';
    }
    return 'smart';
  });
  const blockAdEnabledRef = useRef(blockAdEnabled);
  const blockAdModeRef = useRef(blockAdMode);
  const lastPlaybackTimeRef = useRef(0);
  const lastManualSeekAtRef = useRef(0);
  const pendingUnmuteRef = useRef(false);
  const pendingUnmuteVolumeRef = useRef<number | null>(null);
  useEffect(() => {
    blockAdEnabledRef.current = blockAdEnabled;
  }, [blockAdEnabled]);
  useEffect(() => {
    blockAdModeRef.current = blockAdMode;
  }, [blockAdMode]);
  const [audioOnly, setAudioOnly] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [videoTitle, setVideoTitle] = useState(searchParams.get('title') || '');
  const [videoYear, setVideoYear] = useState(searchParams.get('year') || '');
  const [videoCover, setVideoCover] = useState('');
  const [currentSource, setCurrentSource] = useState(
    searchParams.get('source') || ''
  );
  const [currentId, setCurrentId] = useState(searchParams.get('id') || '');
  const [videoUrl, setVideoUrl] = useState('');
  const targetDoubanId = useMemo(() => {
    const raw = searchParams.get('douban_id');
    if (!raw) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [searchParams]);
  const targetImdbId = useMemo(() => {
    const raw = searchParams.get('imdbId');
    const m = raw?.match(/(tt\\d{5,}|imdbt\\d+)/i);
    return m ? m[0].toLowerCase() : null;
  }, [searchParams]);

  const [searchTitle] = useState(searchParams.get('stitle') || '');

  const [needPrefer, setNeedPrefer] = useState(
    searchParams.get('prefer') === 'true'
  );
  const needPreferRef = useRef(needPrefer);
  useEffect(() => {
    needPreferRef.current = needPrefer;
  }, [needPrefer]);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);
  const downloadStorageKey = useMemo(() => resolveDownloadStorageKey(), []);
  const downloadRecordKey = useMemo(() => {
    const baseKey =
      currentSource && currentId
        ? generateStorageKey(currentSource, currentId)
        : videoUrl
        ? `video:${videoUrl}`
        : null;
    return baseKey ? `${baseKey}:${currentEpisodeIndex}` : null;
  }, [currentSource, currentId, currentEpisodeIndex, videoUrl]);
  const [downloadRecord, setDownloadRecord] = useState<DownloadRecord | null>(
    null
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!downloadRecordKey) {
      setDownloadRecord(null);
      return;
    }
    const loadRecord = () => {
      const existing = readDownloadRecords(downloadStorageKey);
      const found =
        existing.find((rec) => rec.key === downloadRecordKey) || null;
      setDownloadRecord(found);
    };
    loadRecord();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === downloadStorageKey) {
        loadRecord();
      }
    };
    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (detail?.key === downloadStorageKey) {
        loadRecord();
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(
      DOWNLOAD_RECORDS_EVENT,
      handleCustom as EventListener
    );
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(
        DOWNLOAD_RECORDS_EVENT,
        handleCustom as EventListener
      );
    };
  }, [downloadStorageKey, downloadRecordKey]);
  const downloadPollRef = useRef<NodeJS.Timeout | null>(null);
  const downloadPollJobRef = useRef<string | null>(null);
  const upsertDownloadRecord = useCallback(
    (
      key: string,
      updates: Partial<DownloadRecord> & { title?: string }
    ) => {
      if (typeof window === 'undefined' || !key) return;
      try {
        const existing = readDownloadRecords(downloadStorageKey);
        const list = Array.isArray(existing) ? existing : [];
        const idx = list.findIndex((rec) => rec.key === key);
        const now = Date.now();
        const base: DownloadRecord = {
          key,
          title: updates.title || (idx >= 0 ? list[idx].title : ''),
          url: '',
          ts: idx >= 0 ? list[idx].ts : now,
          status: 'preparing',
          progress: 0,
        };
        const merged: DownloadRecord = {
          ...base,
          ...(idx >= 0 ? list[idx] : {}),
          ...updates,
          key,
        };
        if (idx >= 0) {
          list[idx] = merged;
        } else {
          list.unshift(merged);
        }
        writeDownloadRecords(downloadStorageKey, list.slice(0, 100));
      } catch {
        // ignore storage failures
      }
    },
    [downloadStorageKey]
  );
  const normalizeDownloadUrl = useCallback(
    (url: string) => {
      if (!url) return '';
      if (/^https?:\/\//i.test(url)) return url;
      if (!configJsonBase) return url;
      return `${configJsonBase.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
    },
    [configJsonBase]
  );
  const pollDownloadJob = useCallback(
    async (jobId: string, key: string) => {
      if (!configJsonBase || !jobId || !key) return;
      try {
        const statusUrl = `${configJsonBase}/posters/yt-dlp.php?action=status&id=${encodeURIComponent(
          jobId
        )}`;
        const resp = await fetch(statusUrl, { cache: 'no-store' });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data?.ok === false) {
          return;
        }
        const status = data?.status || 'queued';
        const progress =
          typeof data?.progress === 'number' ? data.progress : 0;
        const urlCandidate = data?.url || data?.file || '';
        const resolvedUrl = urlCandidate
          ? normalizeDownloadUrl(String(urlCandidate))
          : '';
        const updates: Partial<DownloadRecord> = {
          jobId,
          status,
          progress,
        };
        if (resolvedUrl) {
          updates.url = resolvedUrl;
        }
        upsertDownloadRecord(key, updates);

        if (status === 'downloaded' || status === 'error') {
          if (downloadPollRef.current) {
            clearInterval(downloadPollRef.current);
            downloadPollRef.current = null;
            downloadPollJobRef.current = null;
          }
        }
      } catch {
        // ignore polling errors
      }
    },
    [configJsonBase, normalizeDownloadUrl, upsertDownloadRecord]
  );
  const startDownloadPolling = useCallback(
    (jobId: string, key: string) => {
      if (!jobId || !key || !configJsonBase) return;
      if (downloadPollJobRef.current === jobId && downloadPollRef.current) {
        return;
      }
      if (downloadPollRef.current) {
        clearInterval(downloadPollRef.current);
      }
      downloadPollJobRef.current = jobId;
      pollDownloadJob(jobId, key);
      downloadPollRef.current = setInterval(() => {
        pollDownloadJob(jobId, key);
      }, 2000);
    },
    [configJsonBase, pollDownloadJob]
  );
  useEffect(() => {
    if (!downloadRecord?.jobId || !downloadRecordKey) return;
    const status = downloadRecord.status || 'queued';
    if (
      status === 'queued' ||
      status === 'preparing' ||
      status === 'downloading'
    ) {
      startDownloadPolling(downloadRecord.jobId, downloadRecordKey);
    }
  }, [
    downloadRecord?.jobId,
    downloadRecord?.status,
    downloadRecordKey,
    startDownloadPolling,
  ]);
  useEffect(() => {
    return () => {
      if (downloadPollRef.current) {
        clearInterval(downloadPollRef.current);
        downloadPollRef.current = null;
        downloadPollJobRef.current = null;
      }
    };
  }, []);

  const currentSourceRef = useRef(currentSource);
  const currentIdRef = useRef(currentId);
  const videoTitleRef = useRef(videoTitle);
  const videoYearRef = useRef(videoYear);
  const detailRef = useRef<SearchResult | null>(detail);
  const [offlineUrl, setOfflineUrl] = useState<string | null>(null);
  const offlineObjectUrlRef = useRef<string | null>(null);
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

  const totalEpisodes = detail?.episodes?.length || 0;

  const resumeTimeRef = useRef<number | null>(null);
  const resumePreviewTimeRef = useRef<number | null>(null);
  const resumePreviewEpisodeRef = useRef<number | null>(null);
  const resumePreviewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const resumePreviewElRef = useRef<HTMLDivElement | null>(null);
  const resumePreviewMarkerRef = useRef<HTMLDivElement | null>(null);
  const resumePreviewCleanupRef = useRef<(() => void) | null>(null);
  const preloadedNextUrlRef = useRef<string | null>(null);
  const preconnectOriginsRef = useRef<Set<string>>(new Set());
  const preloadNextAbortRef = useRef<AbortController | null>(null);
  const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const setResumePreviewTime = useCallback(
    (time: number | null, episodeIndex?: number | null) => {
      const safeTime =
        typeof time === 'number' && Number.isFinite(time) && time > 0
          ? time
          : null;
      resumePreviewTimeRef.current = safeTime;
      if (typeof episodeIndex === 'number') {
        resumePreviewEpisodeRef.current = episodeIndex;
      } else if (!safeTime) {
        resumePreviewEpisodeRef.current = null;
      }
    },
    []
  );
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
      tt(
        `Searching player resources… Searched ${searched}/${totalProviders} providers · With sources ${found} · No sources ${noSources} · Failed ${failed}`,
        `正在搜索播放资源… 已搜索 ${searched}/${totalProviders} 个来源 · 有资源 ${found} · 无资源 ${noSources} · 失败 ${failed}`,
        `正在搜尋播放資源… 已搜尋 ${searched}/${totalProviders} 個來源 · 有資源 ${found} · 無資源 ${noSources} · 失敗 ${failed}`
      )
    );
  }, [loadingStage, providerCount, searchStats, tt]);
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
        const hasInfo =
          Boolean(info) &&
          (qualityRank > 0 ||
            speedValue > 0 ||
            pingTime < Number.MAX_SAFE_INTEGER);

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

        // Provider valuation weights: heavily prioritize resolution/quality.
        const QUALITY_WEIGHT = 0.8;
        const SPEED_WEIGHT = 0.1;
        const PING_WEIGHT = 0.1;
        const score =
          qualityScore * QUALITY_WEIGHT +
          speedScore * SPEED_WEIGHT +
          pingScore * PING_WEIGHT;

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

    const sources = availableSourcesRef.current;
    if (!sources.length) return null;

    const recordDoubanId =
      typeof record.douban_id === 'number' && Number.isFinite(record.douban_id)
        ? record.douban_id
        : undefined;
    if (recordDoubanId) {
      const matchByDouban =
        sources.find((s) => s.douban_id === recordDoubanId) || null;
      if (matchByDouban) {
        const targetIndex =
          record.index && record.index > 0 ? record.index - 1 : 0;
        const clampedIndex =
          matchByDouban.episodes && matchByDouban.episodes.length > 0
            ? Math.min(
                Math.max(targetIndex, 0),
                matchByDouban.episodes.length - 1
              )
            : Math.max(targetIndex, 0);

        resumeAppliedRef.current = true;
        resumeTimeRef.current = record.play_time ?? 0;
        setResumePreviewTime(resumeTimeRef.current, clampedIndex);
        setCurrentEpisodeIndex(clampedIndex);
        currentEpisodeIndexRef.current = clampedIndex;
        // Do not lock to the previous provider; let sorting pick the best.
        return null;
      }
    }

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
    setResumePreviewTime(resumeTimeRef.current, clampedIndex);
    setCurrentEpisodeIndex(clampedIndex);
    currentEpisodeIndexRef.current = clampedIndex;
    // Let source selection pick the best provider; only restore progress.
    return null;
  }, [normalizeTitle, searchTitle, setResumePreviewTime]);

  useEffect(() => {
    const fetchResumeByTitle = async () => {
      try {
        const records = await getAllPlayRecords();
        const all = Object.values(records || {});
        if (!all.length) return;

        if (targetDoubanId) {
          const found = all.find((r) => r.douban_id === targetDoubanId) || null;
          if (found) {
            resumeRecordRef.current = found;
            return;
          }
        }

        if (targetImdbId) {
          const found =
            all.find((r) => {
              const m = r.imdbId?.match(/(tt\\d{5,}|imdbt\\d+)/i);
              return m ? m[0].toLowerCase() === targetImdbId : false;
            }) || null;
          if (found) {
            resumeRecordRef.current = found;
            return;
          }
        }

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
  }, [normalizeTitle, searchTitle, targetDoubanId, targetImdbId]);

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
      const reasonSep = tt('; ', '；', '；');

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

      const episodeCandidates = all.filter((s) => {
        const len = s.episodes?.length || 0;
        return (
          Array.isArray(s.episodes) &&
          len > 0 &&
          matchesYear(s) &&
          matchesTitle(s) &&
          !isTrailer(s)
        );
      });
      const maxEpisodeCount =
        episodeCandidates.length > 0
          ? Math.max(...episodeCandidates.map((s) => s.episodes?.length || 0))
          : 0;
      majorityEpisodeCountRef.current = maxEpisodeCount > 0 ? maxEpisodeCount : null;

      all.forEach((s) => {
        const reasons: string[] = [];
        const resultKey = getResultKey(s);
        if (isTrailer(s)) {
          reasons.push(tt('Trailer', '预告片', '預告片'));
        }
        if (!matchesYear(s)) {
          reasons.push(tt('Year mismatch', '年份不符', '年份不符'));
        }
        if (!matchesTitle(s)) {
          reasons.push(tt('Title mismatch', '标题不符', '標題不符'));
          titleNoMatchKeys.add(resultKey);
        }
        const len = s.episodes?.length || 0;
        if (!Array.isArray(s.episodes) || len === 0) {
          reasons.push(tt('No episodes', '缺少集数信息', '缺少集數資訊'));
        }
        if (Array.isArray(s.episodes) && currentEpisodeIndexRef.current >= len) {
          reasons.push(
            tt(
              'Current episode out of range',
              '当前集数超出范围',
              '當前集數超出範圍'
            )
          );
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
          ? { ...base, verifyReason: reasons.join(reasonSep) }
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
      const noPenaltyEpisodeSorted = noPenalty
        .map((s, idx) => ({ s, idx, len: s.episodes?.length || 0 }))
        .sort((a, b) => (b.len - a.len) || (a.idx - b.idx))
        .map((x) => x.s);

      return [...noPenaltyEpisodeSorted, ...withPenalty, ...titleNoMatch];
    },
    [
      sortSourcesByValuation,
      getValuationKey,
      normalizeTitle,
      sourceSearchCompleted,
      tt,
    ]
  );

  const pickFirstPlayCandidate = useCallback(
    (candidates: SearchResult[]): SearchResult | null => {
      if (!Array.isArray(candidates) || candidates.length === 0) return null;
      const verifiedSorted = verifyAndSortSources(candidates);
      return (
        verifiedSorted.find(
          (s) => Array.isArray(s.episodes) && s.episodes.length > 0
        ) ||
        verifiedSorted[0] ||
        null
      );
    },
    [verifyAndSortSources]
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

  useEffect(() => {
    const info = actualPlaybackInfoRef.current;
    if (!info || !info.quality) return;
    const providerKey = getValuationKey(currentSourceRef.current);
    if (!providerKey) return;

    const lastQuality =
      lastPersistedProviderQualityRef.current.get(providerKey) || null;
    if (lastQuality === info.quality) return;
    lastPersistedProviderQualityRef.current.set(providerKey, info.quality);

    const existing = precomputedVideoInfoRef.current.get(providerKey);
    const payload: SourceValuationPayload = {
      key: providerKey,
      source: currentSourceRef.current,
      quality: info.quality,
      loadSpeed: existing?.loadSpeed ?? '未知',
      pingTime: existing?.pingTime ?? 0,
      qualityRank: getQualityRank(info.quality),
      speedValue:
        existing?.speedValue ?? parseSpeedToKBps(existing?.loadSpeed ?? '未知'),
      sampleCount: (existing?.sampleCount ?? 0) + 1,
      updated_at: Date.now(),
    };

    setPrecomputedVideoInfo((prev) => {
      const next = new Map(prev);
      next.set(providerKey, {
        quality: payload.quality,
        loadSpeed: payload.loadSpeed,
        pingTime: payload.pingTime,
        qualityRank: payload.qualityRank,
        speedValue: payload.speedValue,
        sampleCount: payload.sampleCount,
        hasError: false,
      });
      precomputedVideoInfoRef.current = next;
      return next;
    });

    void persistSourceValuations([payload]);
  }, [getValuationKey, persistSourceValuations]);

  const probeResolutionsForSources = useCallback(
    async (
      sources: SearchResult[],
      providersWithEmptySources: Map<string, string>,
      providersWithPlayableSources: Set<string>
    ) => {
      const tasks: Promise<void>[] = [];
      const seenProviders = new Set<string>();
      const penalizedProviders = new Set<string>();
      const valuationEntries: SourceValuationPayload[] = [];
      const penaltyEntries: SourceValuationPayload[] = [];

      const providerSamples = new Map<string, SearchResult>();
      sources.forEach((s) => {
        const valKey = getValuationKey(s.source);
        if (!valKey || seenProviders.has(valKey)) return;
        if (!s.episodes || s.episodes.length === 0) return;
        providerSamples.set(valKey, s);
        seenProviders.add(valKey);
      });

      providerSamples.forEach((s, valKey) => {
        const url = s.episodes[0];
        const existing = precomputedVideoInfoRef.current.get(valKey);
        const existingCount = existing?.sampleCount ?? 0;
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
                  sampleCount: existingCount + 1,
                  hasError: false,
                });
                precomputedVideoInfoRef.current = next;
                return next;
              });

              valuationEntries.push({
                key: valKey,
                source: s.source,
                quality: info.quality,
                loadSpeed: info.loadSpeed,
                pingTime: info.pingTime,
                qualityRank: getQualityRank(info.quality),
                speedValue,
                sampleCount: existingCount + 1,
                updated_at: Date.now(),
              });
            } catch {
              if (penalizedProviders.has(valKey)) return;
              penalizedProviders.add(valKey);
              const prevCount =
                precomputedVideoInfoRef.current.get(valKey)?.sampleCount ?? 0;
              const penalty: SourceValuationPayload = {
                key: valKey,
                source: s.source,
                quality: 'Unavailable',
                loadSpeed: 'Unavailable',
                pingTime: Number.MAX_SAFE_INTEGER,
                qualityRank: -1,
                speedValue: 0,
                sampleCount: prevCount + 1,
                updated_at: Date.now(),
              };
              penaltyEntries.push(penalty);
              setPrecomputedVideoInfo((prev) => {
                const next = new Map(prev);
                next.set(valKey, {
                  quality: penalty.quality,
                  loadSpeed: penalty.loadSpeed,
                  pingTime: penalty.pingTime,
                  qualityRank: penalty.qualityRank,
                  speedValue: penalty.speedValue,
                  sampleCount: penalty.sampleCount,
                  hasError: true,
                });
                precomputedVideoInfoRef.current = next;
                return next;
              });
            }
          })()
        );
      });

      // Penalize providers with no playable sources found
      providersWithEmptySources.forEach((sourceName, providerKey) => {
        if (providersWithPlayableSources.has(providerKey)) return;
        if (penalizedProviders.has(providerKey)) return;
        penalizedProviders.add(providerKey);
        const prevCount =
          precomputedVideoInfoRef.current.get(providerKey)?.sampleCount ?? 0;
        penaltyEntries.push({
          key: providerKey,
          source: sourceName,
          quality: 'Unavailable',
          loadSpeed: 'Unavailable',
          pingTime: Number.MAX_SAFE_INTEGER,
          qualityRank: -1,
          speedValue: 0,
          sampleCount: prevCount + 1,
          updated_at: Date.now(),
        });
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
        if (updatedInfoMap) {
          precomputedVideoInfoRef.current = updatedInfoMap;
        }
      }

      if (tasks.length) {
        await Promise.allSettled(tasks);
        const allEntries = [...valuationEntries, ...penaltyEntries];
        if (allEntries.length) {
          void persistSourceValuations(allEntries);
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
  const panelGestureRef = useRef<HTMLDivElement | null>(null);

  const [isVideoLoading, setIsVideoLoading] = useState(true);
  const [videoLoadingStage, setVideoLoadingStage] = useState<
    'initing' | 'sourceChanging'
  >('initing');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [needsUserPlay, setNeedsUserPlay] = useState(false);
  const [needsUserPlayMessage, setNeedsUserPlayMessage] = useState('');
  const needsUserPlayRef = useRef(false);
  useEffect(() => {
    needsUserPlayRef.current = needsUserPlay;
  }, [needsUserPlay]);

  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const autoNextTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const playbackRecoveryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const playbackRecoveryCountRef = useRef(0);
  const lastProgressAtRef = useRef(0);
  const lastProgressTimeRef = useRef(0);
  const stallRecoveryCountRef = useRef(0);
  const playbackListenersCleanupRef = useRef<(() => void) | null>(null);

  const artPlayerRef = useRef<any>(null);
  const [imdbVideoTitle, setImdbVideoTitle] = useState<string | undefined>(
    undefined
  );
  const [imdbVideoId, setImdbVideoId] = useState<string | undefined>(
    undefined
  );
  const [imdbDescription, setImdbDescription] = useState<string | undefined>(
    undefined
  );
  const [tmdbId, setTmdbId] = useState<string | undefined>(undefined);
  const [tmdbSeasons, setTmdbSeasons] = useState<any[]>([]);
  const [tmdbRecommendations, setTmdbRecommendations] = useState<any[]>([]);
  const [omdbData, setOmdbData] = useState<OMDBEnrichment | null>(null);
  const [tvmazeData, setTvmazeData] = useState<TvmazeContribution | null>(null);
  const [clientInfo, setClientInfo] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [forceRotate, setForceRotate] = useState(false);
  const forceRotateStateRef = useRef(false);
  useEffect(() => {
    forceRotateStateRef.current = forceRotate;
  }, [forceRotate]);
  const [inlineFullscreen, setInlineFullscreen] = useState(false);
  const cancelAutoNext = useCallback(() => {
    if (autoNextTimeoutRef.current) {
      clearTimeout(autoNextTimeoutRef.current);
      autoNextTimeoutRef.current = null;
    }
  }, []);
  const hideResumePreview = useCallback(() => {
    const previewEl = resumePreviewElRef.current;
    if (previewEl) {
      previewEl.classList.remove('is-visible');
    }
    if (resumePreviewTimerRef.current) {
      clearTimeout(resumePreviewTimerRef.current);
      resumePreviewTimerRef.current = null;
    }
  }, []);
  const updateResumePreviewPosition = useCallback(() => {
    const player = artPlayerRef.current;
    const previewEl = resumePreviewElRef.current;
    const markerEl = resumePreviewMarkerRef.current;
    if (!player || !previewEl || !markerEl) return;

    const targetEpisode = resumePreviewEpisodeRef.current;
    if (
      typeof targetEpisode === 'number' &&
      targetEpisode !== currentEpisodeIndexRef.current
    ) {
      markerEl.style.display = 'none';
      hideResumePreview();
      return;
    }

    const previewTime = resumePreviewTimeRef.current;
    const duration = player.duration || 0;
    if (!previewTime || !duration) {
      markerEl.style.display = 'none';
      hideResumePreview();
      return;
    }

    const clampedTime = Math.min(Math.max(previewTime, 0), duration);
    if (clampedTime < 2 || clampedTime > duration - 2) {
      markerEl.style.display = 'none';
      hideResumePreview();
      return;
    }

    const progress = player.template?.$progress as HTMLElement | undefined;
    if (!progress) return;

    const ratio = duration > 0 ? clampedTime / duration : 0;
    markerEl.style.display = 'block';
    markerEl.style.left = `${Math.min(100, Math.max(0, ratio * 100))}%`;

    const thumb = previewEl.querySelector(
      '.art-resume-thumb'
    ) as HTMLElement | null;
    const title = previewEl.querySelector(
      '.art-resume-title'
    ) as HTMLElement | null;
    const time = previewEl.querySelector(
      '.art-resume-time'
    ) as HTMLElement | null;
    const poster = player.poster || videoCover || '';
    if (thumb) {
      thumb.style.backgroundImage = poster ? `url("${poster}")` : '';
    }
    if (title) {
      title.textContent = tt('Resume', '续播', '續播');
    }
    if (time) {
      time.textContent = formatTimeLabel(clampedTime);
    }

    const previewWidth = previewEl.offsetWidth || 220;
    const left = progress.clientWidth * ratio - previewWidth / 2;
    const clampedLeft = Math.max(
      8,
      Math.min(progress.clientWidth - previewWidth - 8, left)
    );
    previewEl.style.left = `${clampedLeft}px`;
  }, [formatTimeLabel, hideResumePreview, tt, videoCover]);
  const showResumePreview = useCallback(
    (autoHide: boolean) => {
      if (!resumePreviewTimeRef.current) return;
      updateResumePreviewPosition();
      const previewEl = resumePreviewElRef.current;
      if (!previewEl) return;
      previewEl.classList.add('is-visible');
      if (resumePreviewTimerRef.current) {
        clearTimeout(resumePreviewTimerRef.current);
        resumePreviewTimerRef.current = null;
      }
      if (autoHide) {
        resumePreviewTimerRef.current = setTimeout(() => {
          hideResumePreview();
        }, 2200);
      }
    },
    [hideResumePreview, updateResumePreviewPosition]
  );
  const attachResumePreview = useCallback(
    (player: any) => {
      const progress = player?.template?.$progress as HTMLElement | undefined;
      if (!progress) return () => {};

      const previewEl = document.createElement('div');
      previewEl.className = 'art-resume-preview';
      previewEl.innerHTML =
        '<div class="art-resume-thumb"></div><div class="art-resume-meta"><div class="art-resume-title"></div><div class="art-resume-time"></div></div>';
      progress.appendChild(previewEl);

      const markerEl = document.createElement('div');
      markerEl.className = 'art-resume-marker';
      const inner =
        progress.querySelector('.art-control-progress-inner') || progress;
      inner.appendChild(markerEl);

      resumePreviewElRef.current = previewEl;
      resumePreviewMarkerRef.current = markerEl;

      const handleEnter = () => {
        updateResumePreviewPosition();
        showResumePreview(false);
      };
      const handleMove = () => {
        updateResumePreviewPosition();
      };
      const handleLeave = () => {
        hideResumePreview();
      };

      progress.addEventListener('mouseenter', handleEnter);
      progress.addEventListener('mousemove', handleMove);
      progress.addEventListener('mouseleave', handleLeave);

      updateResumePreviewPosition();

      return () => {
        progress.removeEventListener('mouseenter', handleEnter);
        progress.removeEventListener('mousemove', handleMove);
        progress.removeEventListener('mouseleave', handleLeave);
        previewEl.remove();
        markerEl.remove();
        resumePreviewElRef.current = null;
        resumePreviewMarkerRef.current = null;
      };
    },
    [hideResumePreview, showResumePreview, updateResumePreviewPosition]
  );
  const preconnectToOrigin = useCallback((url: string) => {
    if (typeof document === 'undefined') return;
    let origin: string | null = null;
    try {
      origin = new URL(url).origin;
    } catch {
      return;
    }
    if (!origin || preconnectOriginsRef.current.has(origin)) return;
    preconnectOriginsRef.current.add(origin);

    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = origin;
    preconnect.crossOrigin = 'anonymous';
    document.head.appendChild(preconnect);

    const dnsPrefetch = document.createElement('link');
    dnsPrefetch.rel = 'dns-prefetch';
    dnsPrefetch.href = origin;
    document.head.appendChild(dnsPrefetch);
  }, []);
  const preloadNextEpisodeUrl = useCallback(
    (url: string) => {
      if (!url || preloadedNextUrlRef.current === url) return;
      preloadedNextUrlRef.current = url;
      preconnectToOrigin(url);

      if (!/\.m3u8($|\?)/i.test(url)) {
        return;
      }

      if (preloadNextAbortRef.current) {
        preloadNextAbortRef.current.abort();
      }
      const controller = new AbortController();
      preloadNextAbortRef.current = controller;
      const timeout = setTimeout(() => {
        controller.abort();
      }, 1500);

      fetch(url, {
        method: 'GET',
        mode: 'no-cors',
        credentials: 'omit',
        signal: controller.signal,
      })
        .catch(() => {})
        .finally(() => {
          clearTimeout(timeout);
        });
    },
    [preconnectToOrigin]
  );
  useEffect(() => {
    if (
      typeof resumePreviewEpisodeRef.current === 'number' &&
      resumePreviewEpisodeRef.current !== currentEpisodeIndex
    ) {
      resumePreviewEpisodeRef.current = null;
      resumePreviewTimeRef.current = null;
      hideResumePreview();
    }
  }, [currentEpisodeIndex, hideResumePreview]);
  const currentPlayingInfo = useMemo<CurrentPlayingInfo | null>(() => {
    const bySourceKey =
      precomputedVideoInfo.get(`${currentSource}-${currentId}`) ||
      precomputedVideoInfo.get(getValuationKey(currentSource));
    return bySourceKey || null;
  }, [currentSource, currentId, precomputedVideoInfo, getValuationKey]);
  const [actualPlaybackInfo, setActualPlaybackInfo] =
    useState<ActualPlaybackInfo>(null);
  const hideSidePanels = useMemo(
    () => forceRotate || (isFullscreen && isIOSDevice()),
    [isFullscreen, forceRotate]
  );
  const hideNavInFullscreen = useMemo(
    () => isFullscreen && (forceRotate || isIOSDevice()),
    [isFullscreen, forceRotate]
  );
  const playerHeightClass = useMemo(() => {
    if (forceRotate || (isFullscreen && isIOSDevice())) {
      return 'h-[75vh] lg:h-[90vh]';
    }
    return 'h-[300px] md:h-full lg:h-full';
  }, [forceRotate, isFullscreen]);

  const tvPlayerHeightClass = useMemo(() => {
    if (forceRotate || (isFullscreen && isIOSDevice())) {
      return 'h-[70vh] lg:h-[85vh]';
    }
    return 'h-[54vh] lg:h-[68vh] xl:h-[72vh]';
  }, [forceRotate, isFullscreen]);

  // Tablet/TV swipe gesture to toggle the selector instead of relying on buttons.
  useEffect(() => {
    const el = panelGestureRef.current;
    if (!el || hideSidePanels) return;
    let startX = 0;
    let startY = 0;
    let startTime = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (!e.touches || e.touches.length === 0) return;
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!e.changedTouches || e.changedTouches.length === 0) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const dt = Date.now() - startTime;
      if (dt > 800) return;
      if (Math.abs(dx) <= Math.abs(dy)) return;
      if (Math.abs(dx) < 50) return;
      if (dx < -50) {
        setIsEpisodeSelectorCollapsed(true);
      } else if (dx > 50) {
        setIsEpisodeSelectorCollapsed(false);
      }
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [hideSidePanels]);
  const actualPlaybackInfoRef = useRef(actualPlaybackInfo);
  useEffect(() => {
    actualPlaybackInfoRef.current = actualPlaybackInfo;
  }, [actualPlaybackInfo]);
  const lastPersistedProviderQualityRef = useRef<Map<string, string>>(
    new Map()
  );

  const orientationLockRef = useRef<'landscape' | 'portrait' | null>(null);

  const preferredOrientationForVideo = useCallback(() => {
    const info = actualPlaybackInfoRef.current;
    const w = info?.width || 0;
    const h = info?.height || 0;
    if (w > 0 && h > 0) {
      return w >= h ? 'landscape' : 'portrait';
    }
    if (typeof window !== 'undefined') {
      return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
    }
    return 'landscape';
  }, []);

  const tryLockScreenOrientation = useCallback(
    async (target: 'landscape' | 'portrait') => {
      if (typeof window === 'undefined') return false;
      const orientation: any = (window as any).screen?.orientation;
      if (!orientation || typeof orientation.lock !== 'function') {
        return false;
      }
      const lockType =
        target === 'landscape' ? 'landscape-primary' : 'portrait-primary';
      try {
        if (orientation.type && orientation.type.indexOf(target) >= 0) {
          orientationLockRef.current = target;
          return true;
        }
        const result = orientation.lock(lockType);
        if (result && typeof result.then === 'function') {
          await result;
        }
        orientationLockRef.current = target;
        return true;
      } catch (error) {
        console.warn('Screen orientation lock failed:', error);
        return false;
      }
    },
    []
  );

  const unlockScreenOrientation = useCallback(() => {
    if (typeof window === 'undefined') return;
    const orientation: any = (window as any).screen?.orientation;
    if (orientation && typeof orientation.unlock === 'function') {
      try {
        orientation.unlock();
      } catch (error) {
        console.warn('Screen orientation unlock failed:', error);
      }
    }
    orientationLockRef.current = null;
    setForceRotate(false);
  }, []);

  const autoRotateToFit = useCallback(async () => {
    const supportsLock =
      typeof window !== 'undefined' &&
      !!(window as any).screen &&
      !!(window as any).screen.orientation &&
      typeof (window as any).screen.orientation.lock === 'function';
    if (!supportsLock) {
      const target = preferredOrientationForVideo();
      const viewportIsPortrait =
        typeof window !== 'undefined'
          ? window.innerHeight > window.innerWidth
          : false;
      const needsRotate =
        target === 'landscape' && viewportIsPortrait && isIOSDevice();
      setForceRotate(needsRotate);
      return;
    }
    setForceRotate(false);
    const target = preferredOrientationForVideo();
    const locked = await tryLockScreenOrientation(target);
    if (!locked) {
      console.warn('Auto-rotate to fullscreen orientation not supported here.');
    }
  }, [preferredOrientationForVideo, tryLockScreenOrientation]);

  useEffect(() => {
    return () => {
      unlockScreenOrientation();
    };
  }, [unlockScreenOrientation]);

  const deriveQualityLabelFromDimensions = useCallback((w: number, h: number) => {
    const width = Math.max(0, w || 0);
    const height = Math.max(0, h || 0);
    const maxDim = Math.max(width, height);
    if (maxDim >= 3840 || height >= 2160) return '4K';
    if (maxDim >= 2560 || height >= 1440) return '2K';
    if (maxDim >= 1920 || height >= 1080) return '1080p';
    if (maxDim >= 1280 || height >= 720) return '720p';
    if (maxDim >= 854 || height >= 480) return '480p';
    return maxDim > 0 ? 'SD' : '';
  }, []);

  const refreshActualPlaybackInfo = useCallback(() => {
    const player = artPlayerRef.current;
    const video = player?.video as HTMLVideoElement | undefined;
    if (!video) return;

    let width = video.videoWidth || 0;
    let height = video.videoHeight || 0;
    const hls = (video as any).hls as any;

    const readLevel = () => {
      if (!hls) return undefined;
      const candidates = [hls.currentLevel, hls.loadLevel, hls.nextLevel];
      const found = candidates.find(
        (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0
      );
      return typeof found === 'number' ? found : undefined;
    };

    const level = readLevel();
    if (
      (!width || !height) &&
      hls &&
      Array.isArray(hls.levels) &&
      level !== undefined &&
      level >= 0
    ) {
      const lvl = hls.levels[level];
      if (lvl) {
        width = (lvl.width as number) || width;
        height = (lvl.height as number) || height;
      }
    }

    const quality = deriveQualityLabelFromDimensions(width, height);
    if (!quality) return;

    const next = { width, height, quality, level };
    const prev = actualPlaybackInfoRef.current;
    if (
      prev &&
      prev.width === next.width &&
      prev.height === next.height &&
      prev.quality === next.quality &&
      prev.level === next.level
    ) {
      return;
    }
    setActualPlaybackInfo(next);
  }, [deriveQualityLabelFromDimensions]);
  const localizeInfoLabel = useCallback(
    (value?: string | null) => {
      const normalized = (value || '').trim();
      if (!normalized) return '';
      if (normalized === '未知') return tt('Unknown', '未知', '未知');
      if (normalized === '測量中...') {
        return tt('Measuring…', '测量中…', '測量中…');
      }
      if (normalized === '錯誤') return tt('Error', '错误', '錯誤');
      if (normalized === 'Unavailable') return tt('Unavailable', '不可用', '不可用');
      return normalized;
    },
    [tt]
  );
  const splitOmdbList = useCallback((value?: string) => {
    if (!value) return [];
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }, []);
  const normalizeDetailList = useCallback((value: unknown) => {
    if (Array.isArray(value)) {
      return value
        .map((item) =>
          item === null || item === undefined ? '' : String(item).trim()
        )
        .filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(/[,/]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  }, []);
  const mergeMetadataList = useCallback(
    (primary: string[], fallback: string[]) => {
      if (!primary.length) return fallback;
      if (!fallback.length) return primary;
      const seen = new Set(
        primary.map((item) => item.trim().toLowerCase()).filter(Boolean)
      );
      const merged = [...primary];
      fallback.forEach((item) => {
        const key = item.trim().toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        merged.push(item);
      });
      return merged;
    },
    []
  );
  const metadataLists = useMemo(() => {
    const detailAny = detail as any;
    const detailGenres = normalizeDetailList(detailAny?.genres);
    const detailCountries = normalizeDetailList(detailAny?.countries);
    const detailRegions = normalizeDetailList(detailAny?.regions);
    const detailLanguages = normalizeDetailList(detailAny?.languages);
    const detailDirectors = normalizeDetailList(detailAny?.directors);
    const detailWriters = normalizeDetailList(detailAny?.writers);
    const detailActors = normalizeDetailList(detailAny?.actors);

    return {
      genres: mergeMetadataList(detailGenres, splitOmdbList(omdbData?.genres)),
      regions: mergeMetadataList(
        [...detailCountries, ...detailRegions],
        splitOmdbList(omdbData?.countries)
      ),
      languages: mergeMetadataList(
        detailLanguages,
        splitOmdbList(omdbData?.languages)
      ),
      directors: mergeMetadataList(
        detailDirectors,
        splitOmdbList(omdbData?.directors)
      ),
      writers: mergeMetadataList(
        detailWriters,
        splitOmdbList(omdbData?.writers)
      ),
      actors: mergeMetadataList(detailActors, splitOmdbList(omdbData?.actors)),
    };
  }, [
    detail,
    mergeMetadataList,
    normalizeDetailList,
    omdbData,
    splitOmdbList,
  ]);
  const mergedDurations = useMemo(() => {
    const tvmazeRuntime =
      tvmazeData?.runtime ?? tvmazeData?.averageRuntime ?? null;
    const tvmazeLabel = tvmazeRuntime ? `${tvmazeRuntime} min` : '';
    if (tvmazeLabel) {
      return [tvmazeLabel];
    }
    const detailAny = detail as any;
    const detailDurations = normalizeDetailList(detailAny?.durations);
    if (detailDurations.length > 0) {
      return detailDurations;
    }
    return omdbData?.runtime ? [omdbData.runtime] : [];
  }, [detail, normalizeDetailList, omdbData, tvmazeData]);
  const mergedReleaseDates = useMemo(() => {
    const detailAny = detail as any;
    const detailReleaseDates = normalizeDetailList(detailAny?.releaseDates);
    if (detailReleaseDates.length > 0) {
      return detailReleaseDates;
    }
    return omdbData?.released ? [omdbData.released] : [];
  }, [detail, normalizeDetailList, omdbData]);
  const showOmdbRuntime =
    !!omdbData?.runtime && !mergedDurations.includes(omdbData.runtime);
  const englishVideoTitle =
    imdbVideoTitle || omdbData?.title || undefined;
  const displayVideoTitle = useMemo(
    () => convertToTraditional(videoTitle),
    [videoTitle]
  );
  const displayTitleText =
    displayVideoTitle || tt('Video title', '影片标题', '影片標題');
  const displayTitleWithEnglish = englishVideoTitle
    ? `${displayTitleText} (${englishVideoTitle})`
    : displayTitleText;
  const introTags = useMemo(() => {
    const tags: string[] = [];
    const detailAny = detail as any;
    tags.push(...metadataLists.genres);
    tags.push(...metadataLists.regions);
    tags.push(...metadataLists.languages);
    const detailTags = normalizeDetailList(detailAny?.tags);
    if (detailTags.length) {
      tags.push(...detailTags);
    }
    if (detail?.class) {
      tags.push(detail.class);
    }
    if (detail?.type_name) {
      tags.push(detail.type_name);
    }
    if (omdbData?.rated) {
      tags.push(omdbData.rated);
    }
    if (omdbData?.runtime) {
      tags.push(omdbData.runtime);
    }
    if (detail?.source_name) {
      tags.push(detail.source_name);
    }

    const normalized = Array.from(
      new Set(
        tags
          .map((t) => (convertToTraditional(t) || t || '').trim())
          .filter(Boolean)
      )
    );

    return normalized.slice(0, 12);
  }, [detail, metadataLists, normalizeDetailList, omdbData]);
  const synopsisText =
    detail?.desc?.trim() ||
    imdbDescription?.trim() ||
    omdbData?.plot?.trim() ||
    '';
  const metadataSynopsis = detail?.desc?.trim()
    ? imdbDescription?.trim() || omdbData?.plot?.trim() || ''
    : '';
  const refreshOfflineAvailability = useCallback(
    async (url: string) => {
      if (
        typeof window === 'undefined' ||
        !url ||
        !(window as any).caches ||
        typeof caches?.match !== 'function'
      ) {
        setOfflineUrl(null);
        return;
      }
      try {
        const cache = await caches.open('moontv-downloads');
        const match = await cache.match(url);
        if (!match) {
          setOfflineUrl(null);
          return;
        }
        const blob = await match.blob();
        if (!blob || blob.size === 0) {
          setOfflineUrl(null);
          return;
        }
        if (offlineObjectUrlRef.current) {
          URL.revokeObjectURL(offlineObjectUrlRef.current);
          offlineObjectUrlRef.current = null;
        }
        const objUrl = URL.createObjectURL(blob);
        offlineObjectUrlRef.current = objUrl;
        setOfflineUrl(objUrl);
      } catch (err) {
        console.warn('Check offline cache failed', err);
        setOfflineUrl(null);
      }
    },
    []
  );
  useEffect(() => {
    refreshOfflineAvailability(videoUrl);
    return () => {
      if (offlineObjectUrlRef.current) {
        URL.revokeObjectURL(offlineObjectUrlRef.current);
        offlineObjectUrlRef.current = null;
      }
    };
  }, [videoUrl, refreshOfflineAvailability]);
  const playbackUrl = offlineUrl || videoUrl;
  const supportsAudioOnly = useMemo(
    () => isIOS && Boolean(playbackUrl),
    [isIOS, playbackUrl]
  );
  const downloadStatus = downloadRecord?.status;
  const downloadProgress =
    typeof downloadRecord?.progress === 'number'
      ? Math.max(0, Math.min(100, Math.round(downloadRecord.progress)))
      : null;
  const downloadButtonLabel = useMemo(() => {
    if (downloadStatus === 'preparing') {
      return tt('Preparing…', '准备中…', '準備中…');
    }
    if (downloadStatus === 'queued') {
      return tt('Queued…', '排队中…', '排隊中…');
    }
    if (downloadStatus === 'downloading') {
      if (downloadProgress !== null) {
        return tt(
          `Downloading ${downloadProgress}%`,
          `下载中 ${downloadProgress}%`,
          `下載中 ${downloadProgress}%`
        );
      }
      return tt('Downloading…', '下载中…', '下載中…');
    }
    if (downloadStatus === 'downloaded') {
      return tt('Downloaded', '已下载', '已下載');
    }
    if (downloadStatus === 'error') {
      return tt('Retry download', '重新下载', '重新下載');
    }
    return tt('Download', '下载到本地', '下載到本地');
  }, [downloadProgress, downloadStatus, tt]);
  const downloadButtonDisabled =
    !playbackUrl ||
    downloadStatus === 'preparing' ||
    downloadStatus === 'queued' ||
    downloadStatus === 'downloading' ||
    downloadStatus === 'downloaded';
  const enableAudioOnly = useCallback(async () => {
    if (!playbackUrl) return;
    const audio = audioRef.current;
    if (!audio) return;
    const video = artPlayerRef.current?.video as HTMLVideoElement | undefined;
    if (video && Number.isFinite(video.currentTime)) {
      audio.currentTime = video.currentTime;
    }
    audio.src = playbackUrl;
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    (audio as any).playsInline = true;
    setAudioOnly(true);
    try {
      await audio.play();
    } catch {
      // autoplay might be blocked until user gesture
    }
    if (video) {
      try {
        video.pause();
      } catch {
        // ignore
      }
    }
  }, [playbackUrl]);
  const disableAudioOnly = useCallback(() => {
    const audio = audioRef.current;
    const resumeTime = audio?.currentTime ?? 0;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      try {
        audio.load();
      } catch {
        // ignore
      }
    }
    setAudioOnly(false);
    const video = artPlayerRef.current?.video as HTMLVideoElement | undefined;
    if (video && playbackUrl) {
      if (resumeTime > 0 && Number.isFinite(resumeTime)) {
        try {
          video.currentTime = resumeTime;
        } catch {
          // ignore
        }
      }
      video.play().catch(() => {});
    }
  }, [playbackUrl]);
  useEffect(() => {
    if (!audioOnly) return;
    if (!playbackUrl) {
      setAudioOnly(false);
      return;
    }
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.src !== playbackUrl) {
      audio.src = playbackUrl;
    }
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    (audio as any).playsInline = true;
    audio.play().catch(() => {
      // ignore autoplay errors
    });
    const video = artPlayerRef.current?.video as HTMLVideoElement | undefined;
    if (video) {
      try {
        video.pause();
      } catch {
        // ignore
      }
    }
  }, [audioOnly, playbackUrl]);
  useEffect(() => {
    if (!supportsAudioOnly && audioOnly) {
      disableAudioOnly();
    }
  }, [audioOnly, disableAudioOnly, supportsAudioOnly]);
  useEffect(() => {
    if (audioOnly) {
      setNeedsUserPlay(false);
      setIsBuffering(false);
    }
  }, [audioOnly]);
  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
      }
    };
  }, []);
  const handleDownload = useCallback(async () => {
    if (!videoUrl) {
      reportError(
        tt('No playable source to download.', '暂无可下载的播放源。', '暫無可下載的播放源。'),
        'playback'
      );
      return;
    }
    const baseTitle =
      displayTitleWithEnglish || videoTitleRef.current || searchTitle || 'Video';
    const epLabel =
      (detail?.episodes?.length || 0) > 1
        ? `${tt('Episode', '第', '第')} ${currentEpisodeIndex + 1}`
        : '';
    const recordTitle = [baseTitle, epLabel].filter(Boolean).join(' - ');
    const baseKey =
      currentSourceRef.current && currentIdRef.current
        ? generateStorageKey(currentSourceRef.current, currentIdRef.current)
        : `video:${videoUrl}`;
    const downloadKey = `${baseKey}:${currentEpisodeIndexRef.current}`;
    upsertDownloadRecord(downloadKey, {
      title: recordTitle,
      url: '',
      ts: Date.now(),
      status: 'downloading',
      progress: 0,
      offline: false,
    });

    const safeName = `${recordTitle || 'video'}`.replace(/[\\/:*?"<>|]+/g, '_');
    const triggerDownload = (href: string, name?: string) => {
      const a = document.createElement('a');
      a.href = href;
      if (name) a.download = name;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => a.remove(), 0);
    };

    const looksLikeM3u8 = videoUrl.toLowerCase().includes('.m3u8');
    if (looksLikeM3u8 && !configJsonBase) {
      upsertDownloadRecord(downloadKey, {
        status: 'error',
        progress: 0,
      });
      reportError(
        tt(
          'CONFIGJSON is not set for yt-dlp streaming.',
          '未配置 CONFIGJSON，无法使用 yt-dlp 下载。',
          '未配置 CONFIGJSON，無法使用 yt-dlp 下載。'
        ),
        'playback'
      );
      return;
    }

    if (looksLikeM3u8 && configJsonBase) {
      const streamUrl = new URL(
        `${configJsonBase}/posters/yt-dlp-stream.php`
      );
      streamUrl.searchParams.set('url', videoUrl);
      streamUrl.searchParams.set('name', safeName);
      triggerDownload(streamUrl.toString());
      upsertDownloadRecord(downloadKey, {
        url: streamUrl.toString(),
        status: 'downloaded',
        progress: 100,
      });
      return;
    }

    if (!videoUrl) {
      upsertDownloadRecord(downloadKey, {
        status: 'error',
        progress: 0,
      });
      reportError(
        tt('No playable source to download.', '暂无可下载的播放源。', '暫無可下載的播放源。'),
        'playback'
      );
      return;
    }

    triggerDownload(videoUrl, `${safeName}.mp4`);
    upsertDownloadRecord(downloadKey, {
      url: videoUrl,
      status: 'downloaded',
      progress: 100,
    });
    return;
  }, [
    configJsonBase,
    videoUrl,
    displayTitleWithEnglish,
    searchTitle,
    detail?.episodes?.length,
    currentEpisodeIndex,
    upsertDownloadRecord,
    tt,
    reportError,
  ]);
  const handleTogglePlayback = useCallback(() => {
    if (artPlayerRef.current) {
      artPlayerRef.current.toggle();
    }
  }, []);
  const imdbLink =
    imdbVideoId && /^tt\d{5,}$/i.test(imdbVideoId)
      ? `https://www.imdb.com/title/${imdbVideoId}/`
      : undefined;
  const tmdbLink =
    tmdbId && tmdbId.startsWith('tmdb:')
      ? `https://www.themoviedb.org/tv/${tmdbId.replace('tmdb:', '')}`
      : undefined;
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const artRef = useRef<HTMLDivElement | null>(null);
  const autoErrorRecoveryRef = useRef(false);
  const rotateFullscreenRef = useRef(false);
  const scrollSidebarIntoView = useCallback(() => {
    if (typeof window === 'undefined') return;
    const node = sidebarRef.current;
    if (!node) return;
    try {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch {
      const rect = node.getBoundingClientRect();
      window.scrollTo({
        top: window.scrollY + rect.top - 16,
        behavior: 'smooth',
      });
    }
  }, []);
  const scrollPlayerIntoView = useCallback(() => {
    if (typeof window === 'undefined') return;
    const node = artRef.current;
    if (!node) return;
    try {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch {
      const rect = node.getBoundingClientRect();
      window.scrollTo({
        top: window.scrollY + rect.top - 24,
        behavior: 'smooth',
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelAutoNext();
    };
  }, [cancelAutoNext]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const lock = forceRotate && isIOSDevice();
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyPos = body.style.position;
    const prevBodyWidth = body.style.width;

    if (lock) {
      html.style.overflow = 'hidden';
      body.style.overflow = 'hidden';
      body.style.position = 'fixed';
      body.style.width = '100%';
    }

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.position = prevBodyPos;
      body.style.width = prevBodyWidth;
    };
  }, [forceRotate]);

  useEffect(() => {
    let cancelled = false;
    const fetchImdbDesc = async () => {
      if (!imdbVideoId || !/^tt\d{5,}$/i.test(imdbVideoId)) {
        setImdbDescription(undefined);
        return;
      }
      try {
        const res = await fetch(`/api/imdb?id=${encodeURIComponent(imdbVideoId)}`, {
          cache: 'force-cache',
        });
        if (!res.ok) return;
        const data = (await res.json()) as { description?: string };
        if (!cancelled) {
          setImdbDescription(data.description?.trim() || undefined);
        }
      } catch {
        if (!cancelled) setImdbDescription(undefined);
      }
    };
    void fetchImdbDesc();
    return () => {
      cancelled = true;
    };
  }, [imdbVideoId]);

  useEffect(() => {
    let cancelled = false;
    const fetchTmdb = async () => {
      if (!imdbVideoId || totalEpisodes <= 1) {
        setTmdbSeasons([]);
        setTmdbRecommendations([]);
        setTmdbId(undefined);
        return;
      }
      try {
        const res = await fetch(
          `/api/tmdb/season?imdbId=${encodeURIComponent(imdbVideoId)}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setTmdbId(data?.tmdbId || undefined);
        setTmdbSeasons(Array.isArray(data?.seasons) ? data.seasons : []);
        setTmdbRecommendations(
          Array.isArray(data?.recommendations) ? data.recommendations : []
        );
      } catch {
        if (!cancelled) {
          setTmdbId(undefined);
          setTmdbSeasons([]);
          setTmdbRecommendations([]);
        }
      }
    };
    void fetchTmdb();
    return () => {
      cancelled = true;
    };
  }, [imdbVideoId, totalEpisodes]);

  useEffect(() => {
    let cancelled = false;
    const fetchOmdb = async () => {
      if (!imdbVideoId) {
        setOmdbData(null);
        return;
      }
      try {
        const data = await getOMDBData(imdbVideoId);
        if (cancelled) return;
        setOmdbData(data);
      } catch (error) {
        console.warn('OMDb enrichment error:', error);
        if (!cancelled) {
          setOmdbData(null);
        }
      }
    };
    void fetchOmdb();
    return () => {
      cancelled = true;
    };
  }, [imdbVideoId]);

  useEffect(() => {
    let cancelled = false;
    const fetchTvmaze = async () => {
      if (!imdbVideoId && !tmdbId) {
        setTvmazeData(null);
        return;
      }
      try {
        const data = await getTvmazeContribution({
          imdbId: imdbVideoId,
          tmdbId,
        });
        if (cancelled) return;
        setTvmazeData(data);
      } catch (error) {
        console.warn('TVmaze enrichment error:', error);
        if (!cancelled) {
          setTvmazeData(null);
        }
      }
    };
    void fetchTvmaze();
    return () => {
      cancelled = true;
    };
  }, [imdbVideoId, tmdbId]);

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
    score += qualityScore * 0.5;

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
    score += speedScore * 0.3;

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
      if (offlineObjectUrlRef.current) {
        URL.revokeObjectURL(offlineObjectUrlRef.current);
        offlineObjectUrlRef.current = null;
      }
      setOfflineUrl(null);
      setVideoUrl(newUrl);
    }
  };

  const ensureVideoSource = (video: HTMLVideoElement | null, url: string) => {
    if (!video || !url) return;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
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

  const clearPlaybackRecoveryTimer = useCallback(() => {
    if (playbackRecoveryTimerRef.current) {
      clearTimeout(playbackRecoveryTimerRef.current);
      playbackRecoveryTimerRef.current = null;
    }
  }, []);

  const attemptUserPlay = useCallback(
    async (reason: string) => {
      const player = artPlayerRef.current;
      if (!player) return;
      if (!player.paused && !player.ended) {
        setNeedsUserPlay(false);
        return;
      }

      const tryPlay = async () => {
        const playPromise = player.play?.();
        if (playPromise && typeof playPromise.then === 'function') {
          await playPromise;
        }
      };

      const prevMuted = Boolean(player.muted);
      const prevVolume = typeof player.volume === 'number' ? player.volume : null;
      const allowUnmute = reason === 'user';

      try {
        if (allowUnmute) {
          if (player.muted) {
            player.muted = false;
          }
          if (typeof player.volume === 'number') {
            player.volume = Math.max(player.volume, lastVolumeRef.current || 0.7);
          }
        }
        await tryPlay();
        pendingUnmuteRef.current = false;
        pendingUnmuteVolumeRef.current = null;
        setNeedsUserPlay(false);
        return;
      } catch {
        // fall through
      }

      if (!allowUnmute && !player.muted) {
        try {
          player.muted = true;
          await tryPlay();
          pendingUnmuteRef.current = !prevMuted;
          pendingUnmuteVolumeRef.current = prevVolume;
          setNeedsUserPlay(false);
          return;
        } catch {
          // fall through
        }
      }

      if (prevMuted !== player.muted) {
        try {
          player.muted = prevMuted;
        } catch {
          // ignore
        }
      }

      setNeedsUserPlay(true);
      setNeedsUserPlayMessage(
        tt('Tap to resume playback', '点击继续播放', '點擊繼續播放')
      );
      console.log(`Attempted playback (${reason})`);
    },
    [tt]
  );

  const schedulePlaybackRecovery = useCallback(
    (reason: string) => {
      const video = artPlayerRef.current?.video as HTMLVideoElement | undefined;
      if (!video) return;
      if (playbackRecoveryTimerRef.current) return;
      const attempt = playbackRecoveryCountRef.current;
      if (attempt >= 3) return;
      const delay = 500 + attempt * 700;
      playbackRecoveryTimerRef.current = setTimeout(() => {
        playbackRecoveryTimerRef.current = null;
        playbackRecoveryCountRef.current += 1;
        try {
          const hls = (video as any).hls;
          if (hls && typeof hls.startLoad === 'function') {
            hls.startLoad();
          }
        } catch {
          // ignore
        }
        try {
          video.load();
        } catch {
          // ignore
        }
        attemptUserPlay(`recover:${reason}`);
      }, delay);
    },
    [attemptUserPlay]
  );

  const resetPlaybackRecovery = useCallback(() => {
    playbackRecoveryCountRef.current = 0;
    clearPlaybackRecoveryTimer();
    setIsBuffering(false);
  }, [clearPlaybackRecoveryTimer]);

  const attachPlaybackReliabilityHandlers = useCallback(
    (video: HTMLVideoElement) => {
      const onWaiting = () => {
        setIsBuffering(true);
        schedulePlaybackRecovery('waiting');
      };
      const onStalled = () => {
        setIsBuffering(true);
        schedulePlaybackRecovery('stalled');
      };
      const onPlaying = () => {
        setIsBuffering(false);
        setNeedsUserPlay(false);
        resetPlaybackRecovery();
      };
      const onCanPlay = () => {
        setIsBuffering(false);
        resetPlaybackRecovery();
      };
      const onError = () => {
        schedulePlaybackRecovery('error');
      };

      video.addEventListener('waiting', onWaiting);
      video.addEventListener('stalled', onStalled);
      video.addEventListener('playing', onPlaying);
      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('error', onError);

      return () => {
        video.removeEventListener('waiting', onWaiting);
        video.removeEventListener('stalled', onStalled);
        video.removeEventListener('playing', onPlaying);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
      };
    },
    [resetPlaybackRecovery, schedulePlaybackRecovery]
  );

  const handleUserPlay = useCallback(() => {
    setNeedsUserPlay(false);
    setIsBuffering(false);
    const player = artPlayerRef.current;
    if (player && pendingUnmuteRef.current) {
      try {
        player.muted = false;
        if (
          pendingUnmuteVolumeRef.current !== null &&
          typeof player.volume === 'number'
        ) {
          player.volume = pendingUnmuteVolumeRef.current;
        }
      } catch {
        // ignore
      }
      pendingUnmuteRef.current = false;
      pendingUnmuteVolumeRef.current = null;
    }
    attemptUserPlay('user');
  }, [attemptUserPlay]);

  function filterAdsFromM3U8(m3u8Content: string): string {
    if (!m3u8Content) return '';

    const lines = m3u8Content.split('\n');
    const output: string[] = [];
    let inAdBlock = false;
    let pendingDiscontinuities = 0;
    let skippedDuration = 0;
    let resumeAfterSegment = false;
    let adDurationLimit = 3;
    let lastOutputWasExtinf = false;
    let lastExtinfIndex: number | null = null;
    const MAX_AD_SECONDS = 90;
    const MAX_SKIP_SECONDS = 20;
    let expectingSegment = false;

    const resetAdBlock = () => {
      inAdBlock = false;
      skippedDuration = 0;
      resumeAfterSegment = false;
      adDurationLimit = 3;
      while (pendingDiscontinuities > 0) {
        output.push('#EXT-X-DISCONTINUITY');
        pendingDiscontinuities -= 1;
      }
      expectingSegment = false;
    };

    const parseDateRangeDuration = (line: string) => {
      const durationMatch = line.match(/DURATION=([0-9.]+)/i);
      if (durationMatch) {
        const value = Number(durationMatch[1]);
        return Number.isFinite(value) && value > 0 ? value : null;
      }
      const startMatch = line.match(/START-DATE="?([^",]+)"?/i);
      const endMatch = line.match(/END-DATE="?([^",]+)"?/i);
      if (startMatch && endMatch) {
        const start = Date.parse(startMatch[1]);
        const end = Date.parse(endMatch[1]);
        if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
          return (end - start) / 1000;
        }
      }
      return null;
    };

    const isAdDateRange = (line: string) => {
      return (
        line.startsWith('#EXT-X-DATERANGE') &&
        (/CLASS="com\.apple\.hls\.interstitial"/i.test(line) ||
          /SCTE35-OUT/i.test(line) ||
          /X-(ASSET|AD)-/i.test(line))
      );
    };

    const isAdStart = (line: string) => {
      return (
        line.startsWith('#EXT-X-CUE-OUT') ||
        line.startsWith('#EXT-X-CUE-OUT-CONT') ||
        line.startsWith('#EXT-X-SCTE35-OUT') ||
        line.startsWith('#EXT-X-PLACEMENT-OPPORTUNITY') ||
        line.startsWith('#EXT-OATCLS-SCTE35') ||
        line.startsWith('#EXT-X-GOOGLE-CUE-OUT') ||
        line.startsWith('#EXT-X-MEDIA-TAILOR-AD') ||
        line.startsWith('#EXT-X-MEDIA-TAILOR-SIGNAL') ||
        line.startsWith('#EXT-X-FREEWHEEL-AD') ||
        line.startsWith('#EXT-X-TV-TIMELINE') ||
        line.startsWith('#EXT-X-TIMELINE-OFFSET') ||
        isAdDateRange(line) ||
        line.startsWith('#EXT-X-AD') ||
        line.startsWith('#EXT-X-COMCAST-AD')
      );
    };

    const isAdUrl = (line: string) => {
      if (!line || line.startsWith('#')) return false;
      return /adserver\.com|doubleclick\.net/i.test(line);
    };

    const isAdEnd = (line: string) => {
      return (
        line.startsWith('#EXT-X-CUE-IN') ||
        line.startsWith('#EXT-X-SCTE35-IN') ||
        line.startsWith('#EXT-X-GOOGLE-CUE-IN')
      );
    };

    const shouldAlwaysKeep = (line: string) => {
      return (
        line.startsWith('#EXTM3U') ||
        line.startsWith('#EXT-X-VERSION') ||
        line.startsWith('#EXT-X-TARGETDURATION') ||
        line.startsWith('#EXT-X-MEDIA-SEQUENCE') ||
        line.startsWith('#EXT-X-PROGRAM-DATE-TIME') ||
        line.startsWith('#EXT-X-KEY')
      );
    };

    const CONSERVATIVE_MODE = true;
    if (CONSERVATIVE_MODE) {
      const safeOutput: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const line = rawLine.trim();
        if (isAdStart(line) || isAdEnd(line)) {
          continue;
        }
        safeOutput.push(rawLine);
      }
      return safeOutput.join('\n');
    }

    const nextNonEmptyLines: string[] = Array(lines.length).fill('');
    const nextSegmentLines: string[] = Array(lines.length).fill('');
    let lastNonEmpty = '';
    let lastSegment = '';
    for (let i = lines.length - 1; i >= 0; i--) {
      const t = lines[i].trim();
      if (t) lastNonEmpty = t;
      if (t && !t.startsWith('#')) lastSegment = t;
      nextNonEmptyLines[i] = lastNonEmpty;
      nextSegmentLines[i] = lastSegment;
    }

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.trim();
      const nextNonEmpty = nextNonEmptyLines[i + 1] || '';
      const nextSegment = nextSegmentLines[i + 1] || '';

      if (isAdStart(line)) {
        inAdBlock = true;
        skippedDuration = 0;
        resumeAfterSegment = false;
        const rangeDuration = line.startsWith('#EXT-X-DATERANGE')
          ? parseDateRangeDuration(line)
          : null;
        if (rangeDuration && Number.isFinite(rangeDuration)) {
          adDurationLimit = Math.max(3, Math.round(rangeDuration));
        } else {
          adDurationLimit = 3;
        }
        continue;
      }

      if (isAdEnd(line)) {
        resetAdBlock();
        continue;
      }

      if (inAdBlock) {
        if (shouldAlwaysKeep(line)) {
          output.push(rawLine);
          lastOutputWasExtinf = false;
          lastExtinfIndex = null;
          continue;
        }
        if (line.startsWith('#EXTINF:')) {
          lastExtinfIndex = output.length;
          expectingSegment = true;
          const match = line.match(/#EXTINF:([\d.]+)/);
          const duration = match ? Number(match[1]) : 0;
          if (Number.isFinite(duration)) {
            const projected = skippedDuration + duration;
            if (projected > MAX_SKIP_SECONDS) {
              resetAdBlock();
              output.push(rawLine);
              lastOutputWasExtinf = true;
              lastExtinfIndex = output.length - 1;
              expectingSegment = true;
              continue;
            }
            skippedDuration = projected;
          }
          if (skippedDuration >= MAX_AD_SECONDS) {
            resetAdBlock();
            continue;
          }
          if (skippedDuration >= adDurationLimit) {
            resumeAfterSegment = true;
          }
          continue;
        }
        if (line.startsWith('#EXT-X-DISCONTINUITY')) {
          pendingDiscontinuities += 1;
          continue;
        }
        if (resumeAfterSegment) {
          if (!line.startsWith('#') && expectingSegment) {
            resetAdBlock();
            output.push('#EXTINF:0,');
            output.push(rawLine);
            expectingSegment = false;
          }
          continue;
        }
        continue;
      }

      // Soft ad URL filter: only drop if it looks like a segment and is near ad markers
      if (isAdUrl(line) && lastOutputWasExtinf) {
        const likelyAdContext =
          isAdStart(nextNonEmpty) ||
          isAdEnd(nextNonEmpty) ||
          nextNonEmpty.startsWith('#EXT-X-DISCONTINUITY') ||
          isAdUrl(nextSegment);
        if (likelyAdContext) {
          if (lastExtinfIndex !== null) {
            output.splice(lastExtinfIndex, 1);
            lastExtinfIndex = null;
          }
          lastOutputWasExtinf = false;
          continue;
        }
      }

      output.push(rawLine);
      if (line.startsWith('#EXTINF:')) {
        lastExtinfIndex = output.length - 1;
        lastOutputWasExtinf = true;
        expectingSegment = true;
      } else {
        lastOutputWasExtinf = false;
        if (!line.startsWith('#')) {
          lastExtinfIndex = null;
          expectingSegment = false;
        }
      }
    }

    return output.join('\n');
  }

  function filterAdsFromM3U8Simple(m3u8Content: string): string {
    if (!m3u8Content) return '';

    const lines = m3u8Content.split('\n');
    const filteredLines: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (
        line.includes('adserver.com') ||
        line.includes('doubleclick.net') ||
        line.startsWith('#EXT-X-DISCONTINUITY')
      ) {
        continue;
      }
      filteredLines.push(lines[i]);
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
              response.data =
                blockAdModeRef.current === 'simple'
                  ? filterAdsFromM3U8Simple(response.data)
                  : filterAdsFromM3U8(response.data);
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
    if (!detail?.episodes || detail.episodes.length === 0) return;
    const nextIndex = currentEpisodeIndex + 1;
    if (nextIndex >= detail.episodes.length) return;
    const nextUrl = detail.episodes[nextIndex];
    if (!nextUrl) return;
    preloadNextEpisodeUrl(nextUrl);
  }, [currentEpisodeIndex, detail, preloadNextEpisodeUrl]);

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
        setSourceSearchError(tt('Search failed', '搜索失败', '搜尋失敗'));
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
      const providersWithPlayableSources = new Set<string>();
      const providersWithEmptySources = new Map<string, string>();

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
        setLoadingMessage(
          tt(
            '✨ Ready. Starting playback…',
            '✨ 准备就绪，即将开始播放…',
            '✨ 準備就緒，即將開始播放...'
          )
        );

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

        newSources.forEach((source) => {
          const key = getValuationKey(source.source);
          if (!key) return;
          if (Array.isArray(source.episodes) && source.episodes.length > 0) {
            providersWithPlayableSources.add(key);
            return;
          }
          if (!providersWithEmptySources.has(key)) {
            providersWithEmptySources.set(key, source.source);
          }
        });

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
              if (firstPlayProviderSetRef.current.has(key)) return;
              const bestFromProvider = pickBestInitialCandidate(items);
              if (!bestFromProvider) return;
              firstPlayProviderSetRef.current.add(key);
              if (next.length < FIRST_PLAY_CANDIDATE_LIMIT) {
                next.push(bestFromProvider);
              }
            });
            if (next.length !== firstPlayCandidatesRef.current.length) {
              const limited = next.slice(0, FIRST_PLAY_CANDIDATE_LIMIT);
              firstPlayCandidatesRef.current = limited;
              setFirstPlayCandidates(limited);
            }
          }

          const providerThresholdReached =
            firstPlayProviderSetRef.current.size >= FIRST_PLAY_CANDIDATE_LIMIT;
          const candidatesNow = firstPlayCandidatesRef.current;
          if (
            providerThresholdReached &&
            candidatesNow.length > 0 &&
            !initialPlaybackChosenRef.current
          ) {
            const picked = pickFirstPlayCandidate(
              candidatesNow.slice(0, FIRST_PLAY_CANDIDATE_LIMIT)
            );
            if (picked) {
              initializePlayback(picked);
            }
          }
        }

      }

      // Skip penalizing empty providers to avoid inflating failed samples

      // No penalty entries pushed; only successful probes persist

      setSourceSearchLoading(false);
      setSourceSearchCompleted(true);
      fetchStoredValuations(allSources);
      await probeResolutionsForSources(
        allSources,
        providersWithEmptySources,
        providersWithPlayableSources
      );
      setAvailableSources(() => {
        const finalSorted = verifyAndSortSources(allSources);
        availableSourcesRef.current = finalSorted;

        // Persist any cached valuations for the providers we just listed
        const entries: SourceValuationPayload[] = [];
        const seenValKeys = new Set<string>();
        finalSorted.forEach((s) => {
          const valKey = getValuationKey(s.source);
          if (!valKey || seenValKeys.has(valKey)) return;
          seenValKeys.add(valKey);
          const info = precomputedVideoInfoRef.current.get(valKey);
          if (!info) return;
          const qualityRank = info.qualityRank ?? getQualityRank(info.quality);
          const speedValue =
            info.speedValue ?? parseSpeedToKBps(info.loadSpeed || '未知');
          const hasMetrics =
            qualityRank > 0 || speedValue > 0 || (info.pingTime ?? 0) > 0;
          if (!hasMetrics) return;
          entries.push({
            key: valKey,
            source: s.source,
            quality: info.quality,
            loadSpeed: info.loadSpeed || '未知',
            pingTime: info.pingTime ?? 0,
            qualityRank,
            speedValue,
            sampleCount: info.sampleCount ?? 1,
            updated_at: Date.now(),
          });
        });
        if (entries.length) {
          void persistSourceValuations(entries);
        }

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
        const picked = pickFirstPlayCandidate(
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
          setLoadingMessage(
            tt(
              'No playable sources found',
              '未找到可用的播放来源',
              '未找到可用的播放來源'
            )
          );
          reportError(
            tt(
              'No playable sources found',
              '未找到可用的播放来源',
              '未找到可用的播放來源'
            ),
            'search'
          );
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
        reportError(
          tt(
            'Missing required parameters',
            '缺少必要参数',
            '缺少必要參數'
          ),
          'params'
        );
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadingStage(currentSource && currentId ? 'fetching' : 'searching');
      setLoadingMessage(
        currentSource && currentId
          ? tt(
              '🎬 Getting video info…',
              '🎬 正在获取视频信息…',
              '🎬 正在取得影片資訊…'
            )
          : tt(
              '🔍 Searching player resources…',
              '🔍 正在搜索播放资源…',
              '🔍 正在搜尋播放資源…'
            )
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
          setResumePreviewTime(targetTime, targetIndex);
        }
      } catch (err) {
        console.error('讀取播放紀錄失敗:', err);
      }
    };

    initFromHistory();
  }, []);

  const handleSourceChange = useCallback(
    async (
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

        // Do not delete the previous play record when switching providers; play records
        // are merged/deduped by video identity (douban/imdb/title+year) on save.

        const newDetail = availableSourcesRef.current.find(
          (source) => source.source === newSource && source.id === newId
        );
        if (!newDetail) {
          reportError(
            tt('No matching result found', '未找到匹配结果', '未找到匹配結果'),
            'source'
          );
          return;
        }

        failedSourcesRef.current.delete(getValuationKey(newSource));

        let targetIndex = currentEpisodeIndexRef.current;

        if (!newDetail.episodes || targetIndex >= newDetail.episodes.length) {
          targetIndex = 0;
        }

        if (targetIndex !== currentEpisodeIndexRef.current) {
          resumeTimeRef.current = 0;
          setResumePreviewTime(0, targetIndex);
        } else if (
          (!resumeTimeRef.current || resumeTimeRef.current === 0) &&
          currentPlayTime > 1
        ) {
          resumeTimeRef.current = currentPlayTime;
          setResumePreviewTime(currentPlayTime, targetIndex);
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
        reportError(
          err instanceof Error
            ? err.message
            : tt('Failed to switch source', '换源失败', '換源失敗'),
          'source'
        );
      }
    },
    [getValuationKey, reportError, setResumePreviewTime, tt]
  );

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
      reportError(
        tt(
          'Current source unavailable, switching to another source…',
          '当前播放来源不可用，自动切换其他来源…',
          '當前播放來源不可用，自動切換其他來源…'
        ),
        'source'
      );
      handleSourceChange(nextSource.source, nextSource.id, nextSource.title, {
        auto: true,
        allowDuringPlayback: true,
      });
      return true;
    }

    reportError(
      tt(
        'Current source unavailable. Please choose another source.',
        '当前播放来源不可用，请手动选择其他来源',
        '當前播放來源不可用，請手動選擇其他來源'
      ),
      'source'
    );
    return false;
  }, [getValuationKey, handleSourceChange, tt]);

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

    const isAppleTouch =
      /iphone|ipad|ipod/.test(ua) ||
      (((navigator as any).platform || '').toLowerCase() === 'macintel' &&
        (navigator as any).maxTouchPoints > 1);
    const os = (() => {
      if (/windows nt/.test(ua)) return 'Windows';
      if (/android/.test(ua)) return 'Android';
      if (isAppleTouch) return 'iOS/iPadOS';
      if (/mac os x/.test(ua)) return 'macOS';
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
        case 'iOS/iPadOS':
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
    if (
      isTvVariant &&
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
    ) {
      return;
    }

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
        lastManualSeekAtRef.current = Date.now();
        artPlayerRef.current.currentTime -= 10;
        e.preventDefault();
      }
    }

    if (!e.altKey && e.key === 'ArrowRight') {
      if (
        artPlayerRef.current &&
        artPlayerRef.current.currentTime < artPlayerRef.current.duration - 5
      ) {
        lastManualSeekAtRef.current = Date.now();
        artPlayerRef.current.currentTime += 10;
        e.preventDefault();
      }
    }

    if (e.key === 'ArrowUp') {
      if (artPlayerRef.current && artPlayerRef.current.volume < 1) {
        artPlayerRef.current.volume =
          Math.round((artPlayerRef.current.volume + 0.1) * 10) / 10;
        artPlayerRef.current.notice.show = tt(
          `Volume: ${Math.round(artPlayerRef.current.volume * 100)}`,
          `音量：${Math.round(artPlayerRef.current.volume * 100)}`,
          `音量：${Math.round(artPlayerRef.current.volume * 100)}`
        );
        e.preventDefault();
      }
    }

    if (e.key === 'ArrowDown') {
      if (artPlayerRef.current && artPlayerRef.current.volume > 0) {
        artPlayerRef.current.volume =
          Math.round((artPlayerRef.current.volume - 0.1) * 10) / 10;
        artPlayerRef.current.notice.show = tt(
          `Volume: ${Math.round(artPlayerRef.current.volume * 100)}`,
          `音量：${Math.round(artPlayerRef.current.volume * 100)}`,
          `音量：${Math.round(artPlayerRef.current.volume * 100)}`
        );
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
      if (playbackListenersCleanupRef.current) {
        playbackListenersCleanupRef.current();
        playbackListenersCleanupRef.current = null;
      }
      clearPlaybackRecoveryTimer();
    };
  }, [clearPlaybackRecoveryTimer]);

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
          imdbId: imdbVideoId,
          imdbTitle: imdbVideoTitle,
          douban_id: detailRef.current?.douban_id,
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
      !playbackUrl ||
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
      reportError(
        tt(
          `Invalid episode index. Total: ${totalEpisodes}`,
          `选集索引无效，目前共 ${totalEpisodes} 集`,
          `選集索引無效，目前共 ${totalEpisodes} 集`
        ),
        'params'
      );
      return;
    }

    if (!playbackUrl) {
      reportError(tt('Invalid video URL', '视频地址无效', '影片地址無效'), 'playback');
      return;
    }
    console.log(playbackUrl);

    const isWebkit =
      typeof window !== 'undefined' &&
      typeof (window as any).webkitConvertPointFromNodeToPage === 'function';
    const isIOS =
      typeof navigator !== 'undefined' &&
      ((/iphone|ipad|ipod/i.test(navigator.userAgent) ||
        // iPadOS 13+ reports as MacIntel
        ((navigator as any).platform === 'MacIntel' &&
          (navigator as any).maxTouchPoints > 1)) as boolean);
    const isIOSMobile =
      typeof navigator !== 'undefined' &&
      /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (!isWebkit && artPlayerRef.current) {
      if (typeof artPlayerRef.current.switchUrl === 'function') {
        artPlayerRef.current.switchUrl(playbackUrl);
      } else {
        artPlayerRef.current.switch = playbackUrl;
      }
      artPlayerRef.current.title = tt(
        `${displayTitleWithEnglish} - Episode ${currentEpisodeIndex + 1}`,
        `${displayTitleWithEnglish} - 第 ${currentEpisodeIndex + 1} 集`,
        `${displayTitleWithEnglish} - 第 ${currentEpisodeIndex + 1} 集`
      );
      artPlayerRef.current.poster = videoCover;
      if (artPlayerRef.current?.video) {
        ensureVideoSource(
          artPlayerRef.current.video as HTMLVideoElement,
          playbackUrl
        );
      }
      refreshActualPlaybackInfo();
      return;
    }

    if (artPlayerRef.current) {
      if (resumePreviewCleanupRef.current) {
        resumePreviewCleanupRef.current();
        resumePreviewCleanupRef.current = null;
      }
      if (playbackListenersCleanupRef.current) {
        playbackListenersCleanupRef.current();
        playbackListenersCleanupRef.current = null;
      }
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
        url: playbackUrl,
        poster: videoCover,
        volume: 0.7,
        isLive: false,
        // Start paused; user gesture required to play.
        muted: false,
        autoplay: false,
        pip: true,
        autoSize: false,
        autoMini: false,
        screenshot: false,
        setting: true,
        loop: false,
        flip: false,
        playbackRate: true,
        aspectRatio: false,
        fullscreen: true, // allow native fullscreen
        fullscreenWeb: !isIOS, // prefer native on iOS
        subtitleOffset: false,
        miniProgressBar: false,
        mutex: true,
        playsInline: true,
        autoPlayback: false,
        airplay: true,
        theme: '#22c55e',
        lang:
          uiLocale === 'zh-Hans'
            ? 'zh-cn'
            : uiLocale === 'zh-Hant'
            ? 'zh-tw'
            : 'en',
        hotkey: false,
        fastForward: false,
        autoOrientation: true,
        lock: true,
        moreVideoAttr: ({
          crossOrigin: 'anonymous',
          playsInline: true,
          preload: 'auto',
          'webkit-playsinline': 'true',
        } as any),
        customType: {
          m3u8: function (video: HTMLVideoElement, url: string) {
            // iOS Safari (and other non-MSE browsers) should use native HLS playback.
            // Hls.js requires MediaSource Extensions; fallback to video.src when unsupported.
            const canUseHlsJs = Boolean(Hls && typeof Hls.isSupported === 'function' && Hls.isSupported());
            if (!canUseHlsJs) {
              try {
                if ((video as any).hls) {
                  (video as any).hls.destroy();
                }
              } catch (_) {
                // ignore
              }
              (video as any).hls = undefined;
              video.src = url;
              ensureVideoSource(video, url);
              try {
                video.load();
              } catch (_) {
                // ignore
              }
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
            html: tt('Ad block', '广告拦截', '廣告攔截'),
            icon: '<text x="50%" y="50%" font-size="20" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#ffffff">AD</text>',
            tooltip: blockAdEnabled
              ? tt('Enabled', '已启用', '已啟用')
              : tt('Disabled', '已禁用', '已禁用'),
            onClick() {
              const newVal = !blockAdEnabled;
              try {
                localStorage.setItem('enable_blockad', String(newVal));
                const player = artPlayerRef.current;
                if (player) {
                  const currentTime = player.currentTime || 0;
                  resumeTimeRef.current = currentTime;
                  lastPlaybackTimeRef.current = currentTime;
                  setResumePreviewTime(
                    currentTime,
                    currentEpisodeIndexRef.current
                  );
                  if (player.video && (player.video as any).hls) {
                    try {
                      (player.video as any).hls.destroy();
                    } catch {
                      // ignore
                    }
                  }
                  if (playbackUrl) {
                    try {
                      player.switchUrl(playbackUrl);
                    } catch {
                      player.switch = playbackUrl;
                    }
                  }
                }
                setBlockAdEnabled(newVal);
              } catch (_) {
                // ignore
              }
              return newVal
                ? tt('Enabled', '已启用', '已啟用')
                : tt('Disabled', '已禁用', '已禁用');
            },
          },
          {
            html: tt('Ad block mode', '拦截模式', '攔截模式'),
            tooltip:
              blockAdMode === 'simple'
                ? tt('Simple', '简单', '簡單')
                : tt('Smart', '智能', '智能'),
            onClick() {
              const nextMode = blockAdMode === 'simple' ? 'smart' : 'simple';
              try {
                localStorage.setItem('blockad_mode', nextMode);
              } catch (_) {
                // ignore
              }
              setBlockAdMode(nextMode);
              if (blockAdEnabled && artPlayerRef.current && playbackUrl) {
                const player = artPlayerRef.current;
                const currentTime = player.currentTime || 0;
                resumeTimeRef.current = currentTime;
                lastPlaybackTimeRef.current = currentTime;
                setResumePreviewTime(
                  currentTime,
                  currentEpisodeIndexRef.current
                );
                if (player.video && (player.video as any).hls) {
                  try {
                    (player.video as any).hls.destroy();
                  } catch {
                    // ignore
                  }
                }
                try {
                  player.switchUrl(playbackUrl);
                } catch {
                  player.switch = playbackUrl;
                }
              }
              return nextMode === 'simple'
                ? tt('Simple', '简单', '簡單')
                : tt('Smart', '智能', '智能');
            },
          },
        ],
        controls: [
          {
            name: 'tv-autohide-timer',
            position: 'top',
            index: 0,
            html: '<div style="display:none"></div>',
            mounted: (art: any) => {
              if (!art || !art.template) return;
              const isWide =
                typeof window !== 'undefined' ? window.innerWidth >= 1024 : false;
              const baseDelay = isWide ? 3200 : 2200;
              let timer: NodeJS.Timeout | null = null;
              const scheduleHide = () => {
                if (timer) clearTimeout(timer);
                timer = setTimeout(() => {
                  try {
                    art.notice?.hide?.();
                    art.controls?.hide?.();
                  } catch {
                    // ignore
                  }
                }, baseDelay);
              };
              art.on('mousemove', scheduleHide);
              art.on('touchstart', scheduleHide);
              art.on('focus', scheduleHide);
              scheduleHide();
            },
          },
          {
            position: 'right',
            index: 8,
            html: '<div class="art-rotate-btn">↻ 90°</div>',
            tooltip: tt('Rotate (iOS)', '旋转（iOS）', '旋轉（iOS）'),
            style: {
              display: isIOSMobile ? 'flex' : 'none',
            },
            click: () => {
              if (!isIOSMobile) return;
              const next = !forceRotateStateRef.current;
              setForceRotate(next);
              forceRotateStateRef.current = next;
              setInlineFullscreen(next);
              setIsFullscreen(next);
              rotateFullscreenRef.current = next;
              if (next) {
                setTimeout(scrollPlayerIntoView, 30);
              }
              const player = artPlayerRef.current;
              if (player) {
                try {
                  if (next && player.fullscreen?.request) {
                    player.fullscreen.request();
                  } else if (next && player.fullscreenWeb?.request) {
                    player.fullscreenWeb.request();
                  } else if (!next) {
                    player.fullscreen?.exit?.();
                    player.fullscreenWeb?.exit?.();
                    document.exitFullscreen?.().catch(() => {});
                  }
                } catch (_) {
                  // ignore fullscreen errors
                }
              }
              if (!next) {
                rotateFullscreenRef.current = false;
                setInlineFullscreen(false);
                setForceRotate(false);
                setIsFullscreen(false);
              }
            },
          },
          {
            position: 'left',
            index: 13,
            html: '<i class="art-icon flex"><svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" fill="currentColor"/></svg></i>',
            tooltip: tt('Next episode', '下一集', '下一集'),
            click: function () {
              handleNextEpisode();
            },
          },
        ],
        layers: [
          {
            name: 'rewind-10',
            html: '<button class="art-skip art-skip-back"></button>',
            style: {
              position: 'absolute',
              bottom: '18%',
              left: '14px',
              transform: 'none',
              zIndex: '600',
              opacity: '0',
              transition: 'opacity 0.2s ease',
            },
            click: () => {
              if (isIOSDevice()) return; // iOS/macOS Safari use native controls
              const player = artPlayerRef.current;
              if (!player) return;
              lastManualSeekAtRef.current = Date.now();
              player.currentTime = Math.max(0, player.currentTime - 10);
            },
          },
          {
            name: 'forward-10',
            html: '<button class="art-skip art-skip-forward"></button>',
            style: {
              position: 'absolute',
              bottom: '18%',
              right: '14px',
              transform: 'none',
              zIndex: '600',
              opacity: '0',
              transition: 'opacity 0.2s ease',
            },
            click: () => {
              if (isIOSDevice()) return; // iOS/macOS Safari use native controls
              const player = artPlayerRef.current;
              if (!player) return;
              lastManualSeekAtRef.current = Date.now();
              player.currentTime = Math.min(
                player.duration || Number.MAX_SAFE_INTEGER,
                player.currentTime + 10
              );
            },
          },
        ],
      });
      resumePreviewCleanupRef.current = attachResumePreview(
        artPlayerRef.current
      );
      artPlayerRef.current.title = tt(
        `${displayTitleWithEnglish} - Episode ${currentEpisodeIndex + 1}`,
        `${displayTitleWithEnglish} - 第 ${currentEpisodeIndex + 1} 集`,
        `${displayTitleWithEnglish} - 第 ${currentEpisodeIndex + 1} 集`
      );

      artPlayerRef.current.on('ready', () => {
        clearError();
        updateResumePreviewPosition();
        const video = artPlayerRef.current?.video as HTMLVideoElement | undefined;
        if (video) {
          if (playbackListenersCleanupRef.current) {
            playbackListenersCleanupRef.current();
          }
          playbackListenersCleanupRef.current =
            attachPlaybackReliabilityHandlers(video);
          ensureVideoSource(video, playbackUrl);
        }
        lastProgressAtRef.current = Date.now();
        lastProgressTimeRef.current = 0;
        stallRecoveryCountRef.current = 0;
        attemptUserPlay('ready');
      });
      artPlayerRef.current.on('control', (visible: boolean) => {
        if (visible) {
          showResumePreview(true);
        } else {
          hideResumePreview();
        }
      });
      artPlayerRef.current.on('resize', () => {
        updateResumePreviewPosition();
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
        refreshActualPlaybackInfo();
        setIsPlaying(!artPlayerRef.current?.paused);
        hasStartedRef.current = true;
        autoSwitchLockedRef.current = true;
        if (artPlayerRef.current?.paused) {
          attemptUserPlay('canplay');
        }
        if (loadTimeoutRef.current) {
          clearTimeout(loadTimeoutRef.current);
          loadTimeoutRef.current = null;
        }
        lastProgressAtRef.current = Date.now();
        lastProgressTimeRef.current = artPlayerRef.current?.currentTime || 0;
        stallRecoveryCountRef.current = 0;
            if (resumeTimeRef.current && resumeTimeRef.current > 0) {
              try {
                const duration = artPlayerRef.current.duration || 0;
                let target = resumeTimeRef.current;
                if (duration && target >= duration - 2) {
                  target = Math.max(0, duration - 5);
                }
                artPlayerRef.current.currentTime = target;
                lastPlaybackTimeRef.current = target;
                console.log('成功恢復播放進度到:', resumeTimeRef.current);
              } catch (err) {
                console.warn('恢復播放進度失敗:', err);
              }
            }
        resumeTimeRef.current = null;
        updateResumePreviewPosition();
        showResumePreview(true);

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
        reportError(
          err?.message || err?.type || 'Playback error',
          'playback'
        );
        setIsVideoLoading(false);
      });

      artPlayerRef.current.on('play', () => {
        setIsPlaying(true);
        setNeedsUserPlay(false);
        resetPlaybackRecovery();
        lastProgressAtRef.current = Date.now();
        lastProgressTimeRef.current = artPlayerRef.current?.currentTime || 0;
        stallRecoveryCountRef.current = 0;
      });

      artPlayerRef.current.on('video:seeking', () => {
        lastManualSeekAtRef.current = Date.now();
      });

      artPlayerRef.current.on('video:seeked', () => {
        lastManualSeekAtRef.current = Date.now();
        if (artPlayerRef.current) {
          lastPlaybackTimeRef.current = artPlayerRef.current.currentTime || 0;
        }
      });

      artPlayerRef.current.on('video:ended', () => {
        const d = detailRef.current;
        if (!d?.episodes) return;
        const idx = currentEpisodeIndexRef.current;
        if (idx >= d.episodes.length - 1) return;
        setIsPlaying(false);
        cancelAutoNext();
        autoNextTimeoutRef.current = setTimeout(() => {
          const detail = detailRef.current;
          const currentIdx = currentEpisodeIndexRef.current;
          if (detail?.episodes && currentIdx < detail.episodes.length - 1) {
            setCurrentEpisodeIndex(currentIdx + 1);
          }
          autoNextTimeoutRef.current = null;
        }, 1200);
      });

      artPlayerRef.current.on('video:timeupdate', () => {
        const now = Date.now();
        const currentTime = artPlayerRef.current?.currentTime || 0;
        const adBlockActive =
          blockAdEnabledRef.current &&
          (blockAdModeRef.current === 'smart' || blockAdModeRef.current === 'simple');
        if (adBlockActive) {
          const lastTime = lastPlaybackTimeRef.current;
          const allowManualSeek = now - lastManualSeekAtRef.current < 1500;
          if (!allowManualSeek && lastTime > 0 && currentTime + 0.25 < lastTime) {
            if (artPlayerRef.current) {
              artPlayerRef.current.currentTime = lastTime;
            }
            lastPlaybackTimeRef.current = lastTime;
            return;
          }
        }
        if (Number.isFinite(currentTime)) {
          lastPlaybackTimeRef.current = currentTime;
          const progressed =
            currentTime > lastProgressTimeRef.current + 0.15;
          if (progressed) {
            lastProgressTimeRef.current = currentTime;
            lastProgressAtRef.current = now;
            stallRecoveryCountRef.current = 0;
          } else if (
            !artPlayerRef.current?.paused &&
            lastProgressAtRef.current &&
            now - lastProgressAtRef.current > 7000
          ) {
            lastProgressAtRef.current = now;
            stallRecoveryCountRef.current += 1;
            schedulePlaybackRecovery('watchdog');
            if (stallRecoveryCountRef.current >= 2) {
              stallRecoveryCountRef.current = 0;
              trySwitchToNextSource();
            }
          }
        }
        refreshActualPlaybackInfo();
        if (
          now - lastSaveTimeRef.current >
          (process.env.NEXT_PUBLIC_STORAGE_TYPE === 'd1' ? 10000 : 5000)
        ) {
          saveCurrentPlayProgress();
          lastSaveTimeRef.current = now;
        }
      });

      artPlayerRef.current.on('pause', () => {
        cancelAutoNext();
        setIsPlaying(false);
        saveCurrentPlayProgress();
      });

      artPlayerRef.current.on('fullscreen', () => {
        setIsFullscreen(true);
        void autoRotateToFit();
      });

      artPlayerRef.current.on('fullscreenCancel', () => {
        setIsFullscreen(false);
        unlockScreenOrientation();
        setInlineFullscreen(false);
        setForceRotate(false);
      });

      // Web fullscreen mode (fullscreen within page / Fullscreen API wrapper)
      artPlayerRef.current.on('fullscreenWeb', () => {
        setIsFullscreen(true);
        void autoRotateToFit();
        setInlineFullscreen(false);
        rotateFullscreenRef.current = false;
      });

      artPlayerRef.current.on('fullscreenWebCancel', () => {
        setIsFullscreen(false);
        unlockScreenOrientation();
        setInlineFullscreen(false);
        setForceRotate(false);
        rotateFullscreenRef.current = false;
      });

      if (artPlayerRef.current?.video) {
        ensureVideoSource(
          artPlayerRef.current.video as HTMLVideoElement,
          videoUrl
        );
        refreshActualPlaybackInfo();
      }

      // Fallback timeout: if the video doesn't become playable in 20s, switch source
      if (loadTimeoutRef.current) {
        clearTimeout(loadTimeoutRef.current);
      }
      loadTimeoutRef.current = setTimeout(() => {
        if (
          artPlayerRef.current &&
          Math.max(artPlayerRef.current.currentTime || 0, 0) <= 0
        ) {
          reportError(
            tt(
              'Source timed out, switching to another source…',
              '来源响应超时，自动切换其他来源…',
              '來源響應超時，自動切換其他來源…'
            ),
            'playback'
          );
          setIsVideoLoading(false);
          trySwitchToNextSource();
        }
      }, 20000);
    } catch (err) {
      console.error('建立播放器失敗:', err);
      reportError(
        tt(
          'Player initialization failed',
          '播放器初始化失败',
          '播放器初始化失敗'
        ),
        'playback'
      );
    }
  }, [
    Artplayer,
    Hls,
    blockAdEnabled,
    loading,
    tt,
    refreshActualPlaybackInfo,
    trySwitchToNextSource,
    uiLocale,
    playbackUrl,
    attachResumePreview,
    autoRotateToFit,
    hideResumePreview,
    showResumePreview,
    unlockScreenOrientation,
    updateResumePreviewPosition,
  ]);

  useEffect(() => {
    if (!artPlayerRef.current) {
      return;
    }
    artPlayerRef.current.title = tt(
      `${displayTitleWithEnglish} - Episode ${currentEpisodeIndex + 1}`,
      `${displayTitleWithEnglish} - 第 ${currentEpisodeIndex + 1} 集`,
      `${displayTitleWithEnglish} - 第 ${currentEpisodeIndex + 1} 集`
    );
  }, [displayTitleWithEnglish, currentEpisodeIndex, tt]);

  useEffect(() => {
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isFullscreen) {
      void autoRotateToFit();
    } else {
      unlockScreenOrientation();
      if (rotateFullscreenRef.current) {
        document.exitFullscreen?.().catch(() => {});
        rotateFullscreenRef.current = false;
        setInlineFullscreen(false);
        setForceRotate(false);
        setIsFullscreen(false);
      }
    }
  }, [isFullscreen, actualPlaybackInfo, autoRotateToFit, unlockScreenOrientation]);

  const layoutActivePath = isTvVariant ? '/play/tvplay' : '/play';
  const hideLayoutBars = isTvVariant ? true : hideNavInFullscreen;

  if (loading) {
    return (
      <PageLayout activePath={layoutActivePath} hideTopBar={hideLayoutBars}>
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
                  <span>
                    {tt('Providers searched', '已搜索来源', '已搜尋來源')}
                  </span>
                  <span>
                    {searchStats.total || 0}/{providerCountRef.current ||
                      searchStats.total ||
                      providerCount ||
                      0}
                  </span>
                </div>
                <div className='flex justify-between'>
                  <span>{tt('With sources', '有资源', '有資源')}</span>
                  <span>{searchStats.found || 0}</span>
                </div>
                <div className='flex justify-between'>
                  <span>{tt('No sources', '无资源', '無資源')}</span>
                  <span>{(searchStats.notFound || 0) + (searchStats.empty || 0)}</span>
                </div>
                <div className='flex justify-between'>
                  <span>{tt('Failed', '失败', '失敗')}</span>
                  <span>{searchStats.failed || 0}</span>
                </div>
                <div className='flex justify-between'>
                  <span>{tt('Pending', '待搜索', '待搜尋')}</span>
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

  const episodeSelector = (
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
      variant={isTvVariant ? 'tv' : 'default'}
      episodeRuntimeLabel={mergedDurations[0]}
      videoCover={videoCover}
    />
  );

  if (isTvVariant) {
    const episodeLabel =
      totalEpisodes > 1 ? `E${currentEpisodeIndex + 1}` : '';
    if (!TvLayout) {
      return (
        <PageLayout activePath={layoutActivePath} hideTopBar={hideLayoutBars}>
          <div className='flex items-center justify-center min-h-screen text-white'>
            {tt('TV layout missing.', '缺少电视布局。', '缺少電視佈局。')}
          </div>
        </PageLayout>
      );
    }
    return (
      <PageLayout activePath={layoutActivePath} hideTopBar={hideLayoutBars}>
        <TvLayout
          title={displayTitleText}
          englishTitle={englishVideoTitle}
          episodeLabel={episodeLabel}
          introTags={introTags}
          synopsisText={synopsisText}
          clientInfo={clientInfo}
          sourceName={detail?.source_name}
          currentSource={currentSource}
          currentPlayingInfo={currentPlayingInfo}
          actualPlaybackInfo={actualPlaybackInfo}
          localizeInfoLabel={localizeInfoLabel}
          downloadButtonLabel={downloadButtonLabel}
          downloadButtonDisabled={downloadButtonDisabled}
          isPlaying={isPlaying}
          onDownload={handleDownload}
          onTogglePlayback={handleTogglePlayback}
          artRef={artRef}
          playerHeightClass={tvPlayerHeightClass}
          forceRotate={forceRotate}
          error={error}
          errorType={errorType}
          onClearError={clearError}
          onTryNextSource={trySwitchToNextSource}
          isVideoLoading={isVideoLoading}
          videoLoadingStage={videoLoadingStage}
          episodeSelector={episodeSelector}
          tmdbRecommendations={tmdbRecommendations}
          tt={tt}
          convertToTraditional={convertToTraditional}
        />
      </PageLayout>
    );
  }

  return (
      <PageLayout activePath={layoutActivePath} hideTopBar={hideLayoutBars}>
      <div className='flex flex-col gap-2 py-2 px-2.5 sm:px-3.5 md:pt-10 lg:pt-2 lg:px-5 xl:px-7'>
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
                {tt(
                  ` > Episode ${currentEpisodeIndex + 1}`,
                  ` > 第 ${currentEpisodeIndex + 1} 集`,
                  ` > 第 ${currentEpisodeIndex + 1} 集`
                )}
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
                {tt('Source: ', '播放来源：', '播放來源：')}
                {convertToTraditional(detail?.source_name || '') ||
                  detail?.source_name ||
                  currentSource}
              </span>
            )}
            {currentPlayingInfo && !currentPlayingInfo.hasError && (
              <>
                <span className='px-2 py-1 rounded-full bg-white/80 dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/60'>
                  {tt('Resolution: ', '解析度：', '解析度：')}
                  {actualPlaybackInfo?.quality ||
                    localizeInfoLabel(currentPlayingInfo.quality) ||
                    'NA'}
                </span>
                <span className='px-2 py-1 rounded-full bg-white/80 dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/60'>
                  {tt('Load speed: ', '载入速度：', '載入速度：')}
                  {localizeInfoLabel(currentPlayingInfo.loadSpeed)}
                </span>
                <span className='px-2 py-1 rounded-full bg-white/80 dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/60'>
                  {tt('Ping: ', '延迟：', '延遲：')}
                  {currentPlayingInfo.pingTime}ms
                </span>
              </>
            )}
            <button
              type='button'
              onClick={handleDownload}
              className='px-3 py-1.5 rounded-full bg-green-600 text-white hover:bg-green-700 shadow-sm border border-green-500/40 disabled:opacity-60 disabled:cursor-not-allowed'
              disabled={downloadButtonDisabled}
            >
              {downloadButtonLabel}
            </button>
            {supportsAudioOnly && (
              <button
                type='button'
                onClick={() =>
                  audioOnly ? disableAudioOnly() : enableAudioOnly()
                }
                className={`px-3 py-1.5 rounded-full text-white shadow-sm border ${
                  audioOnly
                    ? 'bg-rose-500 border-rose-400 hover:bg-rose-600'
                    : 'bg-indigo-500 border-indigo-400 hover:bg-indigo-600'
                }`}
              >
                {audioOnly
                  ? tt('Back to video', '返回视频', '返回影片')
                  : tt('Audio only', '仅音频', '僅音訊')}
              </button>
            )}
          </div>
        )}

        {supportsAudioOnly && (
          <div
            className={`rounded-2xl border border-gray-200/70 dark:border-gray-700/60 bg-white/70 dark:bg-gray-900/50 px-3 py-2 text-xs text-gray-600 dark:text-gray-300 ${
              audioOnly ? 'block' : 'hidden'
            }`}
          >
            {tt(
              'Audio-only mode for iOS background playback.',
              'iOS 后台播放的仅音频模式。',
              'iOS 背景播放的僅音訊模式。'
            )}
          </div>
        )}
        <audio
          ref={audioRef}
          controls={audioOnly}
          className={audioOnly ? 'w-full' : 'hidden'}
        />

        {/* 第二行：播放器和选集 */}
        <div className='space-y-2.5'>
          <div
            className={`relative grid gap-3 md:h-[520px] xl:h-[680px] 2xl:h-[760px] transition-all duration-300 ease-in-out ${
              hideSidePanels || isEpisodeSelectorCollapsed
                ? 'grid-cols-1'
                : 'grid-cols-1 md:grid-cols-[minmax(0,4fr)_minmax(0,1fr)] lg:grid-cols-[minmax(0,4fr)_minmax(0,1fr)]'
            }`}
            ref={panelGestureRef}
          >
            {!hideSidePanels && isEpisodeSelectorCollapsed && (
              <button
                type='button'
                aria-label={tt('Show episodes', '显示选集', '顯示選集')}
                className='hidden md:flex absolute top-2 right-2 z-30 items-center justify-center w-8 h-8 rounded-full bg-white/80 dark:bg-gray-800/90 border border-gray-200/70 dark:border-gray-700/60 shadow-sm text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700'
                onClick={() => setIsEpisodeSelectorCollapsed(false)}
              >
                ◀
              </button>
            )}
            {/* 播放器 */}
            <div
              className={`h-full min-w-0 transition-all duration-300 ease-in-out rounded-xl border border-white/0 dark:border-white/30 ${
                hideSidePanels || isEpisodeSelectorCollapsed
                  ? 'col-span-1'
                  : 'md:col-span-1 lg:col-span-1'
              }`}
            >
              <div className={`relative w-full ${playerHeightClass}`} id='player-root'>
              <div className='absolute top-2 left-2 z-[605] flex flex-wrap items-center gap-2 bg-black/60 text-white rounded-lg px-3 py-2 backdrop-blur-sm max-w-[92%]'>
                <div className='text-sm font-semibold truncate max-w-[60%]'>
                  {displayTitleText}
                  {totalEpisodes > 1 && ` · E${currentEpisodeIndex + 1}`}
                </div>
                <div className='text-xs px-2 py-0.5 rounded-full bg-white/15 border border-white/20'>
                  {actualPlaybackInfo?.quality ||
                    (currentPlayingInfo?.quality
                      ? localizeInfoLabel(currentPlayingInfo.quality)
                      : 'NA')}
                </div>
              </div>
              {error && (
                <div className='absolute top-3 left-3 z-[650] max-w-[92%] md:max-w-[70%] rounded-xl bg-black/75 text-white backdrop-blur px-4 py-3 shadow-lg pointer-events-auto'>
                  <div className='flex items-start justify-between gap-3'>
                    <div className='min-w-0'>
                      <div className='text-[11px] uppercase tracking-wider text-white/80'>
                        {errorType === 'playback'
                          ? tt('Playback error', '播放错误', '播放錯誤')
                          : errorType === 'source'
                          ? tt('Source error', '来源错误', '來源錯誤')
                          : errorType === 'search'
                          ? tt('Search error', '搜索错误', '搜尋錯誤')
                          : errorType === 'network'
                          ? tt('Network error', '网络错误', '網路錯誤')
                          : errorType === 'params'
                          ? tt('Parameter error', '参数错误', '參數錯誤')
                          : tt('Error', '错误', '錯誤')}
                      </div>
                      <div className='mt-1 text-sm font-medium break-words whitespace-pre-wrap'>
                        {error}
                      </div>
                      {(errorType === 'playback' || errorType === 'source') && (
                        <div className='mt-2 flex items-center gap-2'>
                          <button
                            type='button'
                            onClick={() => {
                              clearError();
                              trySwitchToNextSource();
                            }}
                            className='rounded-md bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-semibold'
                          >
                            {tt(
                              'Try next source',
                              '尝试下一个来源',
                              '嘗試下一個來源'
                            )}
                          </button>
                          <button
                            type='button'
                            onClick={() => window.location.reload()}
                            className='rounded-md bg-white/10 hover:bg-white/20 px-3 py-1.5 text-xs font-semibold'
                          >
                            {tt('Reload', '刷新', '重新整理')}
                          </button>
                        </div>
                      )}
                    </div>
                    <button
                      type='button'
                      onClick={clearError}
                      className='shrink-0 rounded-md bg-white/10 hover:bg-white/20 px-2 py-1 text-xs font-semibold'
                      aria-label={tt(
                        'Dismiss error',
                        '关闭错误提示',
                        '關閉錯誤提示'
                      )}
                      title={tt('Dismiss', '关闭', '關閉')}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
              {!audioOnly && needsUserPlay && (
                <div className='absolute inset-0 z-[640] flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-xl'>
                  <div className='text-center space-y-3 px-6'>
                    <div className='text-white text-sm font-semibold'>
                      {needsUserPlayMessage ||
                        tt('Tap to play', '点击播放', '點擊播放')}
                    </div>
                    <button
                      type='button'
                      onClick={handleUserPlay}
                      className='px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold shadow-lg'
                    >
                      {tt('Play', '开始播放', '開始播放')}
                    </button>
                  </div>
                </div>
              )}
              {!audioOnly && isBuffering && (
                <div className='absolute bottom-3 right-3 z-[610] rounded-full bg-black/60 text-white text-xs px-3 py-1.5 flex items-center gap-2'>
                  <span className='inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse'></span>
                  {tt('Buffering…', '缓冲中…', '緩衝中…')}
                </div>
              )}
              <div
                ref={artRef}
                className={`absolute inset-0 bg-black w-full h-full rounded-xl overflow-hidden shadow-lg ${
                  forceRotate ? 'forced-rotate-player' : ''
                }`}
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
                            ? tt(
                                '🔄 Switching source…',
                                '🔄 切换播放源…',
                                '🔄 切換播放源...'
                              )
                            : tt(
                                '🔄 Loading video…',
                                '🔄 视频载入中…',
                                '🔄 影片載入中...'
                              )}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 选集和换源 - 在移动端始终顯示，在 lg 及以上可折叠 */}
            {!hideSidePanels && (
              <div
                className={`relative h-[300px] md:h-full md:overflow-hidden min-w-0 transition-all duration-300 ease-in-out ${
                  isEpisodeSelectorCollapsed
                    ? 'lg:hidden lg:opacity-0 lg:scale-95'
                    : 'md:col-span-1 lg:col-span-1 lg:opacity-100 lg:scale-100'
                }`}
              >
                {!isEpisodeSelectorCollapsed && !hideSidePanels && (
                  <button
                    type='button'
                    aria-label={tt('Hide panel', '隐藏面板', '隱藏面板')}
                    className='hidden md:flex absolute top-2 right-2 z-30 items-center justify-center w-8 h-8 rounded-full bg-white/85 dark:bg-gray-800/90 border border-gray-200/70 dark:border-gray-700/60 shadow-sm text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700'
                    onClick={() => setIsEpisodeSelectorCollapsed(true)}
                  >
                    ▶
                  </button>
                )}
                {episodeSelector}
              </div>
            )}
          </div>
        </div>

        <PlayDetails
          displayTitleText={displayTitleText}
          displayTitleWithEnglish={displayTitleWithEnglish}
          englishVideoTitle={englishVideoTitle}
          introTags={introTags}
          imdbVideoId={imdbVideoId}
          imdbLink={imdbLink}
          detail={detail}
          videoYear={videoYear}
          omdbData={omdbData}
          tvmazeData={tvmazeData}
          metadataLists={metadataLists}
          metadataSynopsis={metadataSynopsis}
          mergedReleaseDates={mergedReleaseDates}
          mergedDurations={mergedDurations}
          showOmdbRuntime={showOmdbRuntime}
          tmdbSeasons={tmdbSeasons}
          tmdbRecommendations={tmdbRecommendations}
          tmdbLink={tmdbLink}
          tmdbId={tmdbId}
          synopsisText={synopsisText}
          favorited={favorited}
          onToggleFavorite={handleToggleFavorite}
          tt={tt}
          convertToTraditional={convertToTraditional}
          videoCover={videoCover}
        />
      </div>
    </PageLayout>
  );
}
