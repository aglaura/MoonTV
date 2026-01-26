'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import PageLayout from '@/components/PageLayout';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { useUserLanguage } from '@/lib/userLanguage.client';
import {
  buildEmptyYoutubeMusicState,
  normalizeYoutubeMusicState,
} from '@/lib/youtubeMusicList';

type MusicVideo = {
  id: string;
  title: string;
  artist?: string;
};

const MUSIC_LIST_EVENT = 'moontv:youtube-music-list';

const buildMusicListStorageKey = (username?: string | null) =>
  username && username.trim().length > 0
    ? `youtubeMusicList:${username.trim()}`
    : 'youtubeMusicList';

const buildPlayHref = (video: MusicVideo) => {
  const params = new URLSearchParams();
  params.set('id', video.id);
  params.set('title', video.title);
  if (video.artist) params.set('artist', video.artist);
  return `/play/youtube?${params.toString()}`;
};

const buildThumbnail = (id: string) =>
  `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;

export default function MusicPage() {
  const { userLocale } = useUserLanguage();
  const locale =
    userLocale === 'zh-Hans' || userLocale === 'zh-Hant' ? userLocale : 'en';
  const t = (en: string, zhHans: string, zhHant: string) => {
    if (locale === 'zh-Hans') return zhHans;
    if (locale === 'zh-Hant') return zhHant;
    return en;
  };
  const username = useMemo(() => {
    try {
      return getAuthInfoFromBrowserCookie()?.username || null;
    } catch {
      return null;
    }
  }, []);
  const storageKey = useMemo(() => buildMusicListStorageKey(username), [username]);
  const [musicState, setMusicState] = useState(
    buildEmptyYoutubeMusicState()
  );
  const activeList = useMemo(
    () => musicState.lists[musicState.activeIndex] || [],
    [musicState]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey) || '';
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        setMusicState(normalizeYoutubeMusicState(parsed));
      } else {
        setMusicState(buildEmptyYoutubeMusicState());
      }
    } catch {
      setMusicState(buildEmptyYoutubeMusicState());
    }

    if (username) {
      fetch('/api/youtube/music-list')
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (!data) return;
          const nextState = normalizeYoutubeMusicState(
            data?.state ?? data?.list ?? data
          );
          setMusicState(nextState);
          localStorage.setItem(storageKey, JSON.stringify(nextState));
        })
        .catch(() => {
          // ignore
        });
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) return;
      try {
        const nextState = normalizeYoutubeMusicState(
          event.newValue ? JSON.parse(event.newValue) : []
        );
        setMusicState(nextState);
      } catch {
        // ignore
      }
    };
    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; state?: unknown }>)
        .detail;
      if (detail?.key && detail.key !== storageKey) return;
      const nextState = normalizeYoutubeMusicState(detail?.state);
      setMusicState(nextState);
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(MUSIC_LIST_EVENT, handleCustom as EventListener);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(MUSIC_LIST_EVENT, handleCustom as EventListener);
    };
  }, [storageKey, username]);

  const persistState = useCallback(
    (nextState: ReturnType<typeof normalizeYoutubeMusicState>) => {
      const normalized = normalizeYoutubeMusicState(nextState);
      setMusicState(normalized);
      if (typeof window !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(normalized));
        window.dispatchEvent(
          new CustomEvent(MUSIC_LIST_EVENT, {
            detail: { key: storageKey, state: normalized },
          })
        );
      }
      if (username) {
        fetch('/api/youtube/music-list', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: normalized }),
        }).catch(() => {
          // ignore
        });
      }
    },
    [storageKey, username]
  );

  const handleSelectList = useCallback(
    (index: number) => {
      const nextState = normalizeYoutubeMusicState({
        lists: musicState.lists,
        activeIndex: index,
      });
      persistState(nextState);
    },
    [musicState.lists, persistState]
  );

  return (
    <PageLayout activePath="/music">
      <div className="flex flex-col gap-4 py-4 px-3 sm:px-4 md:px-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
            {t('My Music', '我的音乐', '我的音樂')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t(
              'Your saved YouTube music videos.',
              '你保存的 YouTube 音乐视频。',
              '你保存的 YouTube 音樂影片。'
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[0, 1, 2].map((idx) => {
            const count = musicState.lists[idx]?.length || 0;
            const active = idx === musicState.activeIndex;
            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectList(idx)}
                className={`px-3 py-1.5 rounded-full text-xs border transition ${
                  active
                    ? 'bg-emerald-500 text-white border-emerald-500'
                    : 'bg-white/80 dark:bg-gray-900/40 text-gray-600 dark:text-gray-300 border-gray-200/70 dark:border-gray-700/60 hover:border-emerald-400'
                }`}
              >
                {t('List', '列表', '清單')} {idx + 1} · {count}/30
              </button>
            );
          })}
        </div>

        {activeList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300/70 dark:border-gray-700/60 bg-white/70 dark:bg-gray-900/40 p-6 text-center text-sm text-gray-500 dark:text-gray-400">
            {t(
              'No music videos yet. Add from the player or search results.',
              '暂无音乐视频。可在播放页或搜索结果中添加。',
              '暫無音樂影片。可在播放頁或搜尋結果中新增。'
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {activeList.map((video) => (
              <Link
                key={video.id}
                href={buildPlayHref(video)}
                className="group rounded-2xl border border-gray-200/70 dark:border-gray-700/60 bg-white/80 dark:bg-gray-900/50 overflow-hidden transition active:scale-[0.98]"
              >
                <div className="relative aspect-video bg-gray-200 dark:bg-gray-800">
                  <img
                    src={buildThumbnail(video.id)}
                    alt={video.title}
                    className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-black/15 opacity-0 group-hover:opacity-100 transition" />
                </div>
                <div className="p-3">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                    {video.title}
                  </div>
                  {video.artist && (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                      {video.artist}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}
