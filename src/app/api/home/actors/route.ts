import { NextResponse } from 'next/server';

import type { CardItem, TvRegion } from '@/lib/home.types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_PROFILE = 'https://image.tmdb.org/t/p/w300';
const DEFAULT_API_KEY = '2de27bb73e68f7ebdc05dfcf29a5c2ed';

type ActorSourceItem = {
  tmdb_id?: string;
  imdb_id?: string;
  douban_id?: number;
  title?: string;
  year?: string;
  type?: 'movie' | 'tv';
  weight?: number;
};

type ActorScoreEntry = {
  score: number;
  name: string;
  profile: string;
  tmdbId: string;
};

type TmdbFindResponse = {
  movie_results?: Array<{ id?: number }>;
  tv_results?: Array<{ id?: number }>;
};

type TmdbSearchResponse = {
  results?: Array<{
    id?: number;
    media_type?: 'movie' | 'tv';
  }>;
};

type TmdbSearchItem = {
  id?: number;
  media_type?: 'movie' | 'tv';
};

type TmdbPerson = {
  id?: number;
  name?: string;
  profile_path?: string;
  known_for_department?: string;
  known_for?: Array<{
    original_language?: string;
    origin_country?: string[];
  }>;
};

const MAX_SOURCE_ITEMS = 12;
const MAX_ACTORS = 18;

const normalizeTmdbId = (value?: string) => {
  if (!value) return '';
  return value.toString().trim().replace(/^tmdb:/, '');
};

const normalizeImdbId = (value?: string) => {
  if (!value) return '';
  const match = value.match(/(tt\d{5,}|imdbt\d+)/i);
  return match ? match[0].toLowerCase() : '';
};

const normalizeTitleKey = (value?: string) =>
  (value || '').trim().toLowerCase().replace(/\s+/g, ' ');

const buildActorCard = (entry: ActorScoreEntry): CardItem => ({
  title: entry.name,
  poster: entry.profile,
  type: 'person',
  query: entry.name,
  source_name: 'TMDB',
  id: `tmdb:${entry.tmdbId}`,
});

const getApiKey = () => process.env.TMDB_API_KEY || DEFAULT_API_KEY;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function resolveByImdb(apiKey: string, imdbId: string) {
  const url = `${TMDB_BASE}/find/${encodeURIComponent(
    imdbId
  )}?api_key=${encodeURIComponent(apiKey)}&external_source=imdb_id&language=en-US`;
  const data = await fetchJson<TmdbFindResponse>(url);
  const movie = data?.movie_results?.[0];
  if (movie?.id) {
    return { tmdbId: String(movie.id), mediaType: 'movie' as const };
  }
  const tv = data?.tv_results?.[0];
  if (tv?.id) {
    return { tmdbId: String(tv.id), mediaType: 'tv' as const };
  }
  return null;
}

async function resolveByTitle(
  apiKey: string,
  title: string,
  mediaType?: 'movie' | 'tv',
  year?: string
) {
  const params = new URLSearchParams();
  params.set('api_key', apiKey);
  params.set('language', 'en-US');
  params.set('include_adult', 'false');
  params.set('query', title);
  if (year && mediaType === 'movie') params.set('year', year);
  if (year && mediaType === 'tv') params.set('first_air_date_year', year);

  const endpoint = mediaType
    ? `/search/${mediaType}`
    : '/search/multi';
  const url = `${TMDB_BASE}${endpoint}?${params.toString()}`;
  const data = await fetchJson<TmdbSearchResponse>(url);
  const results = Array.isArray(data?.results) ? data?.results ?? [] : [];

  let candidate: TmdbSearchItem | undefined;
  if (mediaType) {
    candidate = results.find((item) => item?.id);
    return candidate?.id
      ? { tmdbId: String(candidate.id), mediaType }
      : null;
  }

  candidate = results.find(
    (item) => item?.id && (item.media_type === 'movie' || item.media_type === 'tv')
  );
  if (!candidate?.id || !candidate.media_type) return null;
  return { tmdbId: String(candidate.id), mediaType: candidate.media_type };
}

