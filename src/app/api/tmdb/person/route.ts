import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w500';
const TMDB_PROFILE = 'https://image.tmdb.org/t/p/w300';
const DEFAULT_API_KEY = '2de27bb73e68f7ebdc05dfcf29a5c2ed';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const NAME_LANGS = [
  'en',
  'zh',
  'zh-hans',
  'zh-hant',
  'ja',
  'ko',
  'fr',
  'de',
  'es',
];

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
  also_known_as?: string[] | null;
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

type NameVariants = Record<string, string[]>;

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

function normalizeList(list: Array<string | undefined | null>) {
  const seen = new Set<string>();
  const result: string[] = [];
  list.forEach((value) => {
    const trimmed = (value || '').trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    result.push(trimmed);
  });
  return result;
}

function mapLangKey(key: string) {
  if (key === 'zh-hans' || key === 'zh') return 'zh-Hans';
  if (key === 'zh-hant') return 'zh-Hant';
  return key;
}

async function fetchWikidataEntityIdByImdb(imdbId: string) {
  const query = `SELECT ?item WHERE { ?item wdt:P345 "${imdbId}" . } LIMIT 1`;
  const url = `${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(query)}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MoonTV/1.0 (actor names)' },
    });
    if (!res.ok) return '';
    const data = (await res.json()) as {
      results?: { bindings?: Array<{ item?: { value?: string } }> };
    };
    const value = data?.results?.bindings?.[0]?.item?.value || '';
    return value ? value.split('/').pop() || '' : '';
  } catch {
    return '';
  }
}

async function fetchWikidataEntityIdByName(name: string) {
  const params = new URLSearchParams();
  params.set('action', 'wbsearchentities');
  params.set('format', 'json');
  params.set('language', 'en');
  params.set('search', name);
  params.set('limit', '1');
  const url = `${WIKIDATA_API}?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MoonTV/1.0 (actor names)' },
    });
    if (!res.ok) return '';
    const data = (await res.json()) as {
      search?: Array<{ id?: string }>;
    };
    return data?.search?.[0]?.id || '';
  } catch {
    return '';
  }
}

async function fetchWikidataNames(
  name: string,
  imdbId?: string
): Promise<NameVariants> {
  if (!name && !imdbId) return {};
  const entityId =
    (imdbId ? await fetchWikidataEntityIdByImdb(imdbId) : '') ||
    (name ? await fetchWikidataEntityIdByName(name) : '');
  if (!entityId) return {};
  const params = new URLSearchParams();
  params.set('action', 'wbgetentities');
  params.set('format', 'json');
  params.set('ids', entityId);
  params.set('props', 'labels|aliases');
  params.set('languages', NAME_LANGS.join('|'));
  const url = `${WIKIDATA_API}?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MoonTV/1.0 (actor names)' },
    });
    if (!res.ok) return {};
    const data = (await res.json()) as {
      entities?: Record<
        string,
        {
          labels?: Record<string, { value?: string }>;
          aliases?: Record<string, Array<{ value?: string }>>;
        }
      >;
    };
    const entity = data?.entities?.[entityId];
    if (!entity) return {};
    const variants: NameVariants = {};
    NAME_LANGS.forEach((lang) => {
      const label = entity.labels?.[lang]?.value;
      const aliases = (entity.aliases?.[lang] || []).map((item) => item.value);
      const merged = normalizeList([label, ...aliases]);
      if (merged.length > 0) {
        variants[mapLangKey(lang)] = merged;
      }
    });
    return variants;
  } catch {
    return {};
  }
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

    const tmdbAlsoKnown = normalizeList(detail.also_known_as || []);
    const wikidataNames = await fetchWikidataNames(
      detail.name || '',
      detail.imdb_id || ''
    );

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
        alsoKnownAs: tmdbAlsoKnown,
        nameVariants: wikidataNames,
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
