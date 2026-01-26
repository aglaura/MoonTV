'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import PageLayout from '@/components/PageLayout';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { useUserLanguage } from '@/lib/userLanguage.client';

const buildEmbedUrl = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
    id
  )}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;

const MUSIC_LIST_EVENT = 'moontv:youtube-music-list';

type MusicVideo = {
  id: string;
  title: string;
  artist?: string;
};

const buildMusicListKey = (username?: string | null) =>
  username && username.trim().length > 0
    ? `youtubeMusicList:${username.trim()}`
    : 'youtubeMusicList';

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
  const username = useMemo(() => {
    try {
      return getAuthInfoFromBrowserCookie()?.username || null;
    } catch {
      return null;
    }
  }, []);
  const [musicList, setMusicList] = useState<MusicVideo[]>([]);
  const [inList, setInList] = useState(false);
  const storageKey = useMemo(() => buildMusicListKey(username), [username]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey) || '';
      if (raw) {
        const parsed = JSON.parse(raw) as MusicVideo[];
        if (Array.isArray(parsed)) {
          setMusicList(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
    setMusicList([]);
  }, [storageKey]);

  useEffect(() => {
    if (!videoId) {
      setInList(false);
      return;
    }
    setInList(musicList.some((item) => item.id === videoId));
  }, [musicList, videoId]);

  const persistList = useCallback(
    (next: MusicVideo[]) => {
      setMusicList(next);
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(next));
        window.dispatchEvent(
          new CustomEvent(MUSIC_LIST_EVENT, {
            detail: { key: storageKey, list: next },
          })
        );
      }
    },
    [storageKey]
  );

  const toggleInList = useCallback(() => {
    if (!videoId) return;
    const entry: MusicVideo = {
      id: videoId,
      title: displayTitle,
      artist: artist || undefined,
    };
    if (inList) {
      persistList(musicList.filter((item) => item.id !== videoId));
    } else {
      const next = [
        entry,
        ...musicList.filter((item) => item.id !== videoId),
      ];
      persistList(next);
    }
  }, [artist, displayTitle, inList, musicList, persistList, videoId]);

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
          {videoId && (
            <button
              type="button"
              onClick={toggleInList}
              className={`px-3 py-1.5 rounded-full text-white shadow-sm border ${
                inList
                  ? 'bg-rose-500 border-rose-400 hover:bg-rose-600'
                  : 'bg-emerald-500 border-emerald-400 hover:bg-emerald-600'
              }`}
            >
              {inList
                ? tt('Remove from My MVs', '从我的MV移除', '從我的MV移除')
                : tt('Add to My MVs', '加入我的MV', '加入我的MV')}
            </button>
          )}
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
