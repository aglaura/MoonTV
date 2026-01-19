/* eslint-disable @next/next/no-img-element */

'use client';

import { Space_Grotesk } from 'next/font/google';
import type { ReactNode, RefObject } from 'react';

import { BackButton } from '@/components/BackButton';

const tvFont = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

type PlayerErrorType =
  | 'playback'
  | 'source'
  | 'search'
  | 'network'
  | 'params'
  | 'unknown';

type CurrentPlayingInfo = {
  quality: string;
  loadSpeed: string;
  pingTime: number;
  hasError?: boolean;
};

type ActualPlaybackInfo = {
  width: number;
  height: number;
  quality: string;
  level?: number;
} | null;

type TvPlayLayoutProps = {
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
  onDownload: () => void;
  artRef: RefObject<HTMLDivElement>;
  playerHeightClass: string;
  forceRotate: boolean;
  error: string | null;
  errorType: PlayerErrorType;
  onClearError: () => void;
  onTryNextSource: () => void;
  isVideoLoading: boolean;
  videoLoadingStage: 'initing' | 'sourceChanging';
  hideSidePanels: boolean;
  isEpisodeSelectorCollapsed: boolean;
  onShowEpisodes: () => void;
  onHideEpisodes: () => void;
  panelGestureRef: RefObject<HTMLDivElement>;
  episodeSelector: ReactNode;
  tt: (en: string, zhHans: string, zhHant: string) => string;
  convertToTraditional: (text?: string) => string | undefined;
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
  artRef,
  playerHeightClass,
  forceRotate,
  error,
  errorType,
  onClearError,
  onTryNextSource,
  isVideoLoading,
  videoLoadingStage,
  hideSidePanels,
  isEpisodeSelectorCollapsed,
  onShowEpisodes,
  onHideEpisodes,
  panelGestureRef,
  episodeSelector,
  tt,
  convertToTraditional,
}: TvPlayLayoutProps) => {
  const displaySource =
    convertToTraditional(sourceName || '') || sourceName || currentSource || '';
  const qualityLabel =
    actualPlaybackInfo?.quality ||
    (currentPlayingInfo?.quality
      ? localizeInfoLabel(currentPlayingInfo.quality)
      : 'NA');
  const synopsisPreview =
    synopsisText && synopsisText.trim().length > 0
      ? convertToTraditional(synopsisText) || synopsisText
      : tt('No synopsis available.', '暂无简介。', '暫無簡介。');

  return (
    <div className={`${tvFont.className} relative min-h-screen text-white`}>
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.22),transparent_55%),radial-gradient(circle_at_80%_0%,rgba(56,189,248,0.16),transparent_50%),radial-gradient(circle_at_20%_85%,rgba(99,102,241,0.14),transparent_55%),linear-gradient(120deg,#0b1020,#020617)]' />
      <div className='absolute -top-16 -right-10 h-56 w-56 rounded-full bg-emerald-500/20 blur-3xl animate-[tvFloat_9s_ease-in-out_infinite]' />
      <div className='absolute bottom-0 left-12 h-48 w-48 rounded-full bg-sky-400/15 blur-3xl animate-[tvFloat_11s_ease-in-out_infinite]' />

      <div className='relative z-10 px-[4vw] py-[3vh] space-y-5 animate-[tvFade_0.6s_ease]'>
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
            <span className='text-xs px-3 py-1 rounded-full bg-white/10 border border-white/15'>
              {tt('Quality', '清晰度', '清晰度')}: {qualityLabel}
            </span>
            <button
              type='button'
              onClick={onDownload}
              disabled={downloadButtonDisabled}
              className='px-4 py-2 rounded-full bg-emerald-400 text-black text-sm font-semibold shadow-lg shadow-emerald-500/30 hover:bg-emerald-300 disabled:opacity-60 disabled:cursor-not-allowed transition'
            >
              {downloadButtonLabel}
            </button>
          </div>
        </header>

        <section
          ref={panelGestureRef}
          className={`grid gap-5 ${
            hideSidePanels || isEpisodeSelectorCollapsed
              ? 'grid-cols-1'
              : 'lg:grid-cols-[minmax(0,3.2fr)_minmax(0,1.2fr)]'
          }`}
        >
          <div className='space-y-4'>
            <div className='relative rounded-[28px] border border-white/15 bg-black/40 shadow-[0_20px_60px_rgba(15,23,42,0.6)] overflow-hidden'>
              <div className={`relative w-full ${playerHeightClass}`} id='player-root'>
                <div className='absolute top-3 left-3 z-[605] flex flex-wrap items-center gap-2 bg-black/65 text-white rounded-lg px-3 py-2 backdrop-blur-sm max-w-[92%]'>
                  <div className='text-sm font-semibold truncate max-w-[60%]'>
                    {title}
                    {episodeLabel ? ` · ${episodeLabel}` : ''}
                  </div>
                  <div className='text-xs px-2 py-0.5 rounded-full bg-white/15 border border-white/20'>
                    {qualityLabel}
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

            <div className='flex flex-wrap items-center gap-2 text-xs text-white/70'>
              {clientInfo && (
                <span className='px-3 py-1 rounded-full bg-white/10 border border-white/15'>
                  {clientInfo}
                </span>
              )}
              {currentPlayingInfo && !currentPlayingInfo.hasError && (
                <>
                  <span className='px-3 py-1 rounded-full bg-white/10 border border-white/15'>
                    {tt('Resolution', '解析度', '解析度')}:{' '}
                    {qualityLabel}
                  </span>
                  <span className='px-3 py-1 rounded-full bg-white/10 border border-white/15'>
                    {tt('Load', '载入', '載入')}: {localizeInfoLabel(currentPlayingInfo.loadSpeed)}
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
            </div>

            <div className='rounded-2xl bg-white/5 border border-white/10 p-4 text-sm text-white/70 leading-relaxed'>
              <div className='text-[11px] uppercase tracking-[0.3em] text-white/50 mb-2'>
                {tt('Synopsis', '简介', '簡介')}
              </div>
              <p className='line-clamp-3'>{synopsisPreview}</p>
            </div>
          </div>

          {!hideSidePanels && (
            <aside
              className={`rounded-[28px] border border-white/15 bg-white/5 backdrop-blur p-3 shadow-[0_20px_45px_rgba(15,23,42,0.45)] transition-all ${
                isEpisodeSelectorCollapsed
                  ? 'opacity-0 pointer-events-none lg:opacity-100 lg:pointer-events-auto lg:max-w-[72px]'
                  : 'opacity-100'
              }`}
            >
              <div className='flex items-center justify-between px-2 pt-1 pb-2'>
                <div className='text-[11px] uppercase tracking-[0.35em] text-white/60'>
                  {tt('Episodes', '剧集', '劇集')}
                </div>
                {!isEpisodeSelectorCollapsed ? (
                  <button
                    type='button'
                    onClick={onHideEpisodes}
                    className='text-[10px] uppercase tracking-[0.3em] px-2 py-1 rounded-full bg-white/10 border border-white/15 text-white/60 hover:text-white'
                  >
                    {tt('Hide', '收起', '收起')}
                  </button>
                ) : (
                  <button
                    type='button'
                    onClick={onShowEpisodes}
                    className='text-[10px] uppercase tracking-[0.3em] px-2 py-1 rounded-full bg-white/10 border border-white/15 text-white/60 hover:text-white'
                  >
                    {tt('Show', '展开', '展開')}
                  </button>
                )}
              </div>
              <div className='h-[62vh] overflow-hidden'>
                {episodeSelector}
              </div>
            </aside>
          )}
        </section>
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
      `}</style>
    </div>
  );
};

export default TvPlayLayout;
