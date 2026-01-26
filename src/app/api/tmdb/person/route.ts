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

type WikipediaSummary = {
  title: string;
  summary: string;
  url: string;
  thumbnail?: string;
  lang: string;
};

type WikidataDetails = {
  id: string;
  nameVariants: NameVariants;
  descriptions: Record<string, string>;
  sitelinks: Record<string, { title: string; lang: string; url: string }>;
};

type DoubanCeleb = {
  id: string;
  name: string;
  name_en?: string;
  url: string;
  image?: string;
  bio?: string;
  info?: Record<string, string>;
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

function hasCjk(value: string) {
  return /[\u4e00-\u9fff]/.test(value);
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripHtml(value: string) {
  if (!value) return '';
  return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function extractMetaContent(html: string, name: string) {
  const re = new RegExp(
    `<meta[^>]+${name.includes(':') ? 'property' : 'name'}=[\"']${name}[\"'][^>]*content=[\"']([^\"']+)[\"']`,
    'i'
  );
  const match = html.match(re);
  return match ? decodeHtml(match[1]).trim() : '';
}

function extractDoubanBio(html: string) {
  const ogDesc = extractMetaContent(html, 'og:description');
  if (ogDesc) return ogDesc;
  const metaDesc = extractMetaContent(html, 'description');
  if (metaDesc) return metaDesc;
  const longMatch =
    html.match(/<span[^>]*class=["']all hidden["'][^>]*>([\s\S]*?)<\/span>/i) ||
    html.match(/<span[^>]*class=["']short["'][^>]*>([\s\S]*?)<\/span>/i);
  if (longMatch) {
    const text = stripHtml(longMatch[1]);
    if (text) return text;
  }
  return '';
}

function extractDoubanInfo(html: string) {
  const infoMatch =
    html.match(/<div[^>]*class=["']info["'][^>]*>([\s\S]*?)<\/div>/i) ||
    html.match(/<ul[^>]*class=["']celebrity-info["'][^>]*>([\s\S]*?)<\/ul>/i);
  const infoHtml = infoMatch ? infoMatch[1] : '';
  if (!infoHtml) return {};
  const info: Record<string, string> = {};
  const regex =
    /<span[^>]*class=["']pl["'][^>]*>([^<]+)<\/span>\s*([\s\S]*?)(?:<br\s*\/?>|<\/li>|<\/p>|<\/div>)/gi;
  let match: RegExpExecArray | null = null;
  while ((match = regex.exec(infoHtml))) {
    const key = stripHtml(match[1]).replace(/[:：]\s*$/, '');
    const value = stripHtml(match[2]);
    if (key && value && !info[key]) {
      info[key] = value;
    }
  }
  return info;
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

async function fetchWikidataDetails(
  name: string,
  imdbId?: string
): Promise<WikidataDetails> {
  if (!name && !imdbId) {
    return { id: '', nameVariants: {}, descriptions: {}, sitelinks: {} };
  }
  const entityId =
    (imdbId ? await fetchWikidataEntityIdByImdb(imdbId) : '') ||
    (name ? await fetchWikidataEntityIdByName(name) : '');
  if (!entityId) {
    return { id: '', nameVariants: {}, descriptions: {}, sitelinks: {} };
  }
  const params = new URLSearchParams();
  params.set('action', 'wbgetentities');
  params.set('format', 'json');
  params.set('ids', entityId);
  params.set('props', 'labels|aliases|descriptions|sitelinks');
  params.set('languages', NAME_LANGS.join('|'));
  const url = `${WIKIDATA_API}?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MoonTV/1.0 (actor names)' },
    });
    if (!res.ok) {
      return { id: entityId, nameVariants: {}, descriptions: {}, sitelinks: {} };
    }
    const data = (await res.json()) as {
      entities?: Record<
        string,
        {
          labels?: Record<string, { value?: string }>;
          aliases?: Record<string, Array<{ value?: string }>>;
          descriptions?: Record<string, { value?: string }>;
          sitelinks?: Record<string, { title?: string }>;
        }
      >;
    };
    const entity = data?.entities?.[entityId];
    if (!entity) {
      return { id: entityId, nameVariants: {}, descriptions: {}, sitelinks: {} };
    }
    const variants: NameVariants = {};
    const descriptions: Record<string, string> = {};
    NAME_LANGS.forEach((lang) => {
      const label = entity.labels?.[lang]?.value;
      const aliases = (entity.aliases?.[lang] || []).map((item) => item.value);
      const merged = normalizeList([label, ...aliases]);
      if (merged.length > 0) {
        variants[mapLangKey(lang)] = merged;
      }
      const description = (entity.descriptions?.[lang]?.value || '').trim();
      if (description) {
        descriptions[mapLangKey(lang)] = description;
      }
    });
    const sitelinks: Record<string, { title: string; lang: string; url: string }> = {};
    const allowedLangs = new Set(NAME_LANGS.map((lang) => mapLangKey(lang)));
    Object.entries(entity.sitelinks || {}).forEach(([site, value]) => {
      if (!site.endsWith('wiki')) return;
      const rawLang = site.replace(/wiki$/, '').replace(/_/g, '-');
      const mappedLang = mapLangKey(rawLang);
      if (!allowedLangs.has(mappedLang)) return;
      const title = (value?.title || '').trim();
      if (!title) return;
      const url = `https://${rawLang || 'en'}.wikipedia.org/wiki/${encodeURIComponent(
        title.replace(/ /g, '_')
      )}`;
      sitelinks[mappedLang] = { title, lang: rawLang || mappedLang, url };
    });
    return { id: entityId, nameVariants: variants, descriptions, sitelinks };
  } catch {
    return { id: entityId, nameVariants: {}, descriptions: {}, sitelinks: {} };
  }
}

async function fetchWikipediaSummary(
  lang: string,
  title: string
): Promise<WikipediaSummary | null> {
  if (!lang || !title) return null;
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title
  )}`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MoonTV/1.0 (actor wiki)' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      extract?: string;
      thumbnail?: { source?: string };
      content_urls?: { desktop?: { page?: string } };
    };
    if (!data?.title) return null;
    return {
      title: data.title,
      summary: data.extract || '',
      url: data.content_urls?.desktop?.page || url,
      thumbnail: data.thumbnail?.source,
      lang,
    };
  } catch {
    return null;
  }
}

async function fetchDoubanCelebrity(names: string[]): Promise<DoubanCeleb | null> {
  const candidates = normalizeList(names);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => Number(hasCjk(b)) - Number(hasCjk(a)));

  for (const name of candidates) {
    if (!name) continue;
    const target = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(
      name
    )}`;
    try {
      const res = await fetch(target, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          Accept: 'application/json,text/plain,*/*',
          Referer: 'https://movie.douban.com/',
        },
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const data = await res.json();
      const items = Array.isArray(data)
        ? data
        : Array.isArray((data as any)?.items)
        ? (data as any).items
        : [];
      const celeb = items.find((item: any) => {
        const type = String(item?.type || '').toLowerCase();
        const url = String(item?.url || '');
        return type.includes('celebrity') || url.includes('/celebrity/');
      });
      if (!celeb) continue;
      const id = String(celeb?.id || '').trim();
      const url =
        String(celeb?.url || '').trim() ||
        (id ? `https://movie.douban.com/celebrity/${id}/` : '');
      if (!url) continue;
      return {
        id,
        name: String(celeb?.title || '').trim(),
        name_en: String(celeb?.sub_title || '').trim(),
        url,
        image: String(celeb?.img || '').trim(),
      };
    } catch {
      // ignore
    }
  }
  return null;
}

async function fetchDoubanCelebrityDetails(celeb: DoubanCeleb) {
  if (!celeb?.url) return celeb;
  try {
    const res = await fetch(celeb.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Referer: 'https://movie.douban.com/',
      },
      cache: 'no-store',
    });
    if (!res.ok) return celeb;
    const html = await res.text();
    const bio = extractDoubanBio(html);
    const info = extractDoubanInfo(html);
    return {
      ...celeb,
      bio: bio || celeb.bio,
      info: Object.keys(info).length ? info : celeb.info,
    };
  } catch {
    return celeb;
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
    const wikidataDetails = await fetchWikidataDetails(
      detail.name || '',
      detail.imdb_id || ''
    );
    const doubanCandidate = await fetchDoubanCelebrity([
      detail.name || '',
      ...tmdbAlsoKnown,
    ]);
    const doubanCeleb = doubanCandidate
      ? await fetchDoubanCelebrityDetails(doubanCandidate)
      : null;
    const wikipediaSummaries: Record<string, WikipediaSummary> = {};
    const summaryTargets = ['en', 'zh-Hans', 'zh-Hant', 'ja', 'ko'];
    await Promise.all(
      summaryTargets.map(async (langKey) => {
        const link = wikidataDetails.sitelinks[langKey];
        if (!link?.title) return;
        const wikipediaLang = langKey === 'zh-Hant' ? 'zh' : langKey === 'zh-Hans' ? 'zh' : link.lang;
        const summary = await fetchWikipediaSummary(wikipediaLang, link.title);
        if (summary) {
          wikipediaSummaries[langKey] = summary;
        }
      })
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
        nameVariants: wikidataDetails.nameVariants,
        wikidataId: wikidataDetails.id,
        wikidataDescriptions: wikidataDetails.descriptions,
        wikipedia: wikipediaSummaries,
        douban: doubanCeleb,
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
