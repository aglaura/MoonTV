'use client';

import { Space_Grotesk } from 'next/font/google';
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react';

import { PlayPageClient, type TvPlayLayoutProps } from '@/app/play/PlayPageClient';
import { BackButton } from '@/components/BackButton';
import { VirtualizedRow } from '@/components/VirtualizedRow';
import { processImageUrl } from '@/lib/utils';

const tvFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

type Direction = 'up' | 'down' | 'left' | 'right';

const focusableSelector =
  '[data-focusable="true"], [data-tv-focusable="true"], button, [role="button"], a, [tabindex="0"]';

const useSpatialNavigation = (
  onNavigate?: () => void,
  onFocusMove?: (el: HTMLElement, direction: Direction) => void,
  onEdge?: (direction: Direction) => void,
  rowFocusMap?: MutableRefObject<Map<string, HTMLElement>>
) => {
  useEffect(() => {
    let cached: HTMLElement[] | null = null;
    let cacheRaf = 0;
    const scheduleCacheClear = () => {
      if (cacheRaf) return;
      if (typeof window === 'undefined') return;
      cacheRaf = window.requestAnimationFrame(() => {
        cached = null;
        cacheRaf = 0;
      });
    };

    const getFocusable = (root: ParentNode = document): HTMLElement[] => {
      if (root === document && cached) return cached;
      const list = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((el) => !el.hasAttribute('disabled'))
        .filter((el) => el.getAttribute('aria-disabled') !== 'true')
        .filter((el) => el.getClientRects().length > 0);
      if (root === document) {
        cached = list;
        scheduleCacheClear();
      }
      return list;
    };

    const findNext = (
      current: HTMLElement,
      direction: Direction
    ): HTMLElement | null => {
      const currentRect = current.getBoundingClientRect();
      const currentCenterX = currentRect.left + currentRect.width / 2;
      const currentCenterY = currentRect.top + currentRect.height / 2;
      let best: HTMLElement | null = null;
      let bestScore = Number.POSITIVE_INFINITY;

      getFocusable().forEach((el) => {
        if (el === current) return;
        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const dx = centerX - currentCenterX;
        const dy = centerY - currentCenterY;

        if (direction === 'left' && dx >= -4) return;
        if (direction === 'right' && dx <= 4) return;
        if (direction === 'up' && dy >= -4) return;
        if (direction === 'down' && dy <= 4) return;

        const primary =
          direction === 'left' || direction === 'right'
            ? Math.abs(dx)
            : Math.abs(dy);
        const secondary =
          direction === 'left' || direction === 'right'
            ? Math.abs(dy)
            : Math.abs(dx);
        const score = primary * 1000 + secondary;

        if (score < bestScore) {
          best = el;
          bestScore = score;
        }
      });

      return best;
    };

    const onKey = (e: KeyboardEvent) => {
      const dirMap: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };
      const active = document.activeElement as HTMLElement | null;
      if (!active) return;

      const tagName = active.tagName;
      if (
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        active.isContentEditable
      ) {
        return;
      }
      if (e.key === 'Enter') {
        active.click();
        e.preventDefault();
        return;
      }
      const dir = dirMap[e.key];
      if (!dir) return;

      onNavigate?.();
      e.preventDefault();

      if (dir === 'up' || dir === 'down') {
        const activeRow = active.closest<HTMLElement>('[data-tv-row]');
        if (activeRow) {
          const rows = Array.from(
            document.querySelectorAll<HTMLElement>('[data-tv-row]')
          );
          const currentIdx = rows.indexOf(activeRow);
          const targetIdx = dir === 'down' ? currentIdx + 1 : currentIdx - 1;
          const targetRow = rows[targetIdx];
          if (targetRow) {
            const remembered =
              rowFocusMap?.current.get(targetRow.id || '') || null;
            const rememberedValid =
              remembered && document.contains(remembered) ? remembered : null;
            const fallback = getFocusable(targetRow)[0] || null;
            const next = rememberedValid ?? fallback;
            if (next) {
              next.focus({ preventScroll: true });
              onFocusMove?.(next, dir);
              return;
            }
          }
          onEdge?.(dir);
          return;
        }
        onEdge?.(dir);
        return;
      }

      const next = findNext(active, dir);
      if (next) {
        next.focus({ preventScroll: true });
        onFocusMove?.(next, dir);
        return;
      }

      onEdge?.(dir);
    };

    window.addEventListener('keydown', onKey, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey);
      if (cacheRaf) {
        window.cancelAnimationFrame(cacheRaf);
      }
    };
  }, [onEdge, onFocusMove, onNavigate, rowFocusMap]);
};

