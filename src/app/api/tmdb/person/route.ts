import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w500';
const TMDB_PROFILE = 'https://image.tmdb.org/t/p/w300';
const DEFAULT_API_KEY = '2de27bb73e68f7ebdc05dfcf29a5c2ed';

type TmdbPersonDetail = {
  id?: number;
  name?: string;
  biography?: string;
  birthday?: string | null;
  deathday?: string | null;
  place_of_birth?: string | null;
  known_for_department?: string | null;
  profile_path?: string | null;
  homepage?: string | null;
  imdb_id?: string | null;
};

type TmdbCredit = {
  id?: number;
  title?: string;
  name?: string;
  media_type?: 'movie' | 'tv';
  release_date?: string;
  first_air_date?: string;
  poster_path?: string | null;
  character?: string | null;
  job?: string | null;
  popularity?: number | null;
};

type CreditEntry = {
  tmdbId?: string;
  title: string;
  poster: string;
  year: string;
  mediaType?: 'movie' | 'tv';
  character?: string;
  job?: string;
};

function getApiKey() {
  return process.env.TMDB_API_KEY || DEFAULT_API_KEY;
}

function normalizeId(value?: string | null) {
  if (!value) return '';
  return value.trim().replace(/^tmdb:/, '');
}

function buildPoster(path?: string | null) {
  if (!path) return '';
  return `${TMDB_IMAGE}${path}`;
}

function buildProfile(path?: string | null) {
  if (!path) return '';
  return `${TMDB_PROFILE}${path}`;
}

function mapCredit(item: TmdbCredit): CreditEntry {
  const title = item.title || item.name || '';
  const date = item.release_date || item.first_air_date || '';
  return {
    tmdbId: item.id ? `tmdb:${item.id}` : undefined,
    title,
    poster: buildPoster(item.poster_path),
    year: date.slice(0, 4),
    mediaType: item.media_type,
    character: item.character || undefined,
    job: item.job || undefined,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawId = searchParams.get('id');
  const id = normalizeId(rawId);
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'TMDB_API_KEY not configured' },
      { status: 500 }
    );
  }

  const detailUrl = `${TMDB_BASE}/person/${encodeURIComponent(
    id
  )}?api_key=${encodeURIComponent(apiKey)}&language=en-US`;
  const creditsUrl = `${TMDB_BASE}/person/${encodeURIComponent(
    id
  )}/combined_credits?api_key=${encodeURIComponent(apiKey)}&language=en-US`;

  try {
    const [detailRes, creditsRes] = await Promise.all([
      fetch(detailUrl, { cache: 'no-store' }),
      fetch(creditsUrl, { cache: 'no-store' }),
    ]);

    if (!detailRes.ok) {
      return NextResponse.json(
        { error: `TMDB person ${detailRes.status}` },
        { status: detailRes.status }
      );
    }

    if (!creditsRes.ok) {
      return NextResponse.json(
        { error: `TMDB credits ${creditsRes.status}` },
        { status: creditsRes.status }
      );
    }

    const detail = (await detailRes.json()) as TmdbPersonDetail;
    const credits = (await creditsRes.json()) as {
      cast?: TmdbCredit[];
      crew?: TmdbCredit[];
    };

    const castRaw = Array.isArray(credits.cast) ? credits.cast : [];
    const crewRaw = Array.isArray(credits.crew) ? credits.crew : [];
    const cast = [...castRaw]
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .map(mapCredit);
    const crew = [...crewRaw]
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
      .map(mapCredit);

    return NextResponse.json({
      person: {
        id: detail.id || Number(id),
        name: detail.name || '',
        biography: detail.biography || '',
        birthday: detail.birthday || '',
        deathday: detail.deathday || '',
        placeOfBirth: detail.place_of_birth || '',
        knownFor: detail.known_for_department || '',
        profile: buildProfile(detail.profile_path),
        homepage: detail.homepage || '',
        imdbId: detail.imdb_id || '',
      },
      credits: { cast, crew },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Unexpected error fetching person details' },
      { status: 500 }
    );
  }
}
