import { NextResponse } from 'next/server';

import { normalizeConfigJsonBase } from '@/lib/configjson';
import { DoubanItem } from '@/lib/types';

export const runtime = 'nodejs';
export const revalidate = 600;

const MAX_PEOPLE = 60;
const OMDB_CACHE_TTL_MS = 1000 * 60 * 60 * 24 * 14;
const OMDB_HERO_LIMIT = 10;

type TmdbItem = {
  tmdbId: string;
  title: string;
  originalTitle?: string;
  year: string;
  poster: string;
  mediaType?: 'movie' | 'tv';
  originalLanguage?: string;
  originCountry?: string[];
  imdbId?: string;
  doubanId?: string;
  castMembers?: TmdbCastMember[];
};

type TmdbCastMember = {
  tmdbId?: string;
  name?: string;
  profile?: string;
};

type TmdbPerson = {
  tmdbId: string;
  title: string;
  poster: string;
};

type OmdbContribution = {
  imdbRating?: string;
  ratings?: Array<{
    source: 'Internet Movie Database' | 'Rotten Tomatoes' | 'Metacritic';
    value: string;
  }>;
  runtime?: string;
  awards?: string;
  plot?: string;
};

type CardItem = {
  title: string;
  title_en?: string;
  poster?: string;
  posterAlt?: string[];
  posterDouban?: string;
  posterTmdb?: string;
  sources?: {
    omdb?: OmdbContribution;
  };
  doubanUrl?: string;
  tmdbUrl?: string;
  originalLanguage?: string;
  originCountry?: string[];
  rate?: string;
  year?: string;
  douban_id?: number;
  imdb_id?: string;
  type?: string;
  query?: string;
  source_name?: string;
  id?: string | number;
};

function buildCacheBase(): string | null {
  return normalizeConfigJsonBase(process.env.CONFIGJSON);
}

const omdbMemoryCache = new Map<string, { cachedAt: number; data: OmdbContribution | null }>();

function normalizeOmdbValue(value?: string): string | undefined {
  if (!value || value === 'N/A') return undefined;
  return value;
}

function buildOmdbCacheUrl(cacheBase: string | null, imdbId: string): string | null {
  if (!cacheBase) return null;
  return `${cacheBase}/posters/video_info/omdb/${encodeURIComponent(imdbId)}.json`;
}

async function readOmdbCache(
  cacheBase: string | null,
  imdbId: string
): Promise<{ entry: { cachedAt: number; data: OmdbContribution | null } | null; stale: boolean }> {
  const now = Date.now();
  const mem = omdbMemoryCache.get(imdbId);
  if (mem) {
    const stale = now - mem.cachedAt > OMDB_CACHE_TTL_MS;
    if (!stale) return { entry: mem, stale: false };
  }

  const cacheUrl = buildOmdbCacheUrl(cacheBase, imdbId);
  if (!cacheUrl) return { entry: mem ?? null, stale: true };
  const cached = (await tryFetchCache(cacheUrl)) as
    | { cachedAt?: number; data?: OmdbContribution | null }
    | null;
  if (cached && typeof cached.cachedAt === 'number') {
    const entry = { cachedAt: cached.cachedAt, data: cached.data ?? null };
    omdbMemoryCache.set(imdbId, entry);
    return { entry, stale: now - cached.cachedAt > OMDB_CACHE_TTL_MS };
  }

  return { entry: mem ?? null, stale: true };
}

