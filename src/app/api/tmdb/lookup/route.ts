import { NextResponse } from 'next/server';

import { normalizeConfigJsonBase } from '@/lib/configjson';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 86400;

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w500';
const DEFAULT_API_KEY = '2de27bb73e68f7ebdc05dfcf29a5c2ed';

type TmdbSearchItem = {
  id?: number;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  media_type?: 'movie' | 'tv';
  release_date?: string;
  first_air_date?: string;
  poster_path?: string;
};

type LookupResult = {
  tmdbId?: string;
  poster?: string;
  title?: string;
  originalTitle?: string;
  year?: string;
  mediaType?: 'movie' | 'tv';
  imdbId?: string;
};

function getApiKey() {
  return process.env.TMDB_API_KEY || DEFAULT_API_KEY;
}

function normalizeType(value?: string | null): 'movie' | 'tv' | undefined {
  if (!value) return undefined;
  if (value === 'movie' || value === 'tv') return value;
  return undefined;
}

function normalizeTmdbId(value?: string | null) {
  if (!value) return undefined;
  return value.trim().replace(/^tmdb:/, '');
}

function buildPoster(path?: string) {
  if (!path) return '';
  return `${TMDB_IMAGE}${path}`;
}

function buildCacheBase(): string | null {
  return normalizeConfigJsonBase(process.env.CONFIGJSON);
}

function sanitizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9-_]+/g, '_').slice(0, 160);
}

async function tryFetchCache(url: string) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as LookupResult;
  } catch {
    return null;
  }
}