async function fetchCredits(
  apiKey: string,
  mediaType: 'movie' | 'tv',
  tmdbId: string
) {
  const url = `${TMDB_BASE}/${mediaType}/${encodeURIComponent(
    tmdbId
  )}/credits?api_key=${encodeURIComponent(apiKey)}&language=en-US`;
  const data = await fetchJson<{ cast?: Array<{ id?: number; name?: string; profile_path?: string }> }>(url);
  const cast = Array.isArray(data?.cast) ? data.cast : [];
  return cast.slice(0, 3).map((member) => ({
    tmdbId: member?.id ? String(member.id) : '',
    name: member?.name || '',
    profile: member?.profile_path ? `${TMDB_PROFILE}${member.profile_path}` : '',
  }));
}

function matchRegion(person: TmdbPerson, region: TvRegion) {
  if (region === 'en') return true;
  const knownFor = Array.isArray(person.known_for) ? person.known_for : [];
  const languages = knownFor
    .map((item) => (item?.original_language || '').toLowerCase())
    .filter(Boolean);
  const countries = knownFor
    .flatMap((item) => item?.origin_country || [])
    .map((value) => value.toUpperCase());
  if (region === 'cn') {
    return (
      languages.some((lang) => lang === 'zh') ||
      countries.some((c) => ['CN', 'HK', 'TW', 'SG'].includes(c))
    );
  }
  if (region === 'kr') {
    return (
      languages.some((lang) => lang === 'ko') ||
      countries.includes('KR')
    );
  }
  if (region === 'jp') {
    return (
      languages.some((lang) => lang === 'ja') ||
      countries.includes('JP')
    );
  }
  return false;
}

async function fetchPopularActors(apiKey: string, region: TvRegion): Promise<CardItem[]> {
  const url = `${TMDB_BASE}/person/popular?api_key=${encodeURIComponent(
    apiKey
  )}&language=en-US&page=1`;
  const data = await fetchJson<{ results?: TmdbPerson[] }>(url);
  const results = Array.isArray(data?.results) ? data.results : [];
  const filtered = results.filter((person) => {
    if (person.known_for_department && person.known_for_department !== 'Acting') {
      return false;
    }
    return matchRegion(person, region);
  });
  return filtered.slice(0, MAX_ACTORS).map((person) => ({
    title: person?.name || '',
    poster: person?.profile_path ? `${TMDB_PROFILE}${person.profile_path}` : '',
    type: 'person',
    query: person?.name || '',
    source_name: 'TMDB',
    id: person?.id ? `tmdb:${person.id}` : undefined,
  }));
}