async function fetchOmdbContribution(
  cacheBase: string | null,
  imdbId: string
): Promise<OmdbContribution | null> {
  if (!imdbId || !/^(tt\d{5,}|imdbt\d+)$/i.test(imdbId)) return null;

  const { entry, stale } = await readOmdbCache(cacheBase, imdbId);
  if (entry && !stale) return entry.data;

  const apiKey =
    process.env.OMDB_API_KEY || process.env.NEXT_PUBLIC_OMDB_API_KEY || '';
  if (!apiKey) {
    return entry?.data ?? null;
  }

  let fresh: OmdbContribution | null = null;
  try {
    const url = new URL('https://www.omdbapi.com/');
    url.searchParams.set('i', imdbId);
    url.searchParams.set('apikey', apiKey);
    const response = await fetch(url.toString(), { cache: 'no-store' });
    if (response.ok) {
      const data = (await response.json()) as {
        Response?: string;
        Error?: string;
        Ratings?: Array<{ Source?: string; Value?: string }>;
        imdbRating?: string;
        Runtime?: string;
        Awards?: string;
        Plot?: string;
      };
      if (data.Response !== 'False') {
        const ratings = (data.Ratings || [])
          .map((rating) => {
            const source = rating.Source || '';
            const value = rating.Value || '';
            if (
              source !== 'Internet Movie Database' &&
              source !== 'Rotten Tomatoes' &&
              source !== 'Metacritic'
            ) {
              return null;
            }
            return {
              source,
              value,
            } as OmdbContribution['ratings'][number];
          })
          .filter((rating): rating is OmdbContribution['ratings'][number] => !!rating);

        fresh = {
          imdbRating: normalizeOmdbValue(data.imdbRating),
          ratings: ratings.length ? ratings : undefined,
          runtime: normalizeOmdbValue(data.Runtime),
          awards: normalizeOmdbValue(data.Awards),
          plot: normalizeOmdbValue(data.Plot),
        };
      }
    }
  } catch {
    fresh = null;
  }

  const entryToStore = {
    cachedAt: Date.now(),
    data: fresh,
  };
  omdbMemoryCache.set(imdbId, entryToStore);
  const cacheUrl = buildOmdbCacheUrl(cacheBase, imdbId);
  if (cacheUrl) {
    await tryUploadCache(cacheUrl, entryToStore);
  }

  return fresh ?? entry?.data ?? null;
}

async function enrichOmdbForItems(
  items: CardItem[],
  cacheBase: string | null,
  limit: number
): Promise<CardItem[]> {
  if (!items.length || limit <= 0) return items;
  const ids: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    const imdbId = item.imdb_id?.trim();
    if (!imdbId) continue;
    const normalized = imdbId.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    ids.push(imdbId);
    if (ids.length >= limit) break;
  }

  if (ids.length === 0) return items;

  const results = await Promise.all(
    ids.map((id) => fetchOmdbContribution(cacheBase, id))
  );
  const omdbById = new Map<string, OmdbContribution | null>();
  ids.forEach((id, index) => {
    omdbById.set(id.toLowerCase(), results[index] ?? null);
  });

  return items.map((item) => {
    const imdbId = item.imdb_id?.trim();
    if (!imdbId) return item;
    const omdb = omdbById.get(imdbId.toLowerCase());
    if (!omdb) return item;
    return {
      ...item,
      sources: {
        ...(item.sources ?? {}),
        omdb,
      },
    };
  });
}

async function tryFetchCache(url: string) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function tryUploadCache(url: string, data: unknown) {
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
      url.split('/').pop() || 'home-merged.json'
    );
    await fetch(`${base}/posters/poster.php`, { method: 'POST', body: fd });
  } catch {
    // swallow errors; cache is best-effort
  }
}

function getCardKey(item: CardItem) {
  if (item.douban_id && item.douban_id > 0) return `douban:${item.douban_id}`;
  if (item.imdb_id) return `imdb:${item.imdb_id.toLowerCase()}`;
  const normTitle = (item.title || '').trim().toLowerCase().replace(/\s+/g, '');
  return `${normTitle}__${item.year || ''}`;
}

function mergeCards(base: CardItem[], extras: CardItem[]) {
  const map = new Map<string, CardItem>();

  const mergeInto = (item: CardItem) => {
    const key = getCardKey(item);
    if (!key) return;
    const existing = map.get(key);
    if (!existing) {
      const alt = new Set(
        [
          ...(item.posterAlt || []),
          item.poster,
          item.posterDouban,
          item.posterTmdb,
        ].filter(Boolean)
      );
      map.set(key, { ...item, posterAlt: Array.from(alt) as string[] });
      return;
    }
    const mergedDouban = existing.posterDouban || item.posterDouban;
    const mergedTmdb = existing.posterTmdb || item.posterTmdb;
    const mergedPoster =
      existing.poster ||
      item.poster ||
      mergedDouban ||
      mergedTmdb ||
      existing.posterAlt?.[0] ||
      item.posterAlt?.[0];
    const mergedAlt = new Set(
      [
        ...(existing.posterAlt || []),
        ...(item.posterAlt || []),
        existing.poster,
        item.poster,
        mergedDouban,
        mergedTmdb,
      ].filter(Boolean)
    );
    map.set(key, {
      ...existing,
      ...item,
      poster: mergedPoster,
      posterDouban: mergedDouban,
      posterTmdb: mergedTmdb,
      posterAlt: Array.from(mergedAlt) as string[],
      rate: existing.rate || item.rate,
      year: existing.year || item.year,
      query: existing.query || item.query,
      source_name: existing.source_name || item.source_name,
      type: existing.type || item.type,
      doubanUrl: existing.doubanUrl || item.doubanUrl,
      tmdbUrl: existing.tmdbUrl || item.tmdbUrl,
      title_en: existing.title_en || item.title_en,
    });
  };

  base.forEach(mergeInto);
  extras.forEach(mergeInto);
  return Array.from(map.values());
}