const TvRow = ({
  rowId,
  title,
  children,
}: {
  rowId: string;
  title: string;
  children: ReactNode;
}) => {
  return (
    <section id={rowId} data-tv-row={rowId} className='space-y-3'>
      <h2 className='px-2 text-sm uppercase tracking-[0.3em] text-white/60'>
        {title}
      </h2>
      {children}
    </section>
  );
};

const TvPlayLayout = ({
  title,
  englishTitle,
  episodeLabel,
  introTags,
  synopsisText,
  clientInfo,
  sourceName,
  currentSource,
  currentPlayingInfo,
  actualPlaybackInfo,
  localizeInfoLabel,
  downloadButtonLabel,
  downloadButtonDisabled,
  onDownload,
  onTogglePlayback,
  artRef,
  playerHeightClass,
  forceRotate,
  error,
  errorType,
  onClearError,
  onTryNextSource,
  isVideoLoading,
  videoLoadingStage,
  episodeSelector,
  tmdbRecommendations,
  tt,
  convertToTraditional,
}: TvPlayLayoutProps) => {
  const displaySource =
    convertToTraditional(sourceName || '') || sourceName || currentSource || '';
  const isLowEndTV = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    const cores = navigator.hardwareConcurrency || 0;
    const ua = navigator.userAgent || '';
    return cores > 0 && cores <= 4 || /Amlogic|MTK|Android TV/i.test(ua);
  }, []);
  const qualityLabel =
    actualPlaybackInfo?.quality ||
    (currentPlayingInfo?.quality
      ? localizeInfoLabel(currentPlayingInfo.quality)
      : 'NA');
  const synopsisPreview =
    synopsisText && synopsisText.trim().length > 0
      ? convertToTraditional(synopsisText) || synopsisText
      : tt('No synopsis available.', '暂无简介。', '暫無簡介。');
  const motionSafe = !isLowEndTV;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const playerFocusRef = useRef<HTMLButtonElement | null>(null);
  const rowFocusMap = useRef<Map<string, HTMLElement>>(new Map());
  const [controlsVisible, setControlsVisible] = useState(true);
  const [cinemaMode, setCinemaMode] = useState(false);
  const controlsTimerRef = useRef<number | null>(null);

  const showControlsTemporarily = useCallback(() => {
    setControlsVisible(true);
    if (controlsTimerRef.current) {
      window.clearTimeout(controlsTimerRef.current);
    }
    controlsTimerRef.current = window.setTimeout(() => {
      setControlsVisible(false);
    }, 2000);
  }, []);

  const rememberRowFocus = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const row = el.closest<HTMLElement>('[data-tv-row]');
    if (!row?.id) return;
    rowFocusMap.current.set(row.id, el);
  }, []);

  const centerFocusInView = useCallback((el: HTMLElement | null, direction?: Direction) => {
    if (!el || !rootRef.current || !rootRef.current.contains(el)) return;
    rememberRowFocus(el);
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    } catch {
      el.scrollIntoView();
    }
    if (direction === 'right') {
      const container = el.closest<HTMLElement>('[data-tv-scroll]');
      if (container) {
        container.scrollLeft += 80;
      }
    }
  }, [rememberRowFocus]);

  const handleEdge = useCallback((direction: Direction) => {
    if (direction !== 'left') return;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('tv:sidebar-peek'));
    }
    const sidebar = document.querySelector<HTMLElement>('[data-sidebar]');
    const first = sidebar?.querySelector<HTMLElement>('[data-tv-focusable="true"]');
    first?.focus({ preventScroll: true });
  }, []);

  useSpatialNavigation(
    showControlsTemporarily,
    centerFocusInView,
    handleEdge,
    rowFocusMap
  );

  const handleRootFocus = useCallback(
    (event: FocusEvent<HTMLElement>) => {
      showControlsTemporarily();
      centerFocusInView(event.target as HTMLElement);
    },
    [centerFocusInView, showControlsTemporarily]
  );

  useEffect(() => {
    setCinemaMode(!controlsVisible);
  }, [controlsVisible]);

  const focusPlayer = useCallback(() => {
    playerFocusRef.current?.focus({ preventScroll: true });
    centerFocusInView(playerFocusRef.current);
  }, [centerFocusInView]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const timer = window.setTimeout(() => {
      focusPlayer();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [focusPlayer]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    showControlsTemporarily();
    const handleActivity = () => {
      showControlsTemporarily();
    };
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('pointerdown', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      if (controlsTimerRef.current) {
        window.clearTimeout(controlsTimerRef.current);
      }
    };
  }, [showControlsTemporarily]);

  const showAuxInfo = controlsVisible || Boolean(error);
  const controlsVisibilityClass = showAuxInfo
    ? 'opacity-100'
    : 'opacity-0 pointer-events-none lg:opacity-0 lg:pointer-events-none';

  return (
    <div className={`${tvFont.className} relative min-h-screen text-white`}>
      <div
        className={`absolute inset-0 ${
          isLowEndTV
            ? 'bg-[#0b1020]'
            : 'bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_55%),radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.16),transparent_50%),radial-gradient(circle_at_20%_85%,rgba(99,102,241,0.14),transparent_55%),linear-gradient(120deg,#0b1020,#020617)]'
        }`}
      />
      {!isLowEndTV && (
        <>
          <div className='absolute -top-16 -right-10 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl animate-[tvFloat_9s_ease-in-out_infinite]' />
          <div className='absolute bottom-0 left-12 h-48 w-48 rounded-full bg-sky-400/15 blur-3xl animate-[tvFloat_11s_ease-in-out_infinite]' />
        </>
      )}

      <div
        ref={rootRef}
        onFocusCapture={handleRootFocus}
        data-tv-nav='manual'
        className='relative z-10 px-[4vw] py-[3vh] space-y-10 animate-[tvFade_0.6s_ease]'
      >
        <section id='tv-row-hero' data-tv-row='tv-row-hero' className='space-y-5'>
          <div className={`transition-opacity duration-300 ${controlsVisibilityClass}`}>
            <header className='flex flex-wrap items-center justify-between gap-6'>
              <div className='flex items-center gap-4'>
                <div className='rounded-full bg-white/10 border border-white/20 p-1.5 shadow-lg'>
                  <BackButton />
                </div>
                <div className='space-y-1'>
                  <div className='text-[11px] uppercase tracking-[0.4em] text-white/50'>
                    {tt('Now playing', '正在播放', '正在播放')}
                  </div>
                  <div className='flex flex-wrap items-center gap-3'>
                    <h1 className='text-2xl md:text-3xl font-semibold tracking-tight'>
                      {title || tt('Untitled', '未命名', '未命名')}
                    </h1>
                    {episodeLabel && (
                      <span className='text-[10px] uppercase tracking-[0.35em] px-3 py-1 rounded-full bg-white/10 border border-white/20'>
                        {episodeLabel}
                      </span>
                    )}
                  </div>
                  {englishTitle && (
                    <div className='text-sm text-white/60'>{englishTitle}</div>
                  )}
                </div>
              </div>
              <div className='flex flex-wrap items-center gap-3'>
                {displaySource && (
                  <span className='text-xs px-3 py-1 rounded-full bg-white/10 border border-white/15'>
                    {tt('Source', '来源', '來源')}: {displaySource}
                  </span>
                )}
                {showAuxInfo && (
                  <span className='text-xs px-3 py-1 rounded-full bg-white/10 border border-white/15'>
                    {tt('Quality', '清晰度', '清晰度')}: {qualityLabel}
                  </span>
                )}
                <button
                  type='button'
                  onClick={onDownload}
                  disabled={downloadButtonDisabled}
                  data-focusable='true'
                  className='px-4 py-2 rounded-full bg-emerald-400 text-black text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/90 focus-visible:ring-offset-2 focus-visible:ring-offset-black/60'
                >
                  {downloadButtonLabel}
                </button>
              </div>
            </header>
          </div>

          <div className='space-y-4'>
            <div
              className={`group relative rounded-[28px] border border-white/15 bg-black/40 shadow-[0_20px_60px_rgba(15,23,42,0.6)] overflow-hidden transition-transform duration-500 group-focus-within:scale-[1.02] group-focus-within:brightness-105 ${
                cinemaMode ? 'scale-[1.02] brightness-105' : ''
              }`}
            >
              <div className={`relative w-full ${playerHeightClass}`} id='player-root'>
                <div
                  className={`absolute top-3 left-3 z-[605] flex flex-wrap items-center gap-2 text-white rounded-lg px-3 py-2 max-w-[92%] transition-opacity duration-300 ${
                    isLowEndTV ? 'bg-black/70' : 'bg-black/65 backdrop-blur-sm'
                  } ${controlsVisibilityClass}`}
                >
                  <div className='text-sm font-semibold truncate max-w-[60%]'>
                    {title}
                    {episodeLabel ? ` · ${episodeLabel}` : ''}
                  </div>
                  {showAuxInfo && (
                    <div className='text-xs px-2 py-0.5 rounded-full bg-white/15 border border-white/20'>
                      {qualityLabel}
                    </div>
                  )}
                </div>
                {error && (
                  <div
                    className={`absolute top-3 left-3 z-[650] max-w-[92%] md:max-w-[70%] rounded-xl text-white px-4 py-3 shadow-lg pointer-events-auto ${
                      isLowEndTV ? 'bg-black/80' : 'bg-black/75 backdrop-blur'
                    }`}
                  >
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
                              data-focusable='true'
                              onClick={() => {
                                onClearError();
                                onTryNextSource();
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
                              data-focusable='true'
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
                        data-focusable='true'
                        onClick={onClearError}
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
                <div
                  ref={artRef}
                  className={`absolute inset-0 bg-black w-full h-full rounded-[28px] overflow-hidden ${
                    forceRotate ? 'forced-rotate-player' : ''
                  }`}
                />
                <button
                  ref={playerFocusRef}
                  type='button'
                  tabIndex={-1}
                  aria-label={tt('Play or pause', '播放或暂停', '播放或暫停')}
                  data-focusable='true'
                  onClick={() => {
                    showControlsTemporarily();
                    onTogglePlayback();
                  }}
                  className='tv-player-focus absolute inset-0 z-[610] rounded-[28px] pointer-events-none'
                />

                {isVideoLoading && (
                  <div className='absolute inset-0 bg-black/85 backdrop-blur-sm rounded-[28px] flex items-center justify-center z-[500] transition-all duration-300'>
                    <div className='text-center max-w-md mx-auto px-6 space-y-4'>
                      <div className='text-4xl'>🎬</div>
                      <p className='text-lg font-semibold text-white'>
                        {videoLoadingStage === 'sourceChanging'
                          ? tt(
                              'Switching source…',
                              '切换播放源…',
                              '切換播放源...'
                            )
                          : tt(
                              'Loading video…',
                              '视频载入中…',
                              '影片載入中...'
                            )}
                      </p>
                      <div className='h-1.5 w-40 bg-white/15 rounded-full overflow-hidden mx-auto'>
                        <div className='h-full w-2/3 bg-emerald-400 rounded-full animate-[tvPulse_1.6s_ease_infinite]' />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              className={`flex flex-wrap items-center gap-2 text-xs text-white/70 transition-opacity duration-300 ${controlsVisibilityClass}`}
            >
              {showAuxInfo && (
                <>
                  {clientInfo && (
                    <span className='px-3 py-1 rounded-full bg-white/10 border border-white/15'>
                      {clientInfo}
                    </span>
                  )}
                  {currentPlayingInfo && !currentPlayingInfo.hasError && (
                    <>
                      <span className='px-3 py-1 rounded-full bg-white/10 border border-white/15'>
                        {tt('Resolution', '解析度', '解析度')}: {qualityLabel}
                      </span>
                      <span className='px-3 py-1 rounded-full bg-white/10 border border-white/15'>
                        {tt('Load', '载入', '載入')}:{' '}
                        {localizeInfoLabel(currentPlayingInfo.loadSpeed)}
                      </span>
                      <span className='px-3 py-1 rounded-full bg-white/10 border border-white/15'>
                        {tt('Ping', '延迟', '延遲')}: {currentPlayingInfo.pingTime}ms
                      </span>
                    </>
                  )}
                  {introTags.map((tag, idx) => (
                    <span
                      key={`${tag}-${idx}`}
                      className='px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/60'
                    >
                      {tag}
                    </span>
                  ))}
                </>
              )}
            </div>

            <div
              className={`rounded-2xl bg-white/5 border border-white/10 p-4 text-sm text-white/70 leading-relaxed transition-opacity duration-300 ${controlsVisibilityClass}`}
            >
              <div className='text-[11px] uppercase tracking-[0.3em] text-white/50 mb-2'>
                {tt('Synopsis', '简介', '簡介')}
              </div>
              <p className='line-clamp-3'>{synopsisPreview}</p>
            </div>
          </div>
        </section>

        <div className='space-y-8'>
          <TvRow rowId='tv-row-episodes' title={tt('Episodes', '剧集', '劇集')}>
            {episodeSelector}
          </TvRow>
          {tmdbRecommendations.length > 0 && (
            <TvRow
              rowId='tv-row-recommendations'
              title={tt('More like this', '更多推荐', '更多推薦')}
            >
              <VirtualizedRow
                items={tmdbRecommendations}
                itemWidth={260}
                gap={16}
                overscan={4}
                className='px-2 pb-2'
                renderItem={(rec, index) => {
                  const titleText = rec?.name || rec?.title || '';
                  const imagePath = rec?.backdrop_path || rec?.poster_path || '';
                  const imageBase = imagePath
                    ? `https://image.tmdb.org/t/p/${
                        rec?.backdrop_path ? 'w780' : 'w500'
                      }${imagePath}`
                    : '';
                  const imageUrl = imageBase
                    ? processImageUrl(imageBase, { preferCached: true })
                    : '';
                  return (
                    <button
                      type='button'
                      data-focusable='true'
                      data-tv-focusable='true'
                      data-tv-index={index}
                      className={`tv-card ${
                        motionSafe ? '' : 'tv-card-lite'
                      } w-[260px] shrink-0 rounded-xl overflow-hidden bg-black/40 border border-white/10 text-left`}
                    >
                      <div
                        className='aspect-video w-full bg-black/50 bg-cover bg-center'
                        style={{
                          backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
                        }}
                      />
                      <div className='p-3'>
                        <div className='text-sm font-semibold line-clamp-1'>
                          {titleText || tt('Untitled', '未命名', '未命名')}
                        </div>
                        {rec?.overview && (
                          <div className='text-xs text-white/60 line-clamp-2'>
                            {rec.overview}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                }}
              />
            </TvRow>
          )}
        </div>
      </div>

      <style jsx>{`
        @keyframes tvFade {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes tvFloat {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-18px);
          }
        }
        @keyframes tvPulse {
          0%,
          100% {
            transform: translateX(-30%);
          }
          50% {
            transform: translateX(45%);
          }
        }
        :global([data-focusable='true']),
        :global([data-tv-focusable='true']),
        :global(.tv-player-focus) {
          transition: transform 120ms ease, box-shadow 120ms ease;
        }
        :global([data-focusable='true']:focus-visible),
        :global([data-tv-focusable='true']:focus-visible),
        :global(.tv-player-focus:focus-visible) {
          outline: none;
          transform: scale(1.05);
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.9),
            0 8px 24px rgba(0, 0, 0, 0.6);
        }
        :global(.tv-card) {
          transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1),
            opacity 180ms ease, box-shadow 180ms ease;
          will-change: transform;
        }
        :global(.tv-card:focus-visible) {
          outline: none;
          transform: scale(1.08) translateY(-4px);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.7),
            0 0 0 3px rgba(255, 255, 255, 0.9);
        }
        :global(.tv-card-lite:focus-visible) {
          transform: none;
          box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.9);
        }
      `}</style>
    </div>
  );
};

export default function TvPlayPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlayPageClient variant='tv' TvLayout={TvPlayLayout} />
    </Suspense>
  );
}
