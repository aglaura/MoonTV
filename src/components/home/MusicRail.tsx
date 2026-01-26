'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import type { ScreenMode } from '@/lib/screenMode';
import {
  buildEmptyYoutubeMusicState,
  normalizeYoutubeMusicState,
} from '@/lib/youtubeMusicList';

type MusicVideo = {
  id: string;
  title: string;
  artist?: string;
};

type MusicRailProps = {
  screenMode: ScreenMode;
  tt: (en: string, zhHans: string, zhHant: string) => string;
};

const PLAYLIST_EVENT = 'moontv:youtube-playlist';
const MUSIC_LIST_EVENT = 'moontv:youtube-music-list';

const MUSIC_VIDEOS: MusicVideo[] = [
  { id: 'bu7nU9Mhpyo', title: '告白气球', artist: '周杰伦' },
  { id: 'T4SimnaiktU', title: '光年之外', artist: 'G.E.M. 邓紫棋' },
  { id: 'mtAc_bMYBsM', title: '温柔', artist: '五月天' },
  { id: 'G97_rOdHcnY', title: '江南', artist: '林俊杰' },
  { id: '_sQSXwdtxlY', title: '小幸运', artist: '田馥甄' },
  { id: 'CjcyRRu7tcc', title: '洋葱', artist: '杨宗纬' },
  { id: 'lSNRU4J73H4', title: '空白格', artist: '杨宗纬' },
  { id: 'RP4Ufhq8DI0', title: '越过山丘', artist: '杨宗纬' },
];

const buildPlaylistStorageKey = (username?: string | null) =>
  username && username.trim().length > 0
    ? `youtubePlaylist:${username.trim()}`
    : 'youtubePlaylist';

const buildMusicListStorageKey = (username?: string | null) =>
  username && username.trim().length > 0
    ? `youtubeMusicList:${username.trim()}`
    : 'youtubeMusicList';

const readRuntimePlaylistId = (): string => {
  if (typeof window === 'undefined') return '';
  const runtime = (window as { RUNTIME_CONFIG?: { YOUTUBE_PLAYLIST?: string } })
    .RUNTIME_CONFIG;
  return (runtime?.YOUTUBE_PLAYLIST || '').trim();
};

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