function mapDoubanCards(items: DoubanItem[], type?: string): CardItem[] {
  return (items || []).map((item) => ({
    title: item.title,
    poster: item.poster,
    posterAlt: [item.poster].filter(Boolean),
    posterDouban: item.poster,
    doubanUrl: `https://movie.douban.com/subject/${item.id}`,
    rate: item.rate,
    year: item.year,
    douban_id: Number(item.id),
    type,
    query: item.title,
    source_name: 'Douban',
  }));
}

function dedupDouban(items: DoubanItem[]) {
  const seen = new Set<string>();
  const result: DoubanItem[] = [];
  (items || []).forEach((item) => {
    if (!item?.id) return;
    if (seen.has(item.id)) return;
    seen.add(item.id);
    result.push(item);
  });
  return result;
}

async function fetchDoubanTagList(origin: string, tag: string) {
  try {
    const url = `${origin}/api/douban?type=tv&tag=${encodeURIComponent(
      tag
    )}&pageSize=24&pageStart=0`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = (await res.json()) as { list?: DoubanItem[] };
    return Array.isArray(data?.list) ? data.list : [];
  } catch {
    return [];
  }
}

function mapTmdbCards(items: TmdbItem[]): CardItem[] {
  return (items || []).map((item) => {
    const tmdbId = item.tmdbId?.replace('tmdb:', '') ?? '';
    const mediaType = item.mediaType === 'tv' ? 'tv' : 'movie';
    return {
      title: item.title,
      title_en: item.originalTitle,
      poster: item.poster,
      posterAlt: [item.poster].filter(Boolean),
      posterTmdb: item.poster,
      tmdbUrl: tmdbId
        ? `https://www.themoviedb.org/${mediaType}/${tmdbId}`
        : undefined,
      originalLanguage: item.originalLanguage,
      originCountry: item.originCountry,
      rate: '',
      year: item.year,
      type: mediaType,
      query: item.title,
      imdb_id: item.imdbId,
      douban_id: item.doubanId ? Number(item.doubanId) : undefined,
      source_name: 'TMDB',
      id: item.tmdbId,
    };
  });
}

function mapTmdbPeople(items: TmdbPerson[]): CardItem[] {
  return (items || []).map((item) => ({
    title: item.title,
    poster: item.poster,
    rate: '',
    year: '',
    type: 'person',
    query: item.title,
    source_name: 'TMDB',
    id: item.tmdbId,
  }));
}

function mapCastPeople(items: TmdbItem[]): CardItem[] {
  const people: CardItem[] = [];
  items.forEach((item) => {
    (item.castMembers || []).forEach((member) => {
      const name = (member.name || '').trim();
      if (!name) return;
      people.push({
        title: name,
        poster: member.profile || '',
        rate: '',
        year: '',
        type: 'person',
        query: name,
        source_name: 'TMDB',
        id: member.tmdbId,
      });
    });
  });
  return people;
}

function mergePeopleCards(...lists: CardItem[][]): CardItem[] {
  const seen = new Set<string>();
  const merged: CardItem[] = [];
  lists.flat().forEach((person) => {
    const key = String(person.id || person.title || '').trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(person);
  });
  return merged;
}

