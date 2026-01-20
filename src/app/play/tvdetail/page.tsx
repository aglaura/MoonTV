'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

import PageLayout from '@/components/PageLayout';
import { getDoubanSubjectDetail } from '@/lib/douban.client';
import { convertToTraditional } from '@/lib/locale';
import { getOMDBData, type OMDBEnrichment } from '@/lib/omdb.client';
import {
  getTvmazeContribution,
  type TvmazeContribution,
} from '@/lib/tvmaze.client';
import RetryImage from '@/components/RetryImage';
import { processImageUrl } from '@/lib/utils';
import { useUserLanguage } from '@/lib/userLanguage.client';
import type { DoubanSubjectDetail } from '@/lib/types';

const pickTitle = (primary: string, fallback: string, locale: string) => {
  const value = primary || fallback;
  if (!value) return '';
  return locale === 'zh-Hant' ? convertToTraditional(value) : value;
};

export default function TvDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userLocale } = useUserLanguage();
  const locale =
    userLocale === 'zh-Hans' || userLocale === 'zh-Hant' ? userLocale : 'en';
  const tt = useCallback(
    (en: string, zhHans: string, zhHant: string) => {
      if (locale === 'zh-Hans') return zhHans;
      if (locale === 'zh-Hant') return zhHant;
      return en;
    },
    [locale]
  );

  const titleParam = searchParams.get('title') || '';
  const queryParam = searchParams.get('stitle') || '';
  const yearParam = searchParams.get('year') || '';
  const rateParam = searchParams.get('rate') || '';
  const posterParam = searchParams.get('poster') || '';
  const imdbId = searchParams.get('imdbId') || '';
  const tmdbId =
    searchParams.get('tmdbId') || searchParams.get('tmdb_id') || '';
  const doubanId = searchParams.get('douban_id') || '';

  const displayTitle = useMemo(
    () => pickTitle(titleParam, queryParam, locale),
    [locale, queryParam, titleParam]
  );

  const [detail, setDetail] = useState<DoubanSubjectDetail | null>(null);
  const [omdb, setOmdb] = useState<OMDBEnrichment | null>(null);
  const [tvmaze, setTvmaze] = useState<TvmazeContribution | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      setLoading(true);
      const tasks: Array<Promise<void>> = [];

      if (doubanId) {
        tasks.push(
          getDoubanSubjectDetail(doubanId).then((data) => {
            if (!isActive) return;
            setDetail(data);
          })
        );
      }
      if (imdbId) {
        tasks.push(
          getOMDBData(imdbId).then((data) => {
            if (!isActive) return;
            setOmdb(data);
          })
        );
      }
      if (imdbId || tmdbId) {
        tasks.push(
          getTvmazeContribution({ imdbId, tmdbId }).then((data) => {
            if (!isActive) return;
            setTvmaze(data);
          })
        );
      }

      if (tasks.length === 0) {
        setLoading(false);
        return;
      }

      await Promise.allSettled(tasks);
      if (isActive) {
        setLoading(false);
      }
    };

    load();

    return () => {
      isActive = false;
    };
  }, [doubanId, imdbId, tmdbId]);

  const tvmazeStatusLabel = useMemo(() => {
    if (!tvmaze?.status) return '';
    const statusMap: Record<string, string> = {
      Running: tt('Running', '连载中', '連載中'),
      Ended: tt('Ended', '已完结', '已完結'),
      'To Be Determined': tt('TBD', '待定', '待定'),
      'In Development': tt('In development', '开发中', '開發中'),
    };
    return statusMap[tvmaze.status] || tvmaze.status;
  }, [tvmaze?.status, tt]);

  const tvmazeNextEpisodeLabel = useMemo(() => {
    const next = tvmaze?.nextEpisode;
    if (!next?.airdate) return '';
    const se = [
      next.season ? `S${next.season}` : '',
      next.number ? `E${next.number}` : '',
    ]
      .filter(Boolean)
      .join('');
    return [se, next.airdate].filter(Boolean).join(' · ');
  }, [tvmaze?.nextEpisode]);

  const posterUrl = useMemo(() => {
    const raw = posterParam || omdb?.poster || '';
    return raw ? processImageUrl(raw, { preferCached: true }) : '';
  }, [omdb?.poster, posterParam]);

  const playUrl = useMemo(() => {
    const qs = searchParams.toString();
    return qs ? `/play/tvplay?${qs}` : '/play/tvplay';
  }, [searchParams]);

  const chips = useMemo(() => {
    const items: string[] = [];
    const genres = detail?.genres || (omdb?.genres ? omdb.genres.split(',') : []);
    const countries = detail?.countries || (omdb?.countries ? omdb.countries.split(',') : []);
    const languages = detail?.languages || (omdb?.languages ? omdb.languages.split(',') : []);

    [...genres, ...countries, ...languages]
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => items.push(item));

    return Array.from(new Set(items)).slice(0, 8);
  }, [detail, omdb]);

  const synopsis =
    omdb?.plot ||
    tt('No synopsis available yet.', '暂无简介。', '暫無簡介。');

  return (
    <PageLayout activePath='/play/tvdetail'>
      <div className='px-6 py-10 lg:px-12'>
        <div className='mx-auto max-w-6xl space-y-8'>
          <section className='relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-6 lg:p-10'>
            {posterUrl && (
              <RetryImage
                src={posterUrl}
                alt={displayTitle}
                className='absolute inset-0 h-full w-full object-cover opacity-20'
                loading='lazy'
                onError={(event) => {
                  event.currentTarget.style.display = 'none';
                }}
              />
            )}
            <div className='absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/30' />
            <div className='relative z-10 grid gap-8 lg:grid-cols-[260px_1fr]'>
              <div className='flex items-center justify-center'>
                <div className='relative w-52 h-72 rounded-2xl overflow-hidden bg-white/10 shadow-lg ring-1 ring-white/20'>
                  <div className='absolute inset-0 bg-white/10' />
                  {posterUrl && (
                    <RetryImage
                      src={posterUrl}
                      alt={displayTitle}
                      className='absolute inset-0 h-full w-full object-cover'
                      loading='lazy'
                      onError={(event) => {
                        event.currentTarget.style.display = 'none';
                      }}
                    />
                  )}
                  {!posterUrl && (
                    <div className='h-full w-full flex items-center justify-center text-white/60'>
                      {tt('No poster', '暂无海报', '暫無海報')}
                    </div>
                  )}
                </div>
              </div>
              <div className='space-y-4'>
                <div className='space-y-2'>
                  <div className='text-xs uppercase tracking-[0.35em] text-white/60'>
                    {tt('TV detail', '电视详情', '電視詳情')}
                  </div>
                  <h1 className='text-3xl lg:text-4xl font-semibold text-white'>
                    {displayTitle || tt('Untitled', '未命名', '未命名')}
                  </h1>
                  {yearParam && (
                    <div className='text-sm text-white/70'>
                      {tt('Year', '年份', '年份')}: {yearParam}
                    </div>
                  )}
                </div>
                <div className='flex flex-wrap gap-2 text-xs text-white/70'>
                  {rateParam && (
                    <span className='rounded-full bg-white/15 px-3 py-1'>
                      {tt('Rating', '评分', '評分')} {rateParam}
                    </span>
                  )}
                  {omdb?.imdbRating && (
                    <span className='rounded-full bg-white/15 px-3 py-1'>
                      IMDb {omdb.imdbRating}
                    </span>
                  )}
                  {(tvmaze?.totalEpisodes || detail?.episodes) && (
                    <span className='rounded-full bg-white/15 px-3 py-1'>
                      {tt('Episodes', '集数', '集數')}:{' '}
                      {tvmaze?.totalEpisodes || detail?.episodes}
                    </span>
                  )}
                  {tvmazeStatusLabel && (
                    <span className='rounded-full bg-white/15 px-3 py-1'>
                      {tt('Status', '状态', '狀態')}: {tvmazeStatusLabel}
                    </span>
                  )}
                  {tvmazeNextEpisodeLabel && (
                    <span className='rounded-full bg-white/15 px-3 py-1'>
                      {tt('Next', '下一集', '下一集')}: {tvmazeNextEpisodeLabel}
                    </span>
                  )}
                </div>
                {chips.length > 0 && (
                  <div className='flex flex-wrap gap-2 text-xs text-white/60'>
                    {chips.map((chip) => (
                      <span
                        key={chip}
                        className='rounded-full border border-white/20 px-3 py-1'
                      >
                        {chip}
                      </span>
                    ))}
                  </div>
                )}
                <div className='flex flex-wrap gap-3'>
                  <button
                    type='button'
                    onClick={() => router.push(playUrl)}
                    className='rounded-full bg-white text-black px-6 py-3 text-sm font-semibold hover:bg-white/90'
                  >
                    {tt('Play', '播放', '播放')}
                  </button>
                  <button
                    type='button'
                    onClick={() => router.back()}
                    className='rounded-full border border-white/30 text-white px-6 py-3 text-sm font-semibold hover:border-white/60'
                  >
                    {tt('Back', '返回', '返回')}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className='rounded-3xl border border-white/10 bg-white/5 p-6 lg:p-8'>
            <div className='flex items-center justify-between mb-4'>
              <h2 className='text-xl font-semibold text-white'>
                {tt('Synopsis', '剧情简介', '劇情簡介')}
              </h2>
              {loading && (
                <span className='text-xs text-white/50'>
                  {tt('Loading…', '加载中…', '載入中…')}
                </span>
              )}
            </div>
            <p className='text-sm leading-7 text-white/70 whitespace-pre-line'>
              {synopsis}
            </p>
          </section>

          {(detail?.directors?.length || detail?.actors?.length || omdb?.actors) && (
            <section className='rounded-3xl border border-white/10 bg-white/5 p-6 lg:p-8'>
              <h2 className='text-xl font-semibold text-white mb-4'>
                {tt('Cast & Crew', '主创', '主創')}
              </h2>
              <div className='space-y-3 text-sm text-white/70'>
                {detail?.directors && detail.directors.length > 0 && (
                  <div>
                    <span className='text-white/90 font-semibold'>
                      {tt('Directors', '导演', '導演')}:
                    </span>{' '}
                    {detail.directors.join(', ')}
                  </div>
                )}
                {detail?.actors && detail.actors.length > 0 && (
                  <div>
                    <span className='text-white/90 font-semibold'>
                      {tt('Actors', '演员', '演員')}:
                    </span>{' '}
                    {detail.actors.join(', ')}
                  </div>
                )}
                {!detail?.actors?.length && omdb?.actors && (
                  <div>
                    <span className='text-white/90 font-semibold'>
                      {tt('Actors', '演员', '演員')}:
                    </span>{' '}
                    {omdb.actors}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
