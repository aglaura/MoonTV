'use client';

export type TvmazeContribution = {
  tvmaze_id: number;
  status?: 'Running' | 'Ended' | 'To Be Determined' | 'In Development';
  premiered?: string;
  ended?: string;
  schedule?: {
    days: string[];
    time: string;
  };
  seasons?: Array<{
    season: number;
    episodeCount: number;
  }>;
  totalEpisodes?: number;
  nextEpisode?: {
    season: number;
    number: number;
    airdate: string;
  };
  runtime?: number;
  averageRuntime?: number;
};

type TvmazeShow = {
  id: number;
  status?: string;
  premiered?: string;
  ended?: string;
  runtime?: number | null;
  averageRuntime?: number | null;
  schedule?: {
    time?: string | null;
    days?: string[] | null;
  };
  _links?: {
    nextepisode?: {
      href?: string;
    };
  };
};

type TvmazeSeason = {
  id: number;
  number?: number | null;
  episodeOrder?: number | null;
};

type TvmazeEpisode = {
  season?: number | null;
  number?: number | null;
  airdate?: string | null;
  airstamp?: string | null;
};

const TVMAZE_CACHE_TTL_MS = 1000 * 60 * 60 * 12;
const tvmazeCache = new Map<
  string,
  { cachedAt: number; data: TvmazeContribution | null }
>();

const normalizeImdbId = (value?: string | null) => {
  if (!value) return undefined;
  const match = value.trim().match(/(tt\d{5,}|imdbt\d+)/i);
  return match ? match[0].toLowerCase() : undefined;
};

const normalizeTmdbId = (value?: string | null) => {
  if (!value) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  if (raw.startsWith('tmdb:')) return raw.replace('tmdb:', '');
  const match = raw.match(/themoviedb\.org\/(?:movie|tv)\/(\d+)/i);
  if (match?.[1]) return match[1];
  if (/^\d+$/.test(raw)) return raw;
  return undefined;
};

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function fetchTvmazeShow(
  key: 'imdb' | 'tmdb',
  value: string
): Promise<TvmazeShow | null> {
  const url = `https://api.tvmaze.com/lookup/shows?${key}=${encodeURIComponent(
    value
  )}`;
  return fetchJson<TvmazeShow>(url);
}

async function fetchTvmazeSeasons(showId: number): Promise<TvmazeSeason[]> {
  const url = `https://api.tvmaze.com/shows/${showId}/seasons`;
  const data = await fetchJson<TvmazeSeason[]>(url);
  return Array.isArray(data) ? data : [];
}

async function fetchTvmazeNextEpisode(
  href?: string
): Promise<TvmazeContribution['nextEpisode']> {
  if (!href) return undefined;
  const data = await fetchJson<TvmazeEpisode>(href);
  if (!data?.airdate && !data?.airstamp) return undefined;
  const airdate = data.airdate || data.airstamp || '';
  if (!airdate) return undefined;
  return {
    season: data.season ?? 0,
    number: data.number ?? 0,
    airdate,
  };
}

export async function getTvmazeContribution({
  imdbId,
  tmdbId,
}: {
  imdbId?: string | null;
  tmdbId?: string | null;
}): Promise<TvmazeContribution | null> {
  const normalizedImdb = normalizeImdbId(imdbId);
  const normalizedTmdb = normalizeTmdbId(tmdbId);
  const cacheKey = normalizedImdb
    ? `imdb:${normalizedImdb}`
    : normalizedTmdb
    ? `tmdb:${normalizedTmdb}`
    : '';

  if (!cacheKey) return null;

  const cached = tvmazeCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < TVMAZE_CACHE_TTL_MS) {
    return cached.data;
  }

  let show: TvmazeShow | null = null;
  if (normalizedImdb) {
    show = await fetchTvmazeShow('imdb', normalizedImdb);
  }
  if (!show && normalizedTmdb) {
    show = await fetchTvmazeShow('tmdb', normalizedTmdb);
  }

  if (!show?.id) {
    tvmazeCache.set(cacheKey, { cachedAt: Date.now(), data: null });
    return null;
  }

  const [seasons, nextEpisode] = await Promise.all([
    fetchTvmazeSeasons(show.id),
    fetchTvmazeNextEpisode(show._links?.nextepisode?.href),
  ]);

  const normalizedSeasons = seasons
    .map((season) => ({
      season: season.number ?? 0,
      episodeCount: season.episodeOrder ?? 0,
    }))
    .filter((season) => season.season > 0 || season.episodeCount > 0);

  const totalEpisodes = normalizedSeasons.reduce(
    (sum, season) => sum + (season.episodeCount || 0),
    0
  );

  const contribution: TvmazeContribution = {
    tvmaze_id: show.id,
    status: show.status as TvmazeContribution['status'],
    premiered: show.premiered || undefined,
    ended: show.ended || undefined,
    schedule: {
      days: show.schedule?.days?.filter(Boolean) || [],
      time: show.schedule?.time || '',
    },
    seasons: normalizedSeasons.length ? normalizedSeasons : undefined,
    totalEpisodes: totalEpisodes > 0 ? totalEpisodes : undefined,
    nextEpisode,
    runtime: show.runtime ?? undefined,
    averageRuntime: show.averageRuntime ?? undefined,
  };

  tvmazeCache.set(cacheKey, { cachedAt: Date.now(), data: contribution });
  return contribution;
}