function splitTvByRegion(items: DoubanItem[]) {
  const kr: DoubanItem[] = [];
  const jp: DoubanItem[] = [];
  const cn: DoubanItem[] = [];
  const us: DoubanItem[] = [];
  const regionFromItem = (item: DoubanItem) => {
    if (item.region === 'kr' || item.region === 'jp') return item.region;
    if (item.region === 'cn' || item.region === 'hk' || item.region === 'tw')
      return 'cn';
    const subtitle = (item.subtitle || '').toLowerCase();
    if (/韩|韓|korean|kr/.test(subtitle)) return 'kr';
    if (/日|japan|jp/.test(subtitle)) return 'jp';
    if (/日本动漫|日本動漫|日漫|動畫|动漫/.test(subtitle)) return 'jp';
    if (/中国|國|大陆|大陸|港|台|普通话|國語|華語|mandarin|zh/.test(subtitle))
      return 'cn';
    if (
      /(us|usa|uk|gb|british|england|europe|france|germany|german|spain|spanish|italy|italian|canada|australia)/.test(
        subtitle
      )
    )
      return 'us';
    if (/美剧|美劇|英剧|英劇|欧美|歐美/.test(subtitle)) return 'us';
    return undefined;
  };
  const isKrJpTitle = (title?: string) => {
    if (!title) return false;
    if (/[가-힣]/.test(title)) return true;
    if (/[ぁ-ゔァ-ヴ]/.test(title)) return true;
    if (/韩|韓/.test(title)) return true;
    if (/日剧|日劇|日版|日本/.test(title)) return true;
    return false;
  };
  const isCnTitle = (title?: string) => {
    if (!title) return false;
    if (/中国|國|大陆|大陸|港|台|華語|华语/.test(title)) return true;
    return /[\u4e00-\u9fff]/.test(title);
  };
  items.forEach((item) => {
    const region = regionFromItem(item);
    if (region === 'kr' || /韩|韓/.test(item.title)) {
      kr.push(item);
    } else if (region === 'jp' || /日剧|日劇|日版|日本/.test(item.title)) {
      jp.push(item);
    } else if (isKrJpTitle(item.title)) {
      jp.push(item);
    } else if (region === 'cn' || isCnTitle(item.title)) {
      cn.push(item);
    } else {
      us.push(item);
    }
  });
  return { cn, kr, jp, us };
}

