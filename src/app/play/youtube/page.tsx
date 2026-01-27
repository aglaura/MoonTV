'use client';

import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import PageLayout from '@/components/PageLayout';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { useUserLanguage } from '@/lib/userLanguage.client';
import {
  buildEmptyYoutubeMusicState,
  MAX_YOUTUBE_MUSIC_LIST_SIZE,
  normalizeYoutubeMusicState,
} from '@/lib/youtubeMusicList';

const MUSIC_LIST_EVENT = 'moontv:youtube-music-list';
const YT_API_SRC = 'https://www.youtube.com/iframe_api';

type MusicVideo = {
  id: string;
  title: string;
  artist?: string;
};

const buildPlayHref = (video: MusicVideo) => {
  const params = new URLSearchParams();
  params.set('id', video.id);
  params.set('title', video.title);
  if (video.artist) params.set('artist', video.artist);
  return `/play/youtube?${params.toString()}`;
};

const buildThumbnail = (id: string) =>
  `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;

const buildSuggestionQuery = (
  video: MusicVideo,
  locale: 'zh-Hans' | 'zh-Hant' | 'en'
) => {
  const languageHint =
    locale === 'zh-Hant' ? '繁體中文' : locale === 'zh-Hans' ? '中文' : 'English';
  return [video.title, video.artist, 'MV', languageHint]
    .filter(Boolean)
    .join(' ');
};

const shouldFilterSuggestionTitle = (title: string) => {
  const normalized = title.toLowerCase();
  if (
    /\blive\b/i.test(normalized) ||
    /现场|現場|演唱会|演唱會|現場版|现场版|舞台/.test(title)
  ) {
    return true;
  }
  if (
    /\blyric(s)?\b/i.test(normalized) ||
    /歌词|歌詞|字幕/.test(title)
  ) {
    return true;
  }
  return false;
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
  const username = useMemo(() => {
    try {
      return getAuthInfoFromBrowserCookie()?.username || null;
    } catch {
      return null;
    }
  }, []);
  const [musicState, setMusicState] = useState(
    buildEmptyYoutubeMusicState()
  );
  const [currentVideo, setCurrentVideo] = useState<MusicVideo>({
    id: videoId,
    title: displayTitle,
    artist: artist || undefined,
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [similarVideos, setSimilarVideos] = useState<MusicVideo[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarError, setSimilarError] = useState('');
  const storageKey = useMemo(() => buildMusicListKey(username), [username]);
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<MusicVideo[]>([]);
  const useListRef = useRef(false);
  const indexRef = useRef(0);
  const activeList = useMemo(
    () => musicState.lists[musicState.activeIndex] || [],
    [musicState]
  );
  const listMemberships = useMemo(
    () =>
      musicState.lists.map((list) =>
        currentVideo.id ? list.some((item) => item.id === currentVideo.id) : false
      ),
    [currentVideo.id, musicState.lists]
  );

  useEffect(() => {
    if (!videoId) return;
    setCurrentVideo({
      id: videoId,
      title: displayTitle,
      artist: artist || undefined,
    });
  }, [artist, displayTitle, videoId]);

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
  }, [storageKey, username]);

  useEffect(() => {
    listRef.current = activeList;
    const idx = activeList.findIndex((item) => item.id === currentVideo.id);
    const useList = idx >= 0 && activeList.length > 0;
    useListRef.current = useList;
    if (useList) {
      setCurrentIndex(idx);
      indexRef.current = idx;
      const matched = activeList[idx];
      if (matched && (matched.title || matched.artist)) {
        setCurrentVideo((prev) => ({
          ...prev,
          title: matched.title || prev.title,
          artist: matched.artist || prev.artist,
        }));
      }
    }
  }, [activeList, currentVideo.id]);

  useEffect(() => {
    indexRef.current = currentIndex;
  }, [currentIndex]);

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

  const toggleInListAt = useCallback(
    (index: number) => {
      if (!currentVideo.id) return;
      const entry: MusicVideo = {
        id: currentVideo.id,
        title: currentVideo.title || displayTitle,
        artist: currentVideo.artist || artist || undefined,
      };
      const nextLists = musicState.lists.map((list, idx) => {
        if (idx !== index) return list;
        const exists = list.some((item) => item.id === currentVideo.id);
        if (exists) {
          return list.filter((item) => item.id !== currentVideo.id);
        }
        return [
          entry,
          ...list.filter((item) => item.id !== currentVideo.id),
        ].slice(0, MAX_YOUTUBE_MUSIC_LIST_SIZE);
      });
      const nextState = normalizeYoutubeMusicState({
        lists: nextLists,
        activeIndex: index,
      });
      persistState(nextState);
    },
    [artist, currentVideo, displayTitle, musicState.lists, persistState]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleListChange = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string; state?: unknown }>)
        .detail;
      if (detail?.key && detail.key !== storageKey) return;
      const nextState = normalizeYoutubeMusicState(detail?.state);
      setMusicState(nextState);
    };
    window.addEventListener(MUSIC_LIST_EVENT, handleListChange as EventListener);
    return () => {
      window.removeEventListener(
        MUSIC_LIST_EVENT,
        handleListChange as EventListener
      );
    };
  }, [storageKey]);

  useEffect(() => {
    if (!currentVideo.id || typeof window === 'undefined') return;
    const params = new URLSearchParams();
    params.set('id', currentVideo.id);
    params.set('title', currentVideo.title || displayTitle);
    if (currentVideo.artist) params.set('artist', currentVideo.artist);
    window.history.replaceState(null, '', `/play/youtube?${params.toString()}`);
  }, [currentVideo, displayTitle]);

  useEffect(() => {
    if (!currentVideo.id) {
      setSimilarVideos([]);
      setSimilarError('');
      return;
    }
    const query = buildSuggestionQuery(currentVideo, uiLocale);
    if (!query) {
      setSimilarVideos([]);
      setSimilarError('');
      return;
    }
    let cancelled = false;
    setSimilarLoading(true);
    setSimilarError('');
    fetch(`/api/youtube/search?q=${encodeURIComponent(query)}&limit=18`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const results = Array.isArray(data?.results) ? data.results : [];
        const cleaned = results
          .map((item: any) => ({
            id: String(item?.id || '').trim(),
            title: String(item?.title || '').trim(),
            artist: String(item?.channel || '').trim() || undefined,
          }))
          .filter(
            (item: MusicVideo) =>
              item.id &&
              item.title &&
              item.id !== currentVideo.id &&
              !shouldFilterSuggestionTitle(item.title)
          )
          .slice(0, 12);
        setSimilarVideos(cleaned);
      })
      .catch((err) => {
        if (cancelled) return;
        setSimilarError(err instanceof Error ? err.message : 'Failed to load');
        setSimilarVideos([]);
      })
      .finally(() => {
        if (cancelled) return;
        setSimilarLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentVideo.id, currentVideo.artist, currentVideo.title]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const ensureApi = () =>
      new Promise<void>((resolve) => {
        const ready = () => {
          if ((window as any).YT && (window as any).YT.Player) {
            resolve();
            return;
          }
          setTimeout(ready, 50);
        };
        if (document.querySelector(`script[src="${YT_API_SRC}"]`)) {
          ready();
          return;
        }
        const script = document.createElement('script');
        script.src = YT_API_SRC;
        script.async = true;
        script.onload = () => {
          ready();
        };
        document.body.appendChild(script);
      });

    ensureApi().then(() => {
      if (cancelled) return;
      if (!playerContainerRef.current || !currentVideo.id) return;
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy();
      }
      const YT = (window as any).YT;
      playerRef.current = new YT.Player(playerContainerRef.current, {
        videoId: currentVideo.id,
        playerVars: {
          autoplay: 1,
          playsinline: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onStateChange: (event: any) => {
            if (event.data !== YT.PlayerState.ENDED) return;
            if (!useListRef.current) return;
            const list = listRef.current;
            if (!list.length) return;
            const nextIndex = (indexRef.current + 1) % list.length;
            indexRef.current = nextIndex;
            const next = list[nextIndex];
            if (next) {
              setCurrentIndex(nextIndex);
              setCurrentVideo(next);
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [currentVideo.id]);

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
          {currentVideo.id && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {tt('Save to', '保存到', '保存到')}
              </span>
              {[0, 1, 2].map((idx) => {
                const selected = listMemberships[idx];
                const count = musicState.lists[idx]?.length || 0;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleInListAt(idx)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition ${
                      selected
                        ? 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600'
                        : 'bg-white/85 dark:bg-gray-800/80 text-gray-700 dark:text-gray-200 border-gray-200/80 dark:border-gray-700/60 hover:border-emerald-400'
                    }`}
                  >
                    {tt('List', '列表', '清單')} {idx + 1} · {count}/30
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-2.5">
          <div className="relative grid gap-3 md:h-[520px] xl:h-[680px] 2xl:h-[760px] transition-all duration-300 ease-in-out grid-cols-1">
            <div className="h-full min-w-0 transition-all duration-300 ease-in-out rounded-xl border border-white/0 dark:border-white/30">
              <div className="relative w-full aspect-video md:h-full" id="player-root">
                {!currentVideo.id && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/80 text-white">
                    {tt(
                      'Missing YouTube video id.',
                      '缺少 YouTube 视频编号。',
                      '缺少 YouTube 影片編號。'
                    )}
                  </div>
                )}
                {currentVideo.id && (
                  <div
                    ref={playerContainerRef}
                    className="absolute inset-0 h-full w-full rounded-xl overflow-hidden"
                  />
                )}
              </div>
            </div>
          </div>
          <section className="rounded-2xl border border-gray-200/70 dark:border-gray-700/60 bg-white/70 dark:bg-gray-900/50 px-3 py-3">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {tt('Similar videos', '相似视频', '相似影片')}
              </h2>
              {similarLoading && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {tt('Loading…', '加载中…', '載入中…')}
                </span>
              )}
            </div>
            {similarError && (
              <div className="text-xs text-rose-600 dark:text-rose-400 mb-2">
                {similarError}
              </div>
            )}
            {similarVideos.length === 0 && !similarLoading && !similarError ? (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {tt('No suggestions yet.', '暂无推荐。', '暫無推薦。')}
              </div>
            ) : (
              <div className="flex gap-3 overflow-x-auto pb-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {similarVideos.map((video) => (
                  <a
                    key={`${video.id}-similar`}
                    href={buildPlayHref(video)}
                    className="min-w-[180px] sm:min-w-[200px] group transition active:scale-[0.98]"
                  >
                    <div className="relative aspect-video overflow-hidden rounded-xl bg-gray-200 dark:bg-gray-800">
                      <img
                        src={buildThumbnail(video.id)}
                        alt={video.title}
                        className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition" />
                    </div>
                    <div className="mt-2 space-y-0.5">
                      <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 line-clamp-2">
                        {video.title}
                      </p>
                      {video.artist && (
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-1">
                          {video.artist}
                        </p>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </PageLayout>
  );
}