export default function MusicRail({ screenMode, tt }: MusicRailProps) {
  const isTv = screenMode === 'tv';
  const isMobile = screenMode === 'mobile';
  const cardWidth = isTv ? 'min-w-[240px]' : isMobile ? 'min-w-[70%]' : 'min-w-[200px]';
  const titleClass = isTv ? 'text-2xl text-white' : 'text-xl text-gray-900 dark:text-gray-100';
  const wrapperClass = isTv
    ? 'rounded-2xl border border-white/10 bg-white/5 p-4'
    : 'rounded-2xl border border-gray-200/50 dark:border-gray-800 bg-white/60 dark:bg-gray-900/50 p-4';
  const [playlistId, setPlaylistId] = useState('');
  const [playlistVideos, setPlaylistVideos] = useState<MusicVideo[]>([]);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistError, setPlaylistError] = useState('');
  const [musicState, setMusicState] = useState(
    buildEmptyYoutubeMusicState()
  );

  const videos = useMemo(() => {
    const runtimeVideos = readRuntimeVideos();
    if (runtimeVideos.length) return runtimeVideos;
    return MUSIC_VIDEOS;
  }, []);
  const buildPlayHref = (video: MusicVideo) => {
    const params = new URLSearchParams();
    params.set('id', video.id);
    params.set('title', video.title);
    if (video.artist) params.set('artist', video.artist);
    return `/play/youtube?${params.toString()}`;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let username: string | null = null;
    try {
      username = getAuthInfoFromBrowserCookie()?.username || null;
    } catch {
      username = null;
    }
    const storageKey = buildPlaylistStorageKey(username);
    const listKey = buildMusicListStorageKey(username);
    const saved = localStorage.getItem(storageKey) || '';
    const fallback = readRuntimePlaylistId();
    const nextId = (saved || fallback).trim();
    setPlaylistId(nextId);
    try {
      const listRaw = localStorage.getItem(listKey) || '';
      if (listRaw) {
        const parsed = JSON.parse(listRaw) as unknown;
        setMusicState(normalizeYoutubeMusicState(parsed));
      }
    } catch {
      // ignore
    }

    if (username) {
      fetch('/api/youtube/music-list')
        .then((res) => {
          if (!res.ok) return null;
          return res.json();
        })
        .then((data) => {
          if (!data) return;
          const nextState = normalizeYoutubeMusicState(
            data?.state ?? data?.list ?? data
          );
          setMusicState(nextState);
          localStorage.setItem(listKey, JSON.stringify(nextState));
        })
        .catch(() => {
          // ignore
        });
    }

    const handlePlaylistChange = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; key?: string }>).detail;
      if (detail?.key && detail.key !== storageKey) return;
      const next = (detail?.id || '').trim();
      setPlaylistId(next);
    };
    const handleListChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; state?: unknown }>)
        .detail;
      if (detail?.key && detail.key !== listKey) return;
      const nextState = normalizeYoutubeMusicState(detail?.state);
      setMusicState(nextState);
    };
    window.addEventListener(PLAYLIST_EVENT, handlePlaylistChange as EventListener);
    window.addEventListener(MUSIC_LIST_EVENT, handleListChange as EventListener);
    return () => {
      window.removeEventListener(
        PLAYLIST_EVENT,
        handlePlaylistChange as EventListener
      );
      window.removeEventListener(
        MUSIC_LIST_EVENT,
        handleListChange as EventListener
      );
    };
  }, []);

  useEffect(() => {
    if (!playlistId) {
      setPlaylistVideos([]);
      setPlaylistError('');
      setPlaylistLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        setPlaylistLoading(true);
        setPlaylistError('');
        const res = await fetch(
          `/api/youtube/playlist?id=${encodeURIComponent(playlistId)}`
        );
        if (!res.ok) {
          throw new Error(`YouTube ${res.status}`);
        }
        const data = (await res.json()) as {
          results?: Array<{ id: string; title: string; channel: string }>;
        };
        if (!cancelled) {
          const items = Array.isArray(data.results) ? data.results : [];
          setPlaylistVideos(
            items
              .map((item) => ({
                id: item.id,
                title: item.title,
                artist: item.channel || undefined,
              }))
              .filter((item) => item.id && item.title)
          );
        }
      } catch (err) {
        if (!cancelled) {
          setPlaylistError(
            err instanceof Error ? err.message : 'YouTube playlist error'
          );
          setPlaylistVideos([]);
        }
      } finally {
        if (!cancelled) {
          setPlaylistLoading(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  const activeList =
    musicState.lists[musicState.activeIndex] || [];
  const effectiveVideos =
    activeList.length > 0
      ? activeList
      : playlistVideos.length > 0
      ? playlistVideos
      : videos;

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
        {playlistId && (
          <div className={`mb-2 text-xs ${isTv ? 'text-white/60' : 'text-gray-500 dark:text-gray-400'}`}>
            {tt('Playlist', '播放列表', '播放清單')}: {playlistId}
            {playlistLoading && ` · ${tt('Loading…', '加载中…', '載入中…')}`}
            {playlistError && ` · ${tt('Error', '错误', '錯誤')}: ${playlistError}`}
          </div>
        )}
        <div className="flex gap-4 overflow-x-auto pb-3 px-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {effectiveVideos.length === 0 ? (
            <div className={`text-sm ${isTv ? 'text-white/60' : 'text-gray-500 dark:text-gray-400'}`}>
              {tt('No music videos configured.', '未配置音乐视频。', '未配置音樂視頻。')}
            </div>
          ) : (
            effectiveVideos.map((video) => (
              <Link
                key={video.id}
                href={buildPlayHref(video)}
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
              </Link>
            ))
          )}
        </div>
      </section>
    </>
  );
}
