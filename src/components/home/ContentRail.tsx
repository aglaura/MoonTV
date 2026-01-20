'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useRef } from 'react';

import type { CardItem } from '@/lib/home.types';
import type { ScreenMode } from '@/lib/screenMode';
import { processImageUrl } from '@/lib/utils';

import VideoCard from '@/components/VideoCard';

type ContentRailProps = {
  title: string;
  href?: string;
  items: CardItem[];
  screenMode: ScreenMode;
  tt: (en: string, zhHans: string, zhHant: string) => string;
};

type RailProps = {
  title: string;
  href?: string;
  items: CardItem[];
  tt: (en: string, zhHans: string, zhHant: string) => string;
};

type PersonVariant = 'tv' | 'tablet' | 'mobile';

const buildPersonHref = (item: CardItem) => {
  const raw = item.id ?? '';
  const value = String(raw).trim();
  if (!value) return '#';
  const normalized = value.replace(/^tmdb:/, '');
  return `/person/${encodeURIComponent(normalized)}`;
};

const renderPersonCard = (
  item: CardItem,
  variant: PersonVariant,
  tt: (en: string, zhHans: string, zhHant: string) => string
) => {
  const posterUrl = processImageUrl(item.poster || '', { preferCached: true });
  const name = item.title || tt('Unknown', '未知影人', '未知影人');
  const avatarSize =
    variant === 'tv'
      ? 'w-28 h-28'
      : variant === 'tablet'
        ? 'w-20 h-20'
        : 'w-16 h-16';
  const nameSize = variant === 'tv' ? 'text-base' : 'text-sm';
  const badgeSize = variant === 'tv' ? 'text-xs' : 'text-[10px]';

  return (
    <Link
      href={buildPersonHref(item)}
      className="group flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200/70 dark:border-gray-700/70 bg-white/70 dark:bg-gray-900/70 p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div
        className={`${avatarSize} rounded-full overflow-hidden bg-gray-200/70 dark:bg-gray-800 ring-1 ring-emerald-400/30 flex items-center justify-center`}
      >
        {posterUrl ? (
          <img
            src={posterUrl}
            alt={name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-lg font-semibold text-gray-500">
            {name.slice(0, 1).toUpperCase()}
          </span>
        )}
      </div>
      <div
        className={`${nameSize} font-semibold text-gray-900 dark:text-gray-100 text-center line-clamp-2`}
      >
        {name}
      </div>
      <span
        className={`${badgeSize} uppercase tracking-wide text-emerald-600 dark:text-emerald-300`}
      >
        {tt('Actor', '演员', '演員')}
      </span>
    </Link>
  );
};

const TvContentRail = ({ title, href, items, tt }: RailProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const noData = items.length === 0;

  return (
    <div className="relative rounded-2xl border border-gray-200/40 dark:border-gray-800 bg-white/75 dark:bg-gray-900/70 p-4 overflow-hidden group">
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-4">
          <span className="px-3 py-1.5 text-sm font-semibold rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
            {tt('TV remote', '电视遥控', '電視遙控')}
          </span>
          <h3 className="text-4xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
            {title}
          </h3>
        </div>
        {href && (
          <Link
            href={href}
            className="text-lg font-semibold text-green-700 dark:text-green-400 flex items-center gap-2 px-4 py-2 rounded-full border border-green-400/50 bg-white/70 dark:bg-white/5"
            data-tv-focusable="true"
            tabIndex={0}
          >
            {tt('See more', '查看更多', '查看更多')}
            <ChevronRight className="w-5 h-5" />
          </Link>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 pt-2 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory scroll-smooth"
        data-tv-group="rail"
        data-tv-direction="horizontal"
      >
        {noData && (
          <div className="text-gray-500 text-center py-4 min-w-[240px]">
            {tt('No data', '暂无数据', '暫無資料')}
          </div>
        )}

        {items.map((item, idx) => (
          <div
            key={idx}
            className="transition-all duration-200 opacity-95 snap-start rounded-2xl min-w-[240px] max-w-[320px]"
          >
            {item.type === 'person' ? (
              renderPersonCard(item, 'tv', tt)
            ) : (
              <VideoCard
                from="douban"
                title={item.title}
                title_en={item.title_en}
                poster={item.poster}
                posterAlt={item.posterAlt}
                posterDouban={item.posterDouban}
                posterTmdb={item.posterTmdb}
                douban_id={item.douban_id}
                imdb_id={item.imdb_id}
                rate={item.rate}
                year={item.year}
                type={item.type}
                query={item.query}
                source_name={item.source_name}
                size="lg"
                compactMeta
              />
            )}
          </div>
        ))}
      </div>

      <div className="absolute bottom-2 right-3 text-[12px] text-gray-600 dark:text-gray-300 bg-white/70 dark:bg-gray-800/80 rounded-full px-3 py-1 border border-gray-200/70 dark:border-gray-700/70 shadow-sm">
        {tt(
          'Use ← → to move, OK to open',
          '使用 ← → 导航，确认键进入',
          '使用 ← → 導航，確認鍵進入'
        )}
      </div>
    </div>
  );
};

const DesktopContentRail = ({ title, href, items, tt }: RailProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const noData = items.length === 0;

  const scrollHorizontal = (offset: number) => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  return (
    <div className="relative rounded-2xl border border-gray-200/50 dark:border-gray-800 bg-white/60 dark:bg-gray-900/50 p-4 overflow-hidden group">
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        {href && (
          <Link
            href={href}
            className="text-sm text-green-700 dark:text-green-400 hover:underline flex items-center gap-1"
          >
            {tt('See more', '查看更多', '查看更多')}
            <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <button
        onClick={() => scrollHorizontal(-450)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-20 hidden md:flex opacity-0 group-hover:opacity-100 p-3 bg-black/40 hover:bg-black/70 text-white rounded-full shadow-lg"
      >
        ‹
      </button>
      <button
        onClick={() => scrollHorizontal(450)}
        className="absolute right-0 top-1/2 -translate-y-1/2 z-20 hidden md:flex opacity-0 group-hover:opacity-100 p-3 bg-black/40 hover:bg-black/70 text-white rounded-full shadow-lg"
      >
        ›
      </button>

      <div className="pointer-events-none absolute left-0 top-0 h-full w-16 bg-gradient-to-r from-black/60 to-transparent z-10" />
      <div className="pointer-events-none absolute right-0 top-0 h-full w-16 bg-gradient-to-l from-black/60 to-transparent z-10" />

      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-3 px-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {noData && (
          <div className="text-gray-500 py-4 w-full text-center">
            {tt('No data', '暂无数据', '暫無資料')}
          </div>
        )}
        {items.map((item, idx) => (
          <div key={idx} className="min-w-[180px] transform transition hover:scale-105">
            {item.type === 'person' ? (
              renderPersonCard(item, 'tablet', tt)
            ) : (
              <VideoCard
                from="douban"
                title={item.title}
                title_en={item.title_en}
                poster={item.poster}
                posterAlt={item.posterAlt}
                posterDouban={item.posterDouban}
                posterTmdb={item.posterTmdb}
                douban_id={item.douban_id}
                imdb_id={item.imdb_id}
                rate={item.rate}
                year={item.year}
                type={item.type}
                query={item.query}
                source_name={item.source_name}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const MobileContentRail = ({ title, href, items, tt }: RailProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const noData = items.length === 0;

  return (
    <div className="relative rounded-2xl border border-gray-200/50 dark:border-gray-800 bg-white/60 dark:bg-gray-900/50 p-3 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        {href && (
          <Link
            href={href}
            className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1"
          >
            {tt('See more', '查看更多', '查看更多')}
            <ChevronRight className="w-4 h-4" />
          </Link>
        )}
      </div>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-3 px-1 scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x snap-mandatory scroll-pl-4 pr-6 touch-pan-x overscroll-x-contain"
      >
        {noData && (
          <div className="text-gray-500 py-4 text-center w-full">
            {tt('No data', '暂无数据', '暫無資料')}
          </div>
        )}
        {items.map((item, idx) => (
          <div
            key={idx}
            className="snap-start min-w-[47%] active:scale-[0.97] transition-transform"
          >
            {item.type === 'person' ? (
              renderPersonCard(item, 'mobile', tt)
            ) : (
              <VideoCard
                from="douban"
                title={item.title}
                title_en={item.title_en}
                poster={item.poster}
                posterAlt={item.posterAlt}
                posterDouban={item.posterDouban}
                posterTmdb={item.posterTmdb}
                douban_id={item.douban_id}
                imdb_id={item.imdb_id}
                rate={item.rate}
                year={item.year}
                type={item.type}
                query={item.query}
                source_name={item.source_name}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default function ContentRail({
  title,
  href,
  items,
  screenMode,
  tt,
}: ContentRailProps) {
  if (screenMode === 'tv') {
    return <TvContentRail title={title} href={href} items={items} tt={tt} />;
  }
  if (screenMode === 'mobile') {
    return <MobileContentRail title={title} href={href} items={items} tt={tt} />;
  }
  return <DesktopContentRail title={title} href={href} items={items} tt={tt} />;
}
