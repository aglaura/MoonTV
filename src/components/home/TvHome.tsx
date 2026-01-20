'use client';

import { useRouter } from 'next/navigation';
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ImgHTMLAttributes,
} from 'react';

import type { CardItem, CategoryData } from '@/lib/home.types';
import type { ScreenMode } from '@/lib/screenMode';
import { useTvRemote, type TvKey } from '@/lib/tvInput';
import { processImageUrl } from '@/lib/utils';

import RetryImage from '@/components/RetryImage';
import { useTvInput } from '@/components/TvInputProvider';
/* =========================
   Types
========================= */

type ContentRailProps = {
  title: string;
  href?: string;
  items: CardItem[];
  screenMode: ScreenMode;
  tt: (en: string, zhHans: string, zhHant: string) => string;
};

type TvHomeProps = {
  tt: (en: string, zhHans: string, zhHant: string) => string;
  screenMode: ScreenMode;
  heroItems: CardItem[];
  categoryData: CategoryData;
  effectiveTmdbMovies: CardItem[];
  effectiveLatestMovies: CardItem[];
  effectiveTmdbTv: CardItem[];
  effectiveLatestTv: CardItem[];
  effectiveTmdbPeople: CardItem[];
  applyKidsFilter: (items: CardItem[]) => CardItem[];
  applyPosterOverrides: (items: CardItem[]) => CardItem[];
  loading: boolean;
  error: boolean;
  tvSectionClass: (
    id: 'hero' | 'continue' | 'rail-movie' | 'rail-tv' | 'rail-variety'
  ) => string;
  ContentRail: React.ComponentType<ContentRailProps>;
};

type Tile = CardItem & { badge?: string; subtitle?: string };

type RowKind = 'poster' | 'person';
type Row = { id: string; title: string; tiles: Tile[]; kind?: RowKind };

type FocusKey = string;
type SpotlightKind = 'movie' | 'tv' | 'variety' | 'anime' | 'person';

type RailItem = {
  id: string;
  label: string;
  href: string;
};

const HOME_STATE_KEY = 'tv-home-state-v1';

/* =========================
   Utils
========================= */
function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

type RailImageProps = {
  src: string;
  alt: string;
  className?: string;
  skeletonClassName?: string;
  loading?: ImgHTMLAttributes<HTMLImageElement>['loading'];
  decoding?: ImgHTMLAttributes<HTMLImageElement>['decoding'];
  onError?: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void;
  onLoad?: (event: React.SyntheticEvent<HTMLImageElement, Event>) => void;
};

function RailImage({
  src,
  alt,
  className,
  skeletonClassName,
  loading,
  decoding,
  onError,
  onLoad,
}: RailImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!src) return null;

  const handleLoad = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setLoaded(true);
    onLoad?.(event);
  };

  const handleError = (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setFailed(true);
    onError?.(event);
  };

  return (
    <>
      {!loaded && !failed && (
        <div
          className={
            skeletonClassName || 'absolute inset-0 bg-white/10 animate-pulse'
          }
        />
      )}
      <RetryImage
        src={src}
        alt={alt}
        className={className}
        loading={loading}
        decoding={decoding}
        onLoad={handleLoad}
        onError={handleError}
      />
    </>
  );
}

function resolvePoster(item: CardItem) {
  const raw =
    item.poster ||
    item.profile ||
    item.posterAlt?.[0] ||
    item.posterDouban ||
    item.posterTmdb ||
    item.profile_path ||
    '';
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  if (raw.startsWith('http') || raw.startsWith('/api/')) return raw;
  if (raw.startsWith('image.tmdb.org')) return `https://${raw}`;
  const source = (item.source_name || '').toLowerCase();
  const id = String(item.id || '');
  if (raw.startsWith('/') && (source === 'tmdb' || id.startsWith('tmdb:'))) {
    const base =
      item.type === 'person'
        ? 'https://image.tmdb.org/t/p/w300'
        : 'https://image.tmdb.org/t/p/w500';
    return `${base}${raw}`;
  }
  return raw;
}