async function tryUploadCache(url: string, data: LookupResult) {
  try {
    const buffer = Buffer.from(JSON.stringify(data));
    const putResp = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: buffer,
    });
    if (putResp.ok) return;
  } catch {
    // ignore and try fallback
  }

  try {
    const base = url.replace(/\/posters\/video_info\/.+$/, '');
    const fd = new FormData();
    fd.append(
      'fileToUpload',
      new Blob([JSON.stringify(data)], { type: 'application/json' }),
      url.split('/').pop() || 'tmdb-lookup.json'
    );
    await fetch(`${base}/posters/poster.php`, { method: 'POST', body: fd });
  } catch {
    // swallow errors; cache is best-effort
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function mapItemToResult(item: TmdbSearchItem, mediaType: 'movie' | 'tv'): LookupResult {
  const title = mediaType === 'movie' ? item.title || '' : item.name || '';
  const originalTitle =
    mediaType === 'movie' ? item.original_title || '' : item.original_name || '';
  const date = mediaType === 'movie' ? item.release_date : item.first_air_date;
  return {
    tmdbId: item.id ? `tmdb:${item.id}` : undefined,
    poster: buildPoster(item.poster_path),
    title,
    originalTitle,
    year: (date || '').slice(0, 4),
    mediaType,
  };
}

async function fetchDetail(
  apiKey: string,
  mediaType: 'movie' | 'tv',
  tmdbId: string
): Promise<LookupResult | null> {
  const detailUrl = `${TMDB_BASE}/${mediaType}/${encodeURIComponent(
    tmdbId
  )}?api_key=${encodeURIComponent(
    apiKey
  )}&language=zh-CN&append_to_response=external_ids`;
  const data = await fetchJson<Record<string, unknown>>(detailUrl);
  if (!data) return null;
  const title =
    typeof data.title === 'string'
      ? data.title
      : typeof data.name === 'string'
      ? data.name
      : '';
  const originalTitle =
    typeof data.original_title === 'string'
      ? data.original_title
      : typeof data.original_name === 'string'
      ? data.original_name
      : '';
  const releaseDate =
    typeof data.release_date === 'string'
      ? data.release_date
      : typeof data.first_air_date === 'string'
      ? data.first_air_date
      : '';
  const posterPath =
    typeof data.poster_path === 'string' ? data.poster_path : '';
  const externalIds =
    typeof data.external_ids === 'object' && data.external_ids
      ? (data.external_ids as { imdb_id?: string })
      : undefined;

  return {
    tmdbId: `tmdb:${tmdbId}`,
    poster: buildPoster(posterPath),
    title,
    originalTitle,
    year: releaseDate.slice(0, 4),
    mediaType,
    imdbId: externalIds?.imdb_id,
  };
}

async function resolveByImdb(
  apiKey: string,
  imdbId: string
): Promise<LookupResult | null> {
  const url = `${TMDB_BASE}/find/${encodeURIComponent(
    imdbId
  )}?api_key=${encodeURIComponent(apiKey)}&external_source=imdb_id&language=zh-CN`;
  const data = await fetchJson<{
    movie_results?: TmdbSearchItem[];
    tv_results?: TmdbSearchItem[];
  }>(url);
  const movie = data?.movie_results?.[0];
  if (movie?.id) {
    return fetchDetail(apiKey, 'movie', String(movie.id));
  }
  const tv = data?.tv_results?.[0];
  if (tv?.id) {
    return fetchDetail(apiKey, 'tv', String(tv.id));
  }
  return null;
}

async function resolveByTmdbId(
  apiKey: string,
  tmdbId: string,
  mediaType?: 'movie' | 'tv'
): Promise<LookupResult | null> {
  if (mediaType) {
    return fetchDetail(apiKey, mediaType, tmdbId);
  }
  const movie = await fetchDetail(apiKey, 'movie', tmdbId);
  if (movie) return movie;
  return fetchDetail(apiKey, 'tv', tmdbId);
}

async function resolveByTitle(
  apiKey: string,
  title: string,
  mediaType?: 'movie' | 'tv',
  year?: string | null
): Promise<LookupResult | null> {
  const params = new URLSearchParams();
  params.set('api_key', apiKey);
  params.set('language', 'zh-CN');
  params.set('query', title);
  params.set('include_adult', 'false');
  if (year && mediaType === 'movie') params.set('year', year);
  if (year && mediaType === 'tv') params.set('first_air_date_year', year);

  const path = mediaType ? `/search/${mediaType}` : '/search/multi';
  const url = `${TMDB_BASE}${path}?${params.toString()}`;
  const data = await fetchJson<{ results?: TmdbSearchItem[] }>(url);
  const results =
    data && Array.isArray(data.results) ? data.results : [];
  const first = results.find((item) =>
    mediaType ? true : item.media_type === 'movie' || item.media_type === 'tv'
  );
  if (!first?.id) return null;
  const resolvedType =
    mediaType || (first.media_type === 'tv' ? 'tv' : 'movie');
  return fetchDetail(apiKey, resolvedType, String(first.id));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tmdbId = normalizeTmdbId(searchParams.get('tmdbId'));
  const imdbId = searchParams.get('imdbId')?.trim();
  const title = searchParams.get('title')?.trim();
  const year = searchParams.get('year')?.trim();
  const mediaType = normalizeType(searchParams.get('type'));

  if (!tmdbId && !imdbId && !title) {
    return NextResponse.json(
      { error: 'tmdbId, imdbId, or title required' },
      { status: 400 }
    );
  }

  const cacheBase = buildCacheBase();
  const cacheKey = sanitizeKey(
    tmdbId
      ? `tmdb-${tmdbId}`
      : imdbId
      ? `imdb-${imdbId}`
      : `title-${title}-${year || ''}-${mediaType || ''}`
  );
  const cacheUrl = cacheBase
    ? `${cacheBase}/posters/video_info/tmdb-lookup-${cacheKey}.json`
    : null;

  if (cacheUrl) {
    const cached = await tryFetchCache(cacheUrl);
    if (cached) {
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=600',
          'x-cache': 'remote-hit',
        },
      });
    }
  }

  const apiKey = getApiKey();

  let result: LookupResult | null = null;
  if (tmdbId) {
    result = await resolveByTmdbId(apiKey, tmdbId, mediaType);
  }
  if (!result && imdbId) {
    result = await resolveByImdb(apiKey, imdbId);
  }
  if (!result && title) {
    result = await resolveByTitle(apiKey, title, mediaType, year);
  }

  if (!result) {
    return NextResponse.json({ error: 'No TMDB match' }, { status: 404 });
  }

  if (cacheUrl) {
    void tryUploadCache(cacheUrl, result);
  }

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': 'public, max-age=86400, stale-while-revalidate=600',
    },
  });
}
