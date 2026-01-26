'use client';

import { useMemo, useState } from 'react';

import type { ScreenMode } from '@/lib/screenMode';

type MusicVideo = {
  id: string;
  title: string;
  artist?: string;
};

type MusicRailProps = {
  screenMode: ScreenMode;
  tt: (en: string, zhHans: string, zhHant: string) => string;
};

const MUSIC_VIDEOS: MusicVideo[] = [];

const readRuntimeVideos = (): MusicVideo[] => {
  if (typeof window === 'undefined') return [];
  const raw = (window as { RUNTIME_CONFIG?: { MUSIC_VIDEOS?: unknown } })
    .RUNTIME_CONFIG?.MUSIC_VIDEOS;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => ({
        id: String((item as { id?: unknown }).id || '').trim(),
        title: String((item as { title?: unknown }).title || '').trim(),
        artist: String((item as { artist?: unknown }).artist || '').trim() || undefined,
      }))
      .filter((item) => item.id && item.title);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => ({
            id: String((item as { id?: unknown }).id || '').trim(),
            title: String((item as { title?: unknown }).title || '').trim(),
            artist: String((item as { artist?: unknown }).artist || '').trim() || undefined,
          }))
          .filter((item) => item.id && item.title);
      }
    } catch {
      // ignore
    }
  }
  return [];
};

const buildThumbnail = (id: string) =>
  `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;

const buildEmbedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
    id
  )}?autoplay=1&rel=0&playsinline=1`;

export default function MusicRail({ screenMode, tt }: MusicRailProps) {
  const [active, setActive] = useState<MusicVideo | null>(null);
  const isTv = screenMode === 'tv';
  const isMobile = screenMode === 'mobile';
  const cardWidth = isTv ? 'min-w-[240px]' : isMobile ? 'min-w-[70%]' : 'min-w-[200px]';
  const titleClass = isTv ? 'text-2xl text-white' : 'text-xl text-gray-900 dark:text-gray-100';
  const wrapperClass = isTv
    ? 'rounded-2xl border border-white/10 bg-white/5 p-4'
    : 'rounded-2xl border border-gray-200/50 dark:border-gray-800 bg-white/60 dark:bg-gray-900/50 p-4';

  const videos = useMemo(() => {
    const runtimeVideos = readRuntimeVideos();
    if (runtimeVideos.length) return runtimeVideos;
    return MUSIC_VIDEOS;
  }, []);

  return (
    <>
      <section className={wrapperClass}>
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className={`${titleClass} font-semibold`}>
            {tt('Chinese MVs', '中文MV', '中文MV')}
          </h3>
          <span
            className={`text-xs ${isTv ? 'text-white/60' : 'text-gray-500 dark:text-gray-400'}`}
          >
            {tt('YouTube embeds', 'YouTube 嵌入', 'YouTube 嵌入')}
          </span>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-3 px-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {videos.length === 0 ? (
            <div className={`text-sm ${isTv ? 'text-white/60' : 'text-gray-500 dark:text-gray-400'}`}>
              {tt('No music videos configured.', '未配置音乐视频。', '未配置音樂視頻。')}
            </div>
          ) : (
            videos.map((video) => (
              <button
                key={video.id}
                type="button"
                onClick={() => setActive(video)}
                className={`${cardWidth} group text-left transition active:scale-[0.98]`}
              >
                <div className="relative aspect-video overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-800">
                  <img
                    src={buildThumbnail(video.id)}
                    alt={video.title}
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition" />
                  <div className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-1 text-xs text-white">
                    ▶
                  </div>
                </div>
                <div className="mt-2 space-y-0.5">
                  <p className={`text-sm font-semibold ${isTv ? 'text-white' : 'text-gray-900 dark:text-gray-100'}`}>
                    {video.title}
                  </p>
                  {video.artist && (
                    <p className={`text-xs ${isTv ? 'text-white/70' : 'text-gray-500 dark:text-gray-400'}`}>
                      {video.artist}
                    </p>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-black shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-black/80">
              <div className="text-sm text-white">
                {active.title}
                {active.artist ? ` · ${active.artist}` : ''}
              </div>
              <button
                type="button"
                className="text-white/70 hover:text-white text-lg"
                onClick={() => setActive(null)}
                aria-label={tt('Close', '关闭', '關閉')}
              >
                ×
              </button>
            </div>
            <div className="relative w-full pb-[56.25%]">
              <iframe
                title={active.title}
                src={buildEmbedUrl(active.id)}
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