function buildPlayUrl(item: CardItem, basePath = '/play') {
  const title = item.title?.trim() || '';
  const year = item.year ? `&year=${encodeURIComponent(item.year)}` : '';
  const type = item.type ? `&stype=${encodeURIComponent(item.type)}` : '';
  const query = item.query
    ? `&stitle=${encodeURIComponent(item.query)}`
    : '';
  const douban =
    typeof item.douban_id === 'number' && item.douban_id > 0
      ? `&douban_id=${item.douban_id}`
      : '';
  const imdb = item.imdb_id ? `&imdbId=${encodeURIComponent(item.imdb_id)}` : '';
  return `${basePath}?title=${encodeURIComponent(title)}${year}${type}${query}${douban}${imdb}`;
}

function buildTvDetailUrl(item: CardItem) {
  return buildPlayUrl(item, '/play/tvdetail');
}

function buildTvPlayUrl(item: CardItem) {
  return buildPlayUrl(item, '/play/tvplay');
}

function buildPersonUrl(item: CardItem) {
  const raw = item.id !== undefined && item.id !== null ? String(item.id) : '';
  const normalized = raw.replace(/^tmdb:/, '');
  return normalized ? `/person/${encodeURIComponent(normalized)}` : '/';
}

function getItemKey(item: CardItem) {
  if (typeof item.douban_id === 'number' && item.douban_id > 0) {
    return `douban:${item.douban_id}`;
  }
  if (item.imdb_id) return `imdb:${item.imdb_id.toLowerCase()}`;
  if (item.id !== undefined && item.id !== null) return `id:${item.id}`;
  const title = (item.title || '').trim().toLowerCase().replace(/\s+/g, '');
  return `${title}__${item.year || ''}`;
}

function dedupeItems(items: CardItem[]) {
  const seen = new Set<string>();
  const result: CardItem[] = [];
  items.forEach((item) => {
    const key = getItemKey(item);
    if (!key) return;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });
  return result;
}

function normalizeSpotlightKind(type?: string): SpotlightKind | null {
  if (!type) return null;
  const raw = type.toLowerCase();
  if (raw.includes('person')) return 'person';
  if (raw.includes('movie')) return 'movie';
  if (raw.includes('tv') || raw.includes('series')) return 'tv';
  if (raw.includes('show') || raw.includes('variety')) return 'variety';
  if (raw.includes('anime') || raw.includes('animation')) return 'anime';
  return null;
}

function inferSpotlightKind(
  item: CardItem | undefined,
  categoryData: CategoryData
): SpotlightKind {
  if (!item) return 'movie';
  const normalized = normalizeSpotlightKind(item.type);
  if (normalized) return normalized;

  const itemKey = getItemKey(item);
  if (!itemKey) return 'movie';

  const entries = Object.entries(categoryData);
  for (const [key, value] of entries) {
    if (!value || !Array.isArray(value.items)) continue;
    const match = value.items.some((entry) => getItemKey(entry) === itemKey);
    if (!match) continue;
    if (key === 'movie') return 'movie';
    if (key.startsWith('tv-')) return 'tv';
    if (key === 'variety') return 'variety';
    if (key === 'anime') return 'anime';
  }

  return 'movie';
}

