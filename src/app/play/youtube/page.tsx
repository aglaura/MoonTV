'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

import PageLayout from '@/components/PageLayout';
import { useUserLanguage } from '@/lib/userLanguage.client';

const buildEmbedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
    id
  )}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;

export default function YoutubePlayPage() {
  const { userLocale } = useUserLanguage();
  const uiLocale =
    userLocale === 'zh-Hans' || userLocale === 'zh-Hant' ? userLocale : 'en';
  const tt = useCallback(
    (en: string, zhHans: string, zhHant: string) => {
      if (uiLocale === 'zh-Hans') return zhHans;
      if (uiLocale === 'zh-Hant') return zhHant;
      return en;
    },
    [uiLocale]
  );
  const searchParams = useSearchParams();
  const videoId = (searchParams.get('id') || '').trim();
  const title = (searchParams.get('title') || '').trim();
  const artist = (searchParams.get('artist') || '').trim();
  const displayTitle =
    title || tt('Untitled MV', '未命名MV', '未命名MV');
  const embedUrl = useMemo(
    () => (videoId ? buildEmbedUrl(videoId) : ''),
    [videoId]
  );

  return (
    <PageLayout activePath="/play">
      <div className="flex flex-col gap-2 py-2 px-2.5 sm:px-3.5 md:pt-10 lg:pt-2 lg:px-5 xl:px-7">
        <div className="py-1">
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {displayTitle}
            {artist && (
              <span className="ml-2 text-base text-gray-500 dark:text-gray-400 font-normal">
                {artist}
              </span>
            )}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-800 dark:text-gray-100 bg-white/70 dark:bg-gray-800/70 border border-gray-200/70 dark:border-gray-700/70 rounded-lg px-3 py-2 shadow-sm backdrop-blur">
          <span className="px-2 py-1 rounded-full bg-white/85 dark:bg-gray-800/85 font-medium border border-gray-200/80 dark:border-gray-700/60">
            {tt('Source: ', '播放来源：', '播放來源：')}YouTube
          </span>
          <span className="px-2 py-1 rounded-full bg-white/80 dark:bg-gray-800/80 border border-gray-200/80 dark:border-gray-700/60">
            {tt('Type: ', '类型：', '類型：')}MV
          </span>
        </div>

        <div className="space-y-2.5">
          <div className="relative grid gap-3 md:h-[520px] xl:h-[680px] 2xl:h-[760px] transition-all duration-300 ease-in-out grid-cols-1">
            <div className="h-full min-w-0 transition-all duration-300 ease-in-out rounded-xl border border-white/0 dark:border-white/30">
              <div className="relative w-full aspect-video md:h-full" id="player-root">
                {!videoId && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/80 text-white">
                    {tt(
                      'Missing YouTube video id.',
                      '缺少 YouTube 视频编号。',
                      '缺少 YouTube 影片編號。'
                    )}
                  </div>
                )}
                {videoId && (
                  <iframe
                    title={displayTitle}
                    src={embedUrl}
                    className="absolute inset-0 h-full w-full rounded-xl"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
