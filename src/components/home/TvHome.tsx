'use client';

import { useRouter } from 'next/navigation';
import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { ScreenMode } from '@/lib/screenMode';
import { processImageUrl } from '@/lib/utils';

/* =========================
   Types
========================= */
type CardItem = {
  title: string;
  title_en?: string;
  poster?: string;
  posterAlt?: string[];
  posterDouban?: string;
  posterTmdb?: string;
  douban_id?: number;
  imdb_id?: string;
  rate?: string;
  year?: string;
  type?: string;
  query?: string;
  source_name?: string;
  id?: string | number;
};

type ContentRailProps = {
  title: string;
  href?: string;
  items: CardItem[];
  screenMode: ScreenMode;
  tt: (en: string, zhHans: string, zhHant: string) => string;
};

type CategoryData = Record<string, { items: CardItem[] }>;

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

type Row = { id: string; title: string; tiles: Tile[] };

type FocusKey = string;

type RailItem = {
  id: string;
  label: string;
  href: string;
};

/* =========================
   Utils
========================= */
function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function resolvePoster(item: CardItem) {
  return (
    item.poster ||
    item.posterAlt?.[0] ||
    item.posterDouban ||
    item.posterTmdb ||
    ''
  );
}

function buildPlayUrl(item: CardItem) {
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
  return `/play?title=${encodeURIComponent(title)}${year}${type}${query}${douban}${imdb}`;
}

/* =========================
   Main Page
========================= */
const TvHome = ({
  tt,
  heroItems,
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

  const rows = useMemo<Row[]>(() => {
    const continueItems = normalizeItems(effectiveLatestMovies).slice(0, 12);
    const trendingItems = normalizeItems(effectiveTmdbMovies).slice(0, 14);
    const recommendedItems = normalizeItems(effectiveTmdbTv).slice(0, 16);
    const latestTvItems = normalizeItems(effectiveLatestTv).slice(0, 14);
    const peopleItems = normalizeItems(effectiveTmdbPeople).slice(0, 10);

    return [
      {
        id: 'continue',
        title: tt('Continue Watching', '继续观看', '繼續觀看'),
        tiles: continueItems,
      },
      {
        id: 'trending',
        title: tt('Trending Now', '正在流行', '正在流行'),
        tiles: trendingItems,
      },
      {
        id: 'recommended',
        title: tt('Recommended', '为你推荐', '為你推薦'),
        tiles: recommendedItems,
      },
      {
        id: 'latest-tv',
        title: tt('Latest TV', '最新剧集', '最新劇集'),
        tiles: latestTvItems,
      },
      {
        id: 'people',
        title: tt('Popular People', '热门人物', '熱門人物'),
        tiles: peopleItems,
      },
    ].filter((row) => row.tiles.length > 0);
  }, [
    effectiveLatestMovies,
    effectiveTmdbMovies,
    effectiveTmdbTv,
    effectiveLatestTv,
    effectiveTmdbPeople,
    normalizeItems,
    tt,
  ]);

  const [focus, setFocus] = useState<FocusKey>('hero:play');
  const [activeRail, setActiveRail] = useState('home');
  const [railOpen, setRailOpen] = useState(false);
  const [heroIndex, setHeroIndex] = useState(0);

  const lastContentFocus = useRef<FocusKey>('hero:play');
  const rowMemory = useRef<Record<string, number>>({});

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

  const activeHero = heroList.length
    ? heroList[Math.abs(heroIndex) % heroList.length]
    : undefined;

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
    if (heroList.length === 0) return;
    setFocus('hero:play');
  }, [heroList.length]);

  const openRail = useCallback(() => {
    setRailOpen(true);
    setFocus(`rail:${activeRail}`);
  }, [activeRail]);

  const closeRail = useCallback(() => {
    setRailOpen(false);
    setFocus(lastContentFocus.current);
  }, []);

  const handleSelectItem = useCallback(
    (item: CardItem) => {
      router.push(buildPlayUrl(item));
    },
    [router]
  );

  const handleHeroAction = useCallback(
    (action: 'play' | 'info') => {
      if (!activeHero) return;
      if (action === 'play') {
        router.push(buildPlayUrl(activeHero));
        return;
      }
      router.push(buildPlayUrl(activeHero));
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
        if (dir === 'left') return openRail();
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
            openRail();
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
    [closeRail, focus, openRail, parseFocus, railItems, rows]
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)
      ) {
        e.preventDefault();
      }
      if (e.key === 'ArrowUp') move('up');
      if (e.key === 'ArrowDown') move('down');
      if (e.key === 'ArrowLeft') move('left');
      if (e.key === 'ArrowRight') move('right');
      if (e.key === 'Enter') {
        const el = focusRefs.current.get(focus);
        if (el) {
          el.click();
          e.preventDefault();
        }
      }
      if (e.key === 'Backspace' || e.key === 'Escape') {
        if (railOpen) closeRail();
      }
    };
    window.addEventListener('keydown', h, { passive: false });
    return () => window.removeEventListener('keydown', h);
  }, [closeRail, focus, move, railOpen]);

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
                <img
                  src={processImageUrl(activeHero.poster, {
                    doubanId: activeHero.douban_id,
                    imdbId: activeHero.imdb_id,
                    preferCached: true,
                  })}
                  alt={activeHero.title}
                  className='absolute inset-0 h-full w-full object-cover opacity-50 scale-110'
                  loading='lazy'
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
}: {
  row: Row;
  focus: FocusKey;
  register: (k: FocusKey) => (el: HTMLElement | null) => void;
  onSelect: (item: CardItem) => void;
}) {
  const CARD_W = 210;
  const GAP = 16;
  const SPAN = CARD_W + GAP;

  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const parts = focus.split(':');
    if (parts[0] !== 'row' || parts[1] !== row.id) return;
    scroller.current?.scrollTo({
      left: Number(parts[2]) * SPAN,
      behavior: 'smooth',
    });
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
            return (
              <button
                key={tile.id ?? `${row.id}-${i}`}
                ref={register(k)}
                tabIndex={-1}
                data-tv-focusable='true'
                className={clsx(
                  'w-[210px] h-[315px] rounded-[24px] bg-white/10 relative shrink-0 overflow-hidden transition',
                  focus === k && 'ring-2 ring-white scale-105'
                )}
                onClick={() => onSelect(tile)}
              >
                {posterUrl ? (
                  <img
                    src={posterUrl}
                    alt={tile.title}
                    className='absolute inset-0 h-full w-full object-cover'
                    loading='lazy'
                  />
                ) : (
                  <div className='absolute inset-0 bg-white/10' />
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
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default memo(TvHome);