/* =========================
   Main Page
========================= */
const TvHome = ({
  tt,
  heroItems,
  categoryData,
  effectiveTmdbMovies,
  effectiveLatestMovies,
  effectiveTmdbTv,
  effectiveLatestTv,
  effectiveTmdbPeople,
  applyKidsFilter,
  applyPosterOverrides,
  loading,
  error,
}: TvHomeProps) => {
  const router = useRouter();
  const railItems = useMemo<RailItem[]>(
    () => [
      { id: 'home', label: tt('Home', '首页', '首頁'), href: '/?tab=home' },
      { id: 'search', label: tt('Search', '搜索', '搜尋'), href: '/search' },
      {
        id: 'movies',
        label: tt('Movies', '电影', '電影'),
        href: '/douban?type=movie',
      },
      {
        id: 'series',
        label: tt('Series', '剧集', '劇集'),
        href: '/douban?type=tv',
      },
      {
        id: 'settings',
        label: tt('Settings', '设置', '設定'),
        href: '/admin',
      },
    ],
    [tt]
  );

  const normalizeItems = useCallback(
    (items: CardItem[] = []) =>
      applyPosterOverrides(applyKidsFilter(items)).filter((item) => item.title),
    [applyKidsFilter, applyPosterOverrides]
  );

  const heroList = useMemo(
    () => normalizeItems(heroItems).slice(0, 8),
    [heroItems, normalizeItems]
  );

  const [heroIndex, setHeroIndex] = useState(0);

  const activeHero = heroList.length
    ? heroList[Math.abs(heroIndex) % heroList.length]
    : undefined;
  const spotlightKind = useMemo(
    () => inferSpotlightKind(activeHero, categoryData),
    [activeHero, categoryData]
  );

  const rows = useMemo<Row[]>(() => {
    const movieItems = normalizeItems(categoryData.movie?.items || []);
    const tvItems = normalizeItems(
      dedupeItems([
        ...(categoryData['tv-cn']?.items || []),
        ...(categoryData['tv-kr']?.items || []),
        ...(categoryData['tv-jp']?.items || []),
        ...(categoryData['tv-us']?.items || []),
      ])
    );
    const varietyItems = normalizeItems(categoryData.variety?.items || []);
    const animeItems = normalizeItems(categoryData.anime?.items || []);
    const trendingMovies = normalizeItems(effectiveTmdbMovies);
    const latestMovies = normalizeItems(effectiveLatestMovies);
    const trendingTv = normalizeItems(effectiveTmdbTv);
    const latestTv = normalizeItems(effectiveLatestTv);
    const peopleItems = normalizeItems(effectiveTmdbPeople).slice(0, 10);

    const heroKey = activeHero ? getItemKey(activeHero) : '';
    const buildItems = (items: CardItem[], limit: number) => {
      const output: CardItem[] = [];
      const seen = new Set<string>();
      items.forEach((item) => {
        if (output.length >= limit) return;
        const key = getItemKey(item);
        if (!key) return;
        if (heroKey && key === heroKey) return;
        if (seen.has(key)) return;
        seen.add(key);
        output.push(item);
      });
      return output;
    };

    let relatedTitle = tt('More like this', '更多类似内容', '更多類似內容');
    let trendingTitle = tt('Trending picks', '热门推荐', '熱門推薦');
    let latestTitle = tt('Latest picks', '最新推荐', '最新推薦');
    let relatedItems: CardItem[] = [];
    let trendingItems: CardItem[] = [];
    let latestItems: CardItem[] = [];

    if (spotlightKind === 'tv') {
      relatedTitle = tt('More series like this', '更多类似剧集', '更多類似劇集');
      trendingTitle = tt('Trending series', '热门剧集', '熱門劇集');
      latestTitle = tt('Latest series', '最新剧集', '最新劇集');
      relatedItems = buildItems(tvItems.length ? tvItems : trendingTv, 14);
      trendingItems = buildItems(trendingTv.length ? trendingTv : tvItems, 14);
      latestItems = buildItems(latestTv.length ? latestTv : tvItems, 14);
    } else if (spotlightKind === 'variety') {
      relatedTitle = tt('More variety like this', '更多类似综艺', '更多類似綜藝');
      trendingTitle = tt('Trending variety', '热门综艺', '熱門綜藝');
      latestTitle = tt('Latest variety', '最新综艺', '最新綜藝');
      relatedItems = buildItems(varietyItems, 14);
      trendingItems = buildItems(varietyItems, 14);
      latestItems = buildItems(varietyItems, 14);
    } else if (spotlightKind === 'anime') {
      relatedTitle = tt('More anime like this', '更多类似动画', '更多類似動畫');
      trendingTitle = tt('Trending anime', '热门动画', '熱門動畫');
      latestTitle = tt('Latest anime', '最新动画', '最新動畫');
      relatedItems = buildItems(animeItems, 14);
      trendingItems = buildItems(animeItems, 14);
      latestItems = buildItems(animeItems, 14);
    } else {
      relatedTitle = tt('More movies like this', '更多类似电影', '更多類似電影');
      trendingTitle = tt('Trending movies', '热门电影', '熱門電影');
      latestTitle = tt('Latest movies', '最新电影', '最新電影');
      relatedItems = buildItems(movieItems.length ? movieItems : trendingMovies, 14);
      trendingItems = buildItems(trendingMovies.length ? trendingMovies : movieItems, 14);
      latestItems = buildItems(latestMovies.length ? latestMovies : movieItems, 14);
    }

    const list: Row[] = [
      { id: 'related', title: relatedTitle, tiles: relatedItems },
      { id: 'trending', title: trendingTitle, tiles: trendingItems },
      { id: 'latest', title: latestTitle, tiles: latestItems },
    ];

    if (peopleItems.length > 0 && spotlightKind !== 'person') {
      list.push({
        id: 'people',
        title: tt('Popular People', '热门人物', '熱門人物'),
        tiles: peopleItems,
        kind: 'person',
      });
    }

    return list.filter((row) => row.tiles.length > 0);
  }, [
    activeHero,
    categoryData,
    effectiveLatestMovies,
    effectiveLatestTv,
    effectiveTmdbMovies,
    effectiveTmdbPeople,
    effectiveTmdbTv,
    normalizeItems,
    spotlightKind,
    tt,
  ]);

  const [focus, setFocus] = useState<FocusKey>('hero:play');
  const [activeRail, setActiveRail] = useState('home');
  const [railOpen, setRailOpen] = useState(false);
  const tvInput = useTvInput();

  const lastContentFocus = useRef<FocusKey>('hero:play');
  const rowMemory = useRef<Record<string, number>>({});
  const hasRestoredRef = useRef(false);
  const focusableSelector =
    '[data-tv-focusable="true"], button, [role="button"], a, [tabindex="0"]';

  const focusRefs = useRef<Map<FocusKey, HTMLElement>>(new Map());
  const register = useCallback(
    (k: FocusKey) => (el: HTMLElement | null) => {
      if (!el) {
        focusRefs.current.delete(k);
        return;
      }
      const focusable =
        el.querySelector<HTMLElement>(
          '[data-tv-focusable="true"], button, [role="button"], a, [tabindex="0"]'
        ) || el;
      focusRefs.current.set(k, focusable);
    },
    []
  );

  const parseFocus = useCallback((k: FocusKey) => {
    const p = k.split(':');
    if (p[0] === 'rail') return { area: 'rail', railId: p[1] } as const;
    if (p[0] === 'hero') return { area: 'hero', btn: p[1] } as const;
    return { area: 'row', rowId: p[1], index: Number(p[2]) } as const;
  }, []);

  useEffect(() => {
    if (!heroList.length) return;
    if (focus.startsWith('hero:')) return;
    const timer = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % heroList.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [heroList.length, focus]);

  useEffect(() => {
    const el = focusRefs.current.get(focus);
    el?.focus({ preventScroll: true });

    const f = parseFocus(focus);
    if (f.area !== 'row') {
      el?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        behavior: 'smooth',
      });
    }
    if (f.area === 'row') rowMemory.current[f.rowId] = f.index;
    if (f.area !== 'rail') lastContentFocus.current = focus;
  }, [focus, parseFocus]);

  useEffect(() => {
    const f = parseFocus(focus);
    if (f.area !== 'row') return;
    const row = rows.find((item) => item.id === f.rowId);
    if (!row) {
      if (rows.length > 0) {
        setFocus(`row:${rows[0].id}:0`);
      } else {
        setFocus('hero:play');
      }
      return;
    }
    if (f.index >= row.tiles.length) {
      const nextIndex = Math.max(row.tiles.length - 1, 0);
      setFocus(`row:${row.id}:${nextIndex}`);
    }
  }, [focus, parseFocus, rows]);

  const requestSidebarPeek = useCallback(() => {
    const focused = tvInput?.requestSidebarFocus() ?? false;
    if (!focused) {
      setRailOpen(true);
      setFocus(`rail:${activeRail}`);
    }
  }, [activeRail, tvInput]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!rows.length) return;
    const raw = sessionStorage.getItem(HOME_STATE_KEY);
    if (!raw) return;

    try {
      const state = JSON.parse(raw);
      if (state?.rowMemory) rowMemory.current = state.rowMemory;
      if (typeof state?.heroIndex === 'number') setHeroIndex(state.heroIndex);
      if (typeof state?.focus === 'string') setFocus(state.focus);
      hasRestoredRef.current = true;
    } catch {
      // ignore malformed state
    }
  }, [rows.length]);

  useEffect(() => {
    return () => {
      if (typeof window === 'undefined') return;
      const state = {
        focus,
        rowMemory: rowMemory.current,
        heroIndex,
      };
      sessionStorage.setItem(HOME_STATE_KEY, JSON.stringify(state));
    };
  }, [focus, heroIndex]);

  useEffect(() => {
    if (heroList.length === 0) return;
    if (hasRestoredRef.current) return;
    setFocus('hero:play');
  }, [heroList.length]);

  const closeRail = useCallback(() => {
    setRailOpen(false);
    setFocus(lastContentFocus.current);
  }, []);

  const handleSelectItem = useCallback(
    (item: CardItem, kind?: RowKind) => {
      if (kind === 'person') {
        router.push(buildPersonUrl(item));
        return;
      }
      router.push(buildTvDetailUrl(item));
    },
    [router]
  );

  const handleHeroAction = useCallback(
    (action: 'play' | 'info') => {
      if (!activeHero) return;
      if (action === 'play') {
        router.push(buildTvPlayUrl(activeHero));
        return;
      }
      router.push(buildTvDetailUrl(activeHero));
    },
    [activeHero, router]
  );

  const move = useCallback(
    (dir: 'up' | 'down' | 'left' | 'right') => {
      const f = parseFocus(focus);

      if (f.area === 'rail') {
        const i = railItems.findIndex((r) => r.id === f.railId);
        if (dir === 'up' || dir === 'down') {
          const next = Math.max(
            0,
            Math.min(railItems.length - 1, i + (dir === 'up' ? -1 : 1))
          );
          setActiveRail(railItems[next].id);
          setFocus(`rail:${railItems[next].id}`);
        }
        if (dir === 'right') closeRail();
        return;
      }

      if (f.area === 'hero') {
        if (dir === 'left') return requestSidebarPeek();
        if (dir === 'right')
          setFocus(f.btn === 'play' ? 'hero:info' : 'hero:play');
        if (dir === 'down') {
          const row = rows[0];
          if (!row) return;
          const idx = rowMemory.current[row.id] ?? 0;
          setFocus(`row:${row.id}:${Math.min(idx, row.tiles.length - 1)}`);
        }
        return;
      }

      if (f.area === 'row') {
        const rIdx = rows.findIndex((r) => r.id === f.rowId);
        const row = rows[rIdx];
        if (!row) return;
        const max = row.tiles.length - 1;

        if (dir === 'left') {
          if (f.index === 0) {
            rowMemory.current[row.id] = Math.max(
              rowMemory.current[row.id] ?? 0,
              0
            );
            requestSidebarPeek();
          } else {
            setFocus(`row:${row.id}:${f.index - 1}`);
          }
        }

        if (dir === 'right') {
          if (f.index < max) setFocus(`row:${row.id}:${f.index + 1}`);
        }

        if (dir === 'up') {
          if (rIdx === 0) setFocus('hero:play');
          else {
            const prevRow = rows[rIdx - 1];
            const idx = rowMemory.current[prevRow.id] ?? f.index;
            setFocus(
              `row:${prevRow.id}:${Math.min(idx, prevRow.tiles.length - 1)}`
            );
          }
        }

        if (dir === 'down') {
          if (rIdx < rows.length - 1) {
            const nextRow = rows[rIdx + 1];
            const idx = rowMemory.current[nextRow.id] ?? f.index;
            setFocus(
              `row:${nextRow.id}:${Math.min(idx, nextRow.tiles.length - 1)}`
            );
          }
        }
      }
    },
    [closeRail, focus, parseFocus, railItems, requestSidebarPeek, rows]
  );

  const handleTvKey = useCallback(
    (key: TvKey) => {
      const activeEl = document.activeElement as HTMLElement | null;
      const sidebar = document.querySelector<HTMLElement>('[data-sidebar]');
      if (sidebar && activeEl && sidebar.contains(activeEl)) {
        if (key === 'right') closeRail();
        return;
      }

      if (key === 'up') move('up');
      if (key === 'down') move('down');
      if (key === 'left') move('left');
      if (key === 'right') move('right');
      if (key === 'select') {
        const el = focusRefs.current.get(focus);
        el?.click();
      }
      if (key === 'back') {
        if (railOpen) closeRail();
      }
    },
    [closeRail, focus, move, railOpen]
  );

  useTvRemote(handleTvKey, true);

  if (loading) {
    return (
      <div className='min-h-screen bg-black text-white flex items-center justify-center'>
        <div className='text-sm text-white/70'>
          {tt('Loading...', '加载中...', '載入中...')}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='min-h-screen bg-black text-white flex items-center justify-center'>
        <div className='text-sm text-white/70'>
          {tt(
            'Unable to load content right now.',
            '暂时无法加载内容。',
            '暫時無法載入內容。'
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      data-tv-nav='manual'
      className='bg-black text-white min-h-screen'
      style={{ padding: '3vh 3vw' }}
    >
      <div className='flex gap-6'>
        {/* AUTO-HIDE RAIL */}
        <aside
          className={clsx(
            'transition-all duration-200 overflow-hidden',
            railOpen ? 'w-[240px]' : 'w-0'
          )}
        >
          <div className='w-[240px] space-y-2'>
            {railItems.map((item) => {
              const k = `rail:${item.id}`;
              return (
                <button
                  key={item.id}
                  ref={register(k)}
                  tabIndex={-1}
                  data-tv-focusable='true'
                  className={clsx(
                    'block w-full text-left px-4 py-3 rounded-2xl transition',
                    focus === k
                      ? 'ring-2 ring-white scale-105 bg-white/10'
                      : 'bg-white/5 hover:bg-white/10'
                  )}
                  onClick={() => {
                    setActiveRail(item.id);
                    router.push(item.href);
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </aside>

        {/* MAIN */}
        <main className='flex-1 overflow-hidden'>
          <div className='h-[84vh] overflow-y-auto'>
            {/* HERO */}
            <section
              className={clsx(
                'rounded-[28px] p-8 mb-10 relative overflow-hidden',
                'bg-white/5 border border-white/10'
              )}
              data-tv-section='hero'
            >
              {activeHero?.poster && (
                <RailImage
                  src={processImageUrl(activeHero.poster, {
                    doubanId: activeHero.douban_id,
                    imdbId: activeHero.imdb_id,
                    preferCached: true,
                  })}
                  alt={activeHero.title || ''}
                  className='absolute inset-0 h-full w-full object-cover opacity-50 scale-110'
                  skeletonClassName='absolute inset-0 bg-white/5 animate-pulse'
                  loading='lazy'
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div className='absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent'></div>
              <div className='absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent'></div>
              <div className='relative z-10 space-y-4'>
                <div className='text-xs uppercase tracking-[0.3em] text-white/70'>
                  {tt('Spotlight', '精选', '精選')}
                </div>
                <h1 className='text-4xl font-semibold'>
                  {activeHero?.title || tt('Featured', '精选推荐', '精選推薦')}
                </h1>
                {activeHero?.title_en && (
                  <p className='text-sm text-white/70'>{activeHero.title_en}</p>
                )}
                <div className='flex flex-wrap gap-2 text-xs text-white/70'>
                  {activeHero?.year && (
                    <span className='px-2 py-1 rounded-full bg-white/10'>
                      {activeHero.year}
                    </span>
                  )}
                  {activeHero?.rate && (
                    <span className='px-2 py-1 rounded-full bg-white/10'>
                      {tt('Rating', '评分', '評分')} {activeHero.rate}
                    </span>
                  )}
                  {activeHero?.type && (
                    <span className='px-2 py-1 rounded-full bg-white/10'>
                      {activeHero.type}
                    </span>
                  )}
                </div>
                <div className='flex gap-4'>
                  {(['play', 'info'] as const).map((b) => {
                    const k = `hero:${b}`;
                    return (
                      <button
                        key={b}
                        ref={register(k)}
                        tabIndex={-1}
                        data-tv-focusable='true'
                        className={clsx(
                          'px-6 py-4 rounded-2xl bg-white text-black font-semibold transition',
                          focus === k && 'ring-2 ring-white scale-105'
                        )}
                        onClick={() => handleHeroAction(b)}
                      >
                        {b === 'play'
                          ? tt('Play', '播放', '播放')
                          : tt('Info', '详情', '詳情')}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* ROWS */}
            {rows.map((row) => (
              <PosterRow
                key={row.id}
                row={row}
                focus={focus}
                register={register}
                onSelect={handleSelectItem}
                kind={row.kind}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
};

/* =========================
   Poster Row (SNAP SCROLL)
========================= */
function PosterRow({
  row,
  focus,
  register,
  onSelect,
  kind = 'poster',
}: {
  row: Row;
  focus: FocusKey;
  register: (k: FocusKey) => (el: HTMLElement | null) => void;
  onSelect: (item: CardItem, kind?: RowKind) => void;
  kind?: RowKind;
}) {
  const CARD_W = 210;
  const GAP = 16;
  const SPAN = CARD_W + GAP;

  const scroller = useRef<HTMLDivElement | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const parts = focus.split(':');
    if (parts[0] !== 'row' || parts[1] !== row.id) return;
    scroller.current?.scrollTo({
      left: Number(parts[2]) * SPAN,
      behavior: 'smooth',
    });
  }, [focus, row.id]);

  useEffect(() => {
    const parts = focus.split(':');
    if (parts[0] !== 'row' || parts[1] !== row.id) {
      setPreviewIndex(null);
      if (previewTimer.current) {
        clearTimeout(previewTimer.current);
        previewTimer.current = null;
      }
      return;
    }

    const index = Number(parts[2]);
    if (previewTimer.current) {
      clearTimeout(previewTimer.current);
    }
    previewTimer.current = setTimeout(() => {
      setPreviewIndex(index);
    }, 700);

    return () => {
      if (previewTimer.current) {
        clearTimeout(previewTimer.current);
        previewTimer.current = null;
      }
    };
  }, [focus, row.id]);

  return (
    <section className='mb-10'>
      <h2 className='text-2xl mb-3'>{row.title}</h2>
      <div ref={scroller} className='overflow-hidden'>
        <div className='flex gap-4'>
          {row.tiles.map((tile, i) => {
            const k = `row:${row.id}:${i}`;
            const posterUrl = processImageUrl(resolvePoster(tile), {
              doubanId: tile.douban_id,
              imdbId: tile.imdb_id,
              preferCached: true,
            });
            const isPerson = kind === 'person';
            return (
              <button
                key={tile.id ?? `${row.id}-${i}`}
                ref={register(k)}
                tabIndex={-1}
                data-tv-focusable='true'
                className={clsx(
                  isPerson
                    ? 'w-[200px] h-[250px] rounded-[24px] bg-white/10 relative shrink-0 overflow-hidden transition'
                    : 'w-[210px] h-[315px] rounded-[24px] bg-white/10 relative shrink-0 overflow-hidden transition',
                  focus === k && 'ring-2 ring-white scale-105'
                )}
                onClick={() => onSelect(tile, kind)}
              >
                {isPerson ? (
                  <div className='flex h-full flex-col items-center justify-center gap-4 px-4'>
                    <div className='relative w-36 h-36 rounded-full overflow-hidden bg-white/15 ring-1 ring-white/20 flex items-center justify-center'>
                      <span className='absolute inset-0 flex items-center justify-center text-xl font-semibold text-white/70'>
                        {(tile.title || '?').slice(0, 1).toUpperCase()}
                      </span>
                      {posterUrl && (
                        <RailImage
                          src={posterUrl}
                          alt={tile.title}
                          className='absolute inset-0 h-full w-full object-cover'
                          skeletonClassName='absolute inset-0 bg-white/15 animate-pulse'
                          loading='lazy'
                          onError={(event) => {
                            event.currentTarget.style.display = 'none';
                          }}
                        />
                      )}
                    </div>
                    <div className='text-center'>
                      <div className='text-base font-semibold'>{tile.title}</div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className='absolute inset-0 bg-white/10' />
                    {posterUrl && (
                      <RailImage
                        src={posterUrl}
                        alt={tile.title}
                        className='absolute inset-0 h-full w-full object-cover'
                        skeletonClassName='absolute inset-0 bg-white/10 animate-pulse'
                        loading='lazy'
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    <div className='absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent'></div>
                    <div className='absolute bottom-0 p-4 text-left'>
                      <div className='text-lg font-semibold'>{tile.title}</div>
                      {tile.year && (
                        <div className='text-sm opacity-70'>{tile.year}</div>
                      )}
                    </div>
                    {tile.rate && (
                      <div className='absolute top-3 right-3 px-2 py-1 rounded-full bg-white/20 text-xs'>
                        {tile.rate}
                      </div>
                    )}
                  </>
                )}
                {!isPerson && previewIndex === i && (
                  <div className='absolute inset-0 z-10 bg-black/30'>
                    <div className='absolute inset-0 animate-pulse bg-white/10' />
                    <div className='absolute bottom-3 left-3 text-xs bg-black/70 px-2 py-1 rounded'>
                      Preview
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default memo(TvHome);