export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  const cacheBase = buildCacheBase();
  const cacheUrl = cacheBase
    ? `${cacheBase}/posters/video_info/home-merged.json`
    : null;

  if (cacheUrl) {
    const cached = await tryFetchCache(cacheUrl);
    if (
      cached &&
      Array.isArray((cached as any).tvKr) &&
      Array.isArray((cached as any).tvJp)
    ) {
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=120',
          'x-cache': 'remote-hit',
        },
      });
    }
  }

  try {
    const [doubanRes, tmdbRes] = await Promise.all([
      fetch(`${origin}/api/douban/home`, { cache: 'no-store' }),
      fetch(`${origin}/api/imdb/list`, { cache: 'no-store' }),
    ]);

    if (!doubanRes.ok || !tmdbRes.ok) {
      return NextResponse.json(
        {
          error: 'Failed to fetch upstream lists',
          doubanStatus: doubanRes.status,
          tmdbStatus: tmdbRes.status,
        },
        { status: 502 }
      );
    }

    const doubanHome = (await doubanRes.json()) as {
      movies?: DoubanItem[];
      tv?: DoubanItem[];
      variety?: DoubanItem[];
      latestMovies?: DoubanItem[];
      latestTv?: DoubanItem[];
    };
    const tmdbHome = (await tmdbRes.json()) as {
      movies?: TmdbItem[];
      tv?: TmdbItem[];
      krTv?: TmdbItem[];
      jpTv?: TmdbItem[];
      people?: TmdbPerson[];
      nowPlaying?: TmdbItem[];
      onAir?: TmdbItem[];
    };

    const doubanMovies = mapDoubanCards(doubanHome.movies || [], 'movie');
    let tvCnRaw: DoubanItem[] = [];
    let tvKrRaw: DoubanItem[] = [];
    let tvJpRaw: DoubanItem[] = [];
    let tvUsRaw: DoubanItem[] = [];

    const [tagCn, tagKr, tagJp, tagUs, tagUk] = await Promise.all([
      fetchDoubanTagList(origin, '国产剧'),
      fetchDoubanTagList(origin, '韩剧'),
      fetchDoubanTagList(origin, '日剧'),
      fetchDoubanTagList(origin, '美剧'),
      fetchDoubanTagList(origin, '英剧'),
    ]);

    const tagCount =
      tagCn.length + tagKr.length + tagJp.length + tagUs.length + tagUk.length;

    if (tagCount > 0) {
      tvCnRaw = dedupDouban(tagCn);
      tvKrRaw = dedupDouban(tagKr);
      tvJpRaw = dedupDouban(tagJp);
      tvUsRaw = dedupDouban([...tagUs, ...tagUk]);
    } else {
      const split = splitTvByRegion(doubanHome.tv || []);
      tvCnRaw = split.cn;
      tvKrRaw = split.kr;
      tvJpRaw = split.jp;
      tvUsRaw = split.us;
    }
    const doubanTvCn = mapDoubanCards(tvCnRaw, 'tv');
    const doubanTvKr = mapDoubanCards(tvKrRaw, 'tv');
    const doubanTvJp = mapDoubanCards(tvJpRaw, 'tv');
    const doubanTvUs = mapDoubanCards(tvUsRaw, 'tv');
    const doubanVariety = mapDoubanCards(doubanHome.variety || [], 'show');

    const tmdbMovieCards = mapTmdbCards(tmdbHome.movies || []);
    const tmdbTvCards = mapTmdbCards(tmdbHome.tv || []);
    const tmdbKrCards = mapTmdbCards(tmdbHome.krTv || []);
    const tmdbJpCards = mapTmdbCards(tmdbHome.jpTv || []);
    const tmdbNowPlaying = mapTmdbCards(tmdbHome.nowPlaying || []);
    const tmdbOnAir = mapTmdbCards(tmdbHome.onAir || []);
    const castPeople = mapCastPeople([
      ...(tmdbHome.movies || []),
      ...(tmdbHome.tv || []),
      ...(tmdbHome.krTv || []),
      ...(tmdbHome.jpTv || []),
      ...(tmdbHome.nowPlaying || []),
      ...(tmdbHome.onAir || []),
    ]);
    const tmdbPeople = mergePeopleCards(
      mapTmdbPeople(tmdbHome.people || []),
      castPeople
    ).slice(0, MAX_PEOPLE);

    const tmdbTvKr = mergeCards(
      tmdbTvCards.filter((item) => {
        const lang = (item.originalLanguage || '').toLowerCase();
        return lang === 'ko' || item.originCountry?.includes('KR');
      }),
      tmdbKrCards
    );
    const tmdbTvJp = mergeCards(
      tmdbTvCards.filter((item) => {
        const lang = (item.originalLanguage || '').toLowerCase();
        return lang === 'ja' || item.originCountry?.includes('JP');
      }),
      tmdbJpCards
    );

    let mergedMovies = mergeCards(doubanMovies, tmdbMovieCards);
    const mergedTvCn = mergeCards(doubanTvCn, tmdbTvCards);
    const mergedTvKr = mergeCards(doubanTvKr, tmdbTvKr);
    const mergedTvJp = mergeCards(doubanTvJp, tmdbTvJp);
    const mergedTvUs = mergeCards(doubanTvUs, tmdbTvCards);
    const latestMovies = mergeCards(
      mapDoubanCards(doubanHome.latestMovies || [], 'movie'),
      tmdbNowPlaying
    );
    const latestTv = mergeCards(
      mapDoubanCards(doubanHome.latestTv || [], 'tv'),
      tmdbOnAir
    );

    mergedMovies = await enrichOmdbForItems(
      mergedMovies,
      cacheBase,
      OMDB_HERO_LIMIT
    );

    const payload = {
      movies: mergedMovies,
      tvCn: mergedTvCn,
      tvKr: mergedTvKr,
      tvJp: mergedTvJp,
      tvUs: mergedTvUs,
      variety: doubanVariety,
      latestMovies,
      latestTv,
      tmdbMovies: tmdbMovieCards,
      tmdbTv: tmdbTvCards,
      tmdbKr: tmdbKrCards,
      tmdbJp: tmdbJpCards,
      tmdbPeople,
      tmdbNowPlaying,
      tmdbOnAir,
      updatedAt: Date.now(),
    };

    if (cacheUrl) {
      void tryUploadCache(cacheUrl, payload);
    }

    return NextResponse.json(payload, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to build merged home feed', details: String(error) },
      { status: 500 }
    );
  }
}
