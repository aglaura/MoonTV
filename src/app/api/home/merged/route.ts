import { NextResponse } from 'next/server';

import { DoubanItem } from '@/lib/types';

export const runtime = 'nodejs';
export const revalidate = 600;

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
};

type TmdbPerson = {
  tmdbId: string;
  title: string;
  poster: string;
};

type CardItem = {
  title: string;
  title_en?: string;
  poster?: string;
  posterAlt?: string[];
  posterDouban?: string;
  posterTmdb?: string;
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
  const raw = process.env.CONFIGJSON?.trim();
  if (!raw) return null;
  let base = raw;
  if (base.toLowerCase().endsWith('config.json')) {
    base = base.slice(0, -'config.json'.length);
  }
  return base.replace(/\/+$/, '');
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
    const tmdbPeople = mapTmdbPeople(tmdbHome.people || []);

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

    const mergedMovies = mergeCards(doubanMovies, tmdbMovieCards);
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