function buildSourceMap(items: ActorSourceItem[]) {
  const map = new Map<string, ActorSourceItem>();
  items.forEach((item) => {
    const tmdbId = normalizeTmdbId(item.tmdb_id);
    const imdbId = normalizeImdbId(item.imdb_id);
    const doubanId =
      typeof item.douban_id === 'number' && Number.isFinite(item.douban_id)
        ? String(item.douban_id)
        : '';
    const titleKey = normalizeTitleKey(item.title);
    const yearKey = (item.year || '').toString().trim();
    const key =
      (tmdbId && `tmdb:${tmdbId}`) ||
      (imdbId && `imdb:${imdbId}`) ||
      (doubanId && `douban:${doubanId}`) ||
      (titleKey && `title:${titleKey}:${yearKey}`) ||
      '';
    if (!key) return;

    const existing = map.get(key);
    const weight = typeof item.weight === 'number' ? item.weight : 1;
    if (existing) {
      map.set(key, {
        ...existing,
        weight: (existing.weight || 0) + weight,
      });
      return;
    }
    map.set(key, {
      tmdb_id: item.tmdb_id,
      imdb_id: item.imdb_id,
      douban_id: item.douban_id,
      title: item.title,
      year: item.year,
      type: item.type,
      weight,
    });
  });
  return map;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const inputItems = Array.isArray(body?.items) ? (body.items as ActorSourceItem[]) : [];
  const region =
    body?.region === 'cn' || body?.region === 'kr' || body?.region === 'jp' || body?.region === 'en'
      ? (body.region as TvRegion)
      : 'en';

  const sourceMap = buildSourceMap(inputItems);
  const sources = Array.from(sourceMap.values())
    .filter((item) => item.weight && item.weight > 0)
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .slice(0, MAX_SOURCE_ITEMS);

  if (sources.length === 0) {
    const fallback = await fetchPopularActors(getApiKey(), region);
    return NextResponse.json({ actors: fallback, source: 'fallback' });
  }

  const apiKey = getApiKey();
  const scoreMap = new Map<string, ActorScoreEntry>();
  const resolvedCache = new Map<string, { tmdbId: string; mediaType: 'movie' | 'tv' } | null>();
  const creditsCache = new Map<string, Array<{ tmdbId: string; name: string; profile: string }>>();

  const getCredits = async (mediaType: 'movie' | 'tv', tmdbId: string) => {
    const key = `${mediaType}:${tmdbId}`;
    const cached = creditsCache.get(key);
    if (cached) return cached;
    const cast = await fetchCredits(apiKey, mediaType, tmdbId);
    creditsCache.set(key, cast);
    return cast;
  };

  for (const item of sources) {
    const tmdbIdRaw = normalizeTmdbId(item.tmdb_id);
    const imdbIdRaw = normalizeImdbId(item.imdb_id);
    const title = (item.title || '').trim();
    const year = (item.year || '').toString().trim();
    const mediaType = item.type === 'movie' || item.type === 'tv' ? item.type : undefined;

    const cacheKey =
      (tmdbIdRaw && `tmdb:${tmdbIdRaw}`) ||
      (imdbIdRaw && `imdb:${imdbIdRaw}`) ||
      (title && `title:${normalizeTitleKey(title)}:${year}:${mediaType || 'any'}`) ||
      '';
    if (!cacheKey) continue;

    let resolved = resolvedCache.get(cacheKey) || null;
    if (!resolved) {
      if (tmdbIdRaw) {
        if (mediaType) {
          resolved = { tmdbId: tmdbIdRaw, mediaType };
        } else {
          const movieCredits = await getCredits('movie', tmdbIdRaw);
          if (movieCredits.length > 0) {
            resolved = { tmdbId: tmdbIdRaw, mediaType: 'movie' };
          } else {
            const tvCredits = await getCredits('tv', tmdbIdRaw);
            resolved = tvCredits.length > 0 ? { tmdbId: tmdbIdRaw, mediaType: 'tv' } : null;
          }
        }
      } else if (imdbIdRaw) {
        resolved = await resolveByImdb(apiKey, imdbIdRaw);
        if (!resolved && title.length >= 2) {
          resolved = await resolveByTitle(apiKey, title, mediaType, year);
        }
      } else if (title.length >= 2) {
        resolved = await resolveByTitle(apiKey, title, mediaType, year);
      }
      resolvedCache.set(cacheKey, resolved);
    }

    if (!resolved) continue;
    const cast = await getCredits(resolved.mediaType, resolved.tmdbId);
    if (!cast.length) continue;

    const weight = typeof item.weight === 'number' ? item.weight : 1;
    cast.forEach((member) => {
      if (!member.tmdbId || !member.name) return;
      const entryKey = `tmdb:${member.tmdbId}`;
      const existing = scoreMap.get(entryKey);
      if (existing) {
        existing.score += weight;
        scoreMap.set(entryKey, existing);
        return;
      }
      scoreMap.set(entryKey, {
        score: weight,
        name: member.name,
        profile: member.profile,
        tmdbId: member.tmdbId,
      });
    });
  }

  const scoredActors = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ACTORS)
    .map(buildActorCard);

  if (scoredActors.length === 0) {
    const fallback = await fetchPopularActors(apiKey, region);
    return NextResponse.json({ actors: fallback, source: 'fallback' });
  }

  return NextResponse.json({ actors: scoredActors, source: 'scored' });
}
