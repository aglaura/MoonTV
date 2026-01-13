import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 1800; // cache for 30 minutes (best-effort; dynamic fetch)

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w500';
const TMDB_PROFILE = 'https://image.tmdb.org/t/p/w300';

type TmdbItem = {
  tmdbId: string;
  title: string;
  originalTitle: string;
  year: string;
  poster: string;
  mediaType: 'movie' | 'tv';
  voteAverage?: number;
  certification?: string;
  genres?: string[];
  providers?: string[];
  cast?: string[];
  directors?: string[];
};

async function fetchDoubanChineseTitle(title: string): Promise<string | undefined> {
  if (!title) return undefined;
  try {
    const res = await fetch(
      `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(title)}`,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          Accept: 'application/json,text/plain,*/*',
          Referer: 'https://movie.douban.com/',
        },
        cache: 'no-store',
      }
    );
    if (!res.ok) return undefined;
    const data = await res.json();
    if (Array.isArray(data) && data[0]?.title) {
      return data[0].title as string;
    }
    if (Array.isArray((data as any)?.items) && (data as any).items[0]?.title) {
      return (data as any).items[0].title as string;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function fetchTmdbList(
  apiKey: string,
  path: string,
  mediaType: 'movie' | 'tv'
): Promise<TmdbItem[]> {
  const url = `${TMDB_BASE}${path}${
    path.includes('?') ? '&' : '?'
  }api_key=${encodeURIComponent(apiKey)}&language=en-US&page=1`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`TMDB ${path} ${response.status}`);
  }
  const json = await response.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  return results
    .map((item: any) => {
      const title =
        mediaType === 'movie'
          ? item?.title || item?.original_title || ''
          : item?.name || item?.original_name || '';
      const date =
        mediaType === 'movie' ? item?.release_date : item?.first_air_date;
      return {
        tmdbId: `tmdb:${item?.id ?? ''}`,
        title: title.trim(),
        originalTitle: title.trim(),
        year: (date || '').toString().slice(0, 4),
        poster: item?.poster_path ? `${TMDB_IMAGE}${item.poster_path}` : '',
        mediaType,
        voteAverage: item?.vote_average,
      } as TmdbItem;
    })
    .filter((item: TmdbItem) => item.tmdbId && item.title)
    .slice(0, 40);
}

async function fetchTmdbPeople(apiKey: string) {
  const url = `${TMDB_BASE}/trending/person/day?api_key=${encodeURIComponent(
    apiKey
  )}&language=en-US&page=1`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`TMDB people ${response.status}`);
  const json = await response.json();
  const results = Array.isArray(json?.results) ? json.results : [];
  return results
    .map((p: any) => ({
      tmdbId: `tmdb:${p?.id ?? ''}`,
      title: p?.name || '',
      originalTitle: p?.name || '',
      poster: p?.profile_path ? `${TMDB_PROFILE}${p.profile_path}` : '',
      year: '',
    }))
    .filter((p) => p.tmdbId && p.title)
    .slice(0, 30);
}

function dedup(items: TmdbItem[]) {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (seen.has(i.tmdbId)) return false;
    seen.add(i.tmdbId);
    return true;
  });
}

async function enrichTmdbItem(
  apiKey: string,
  item: TmdbItem
): Promise<TmdbItem> {
  try {
    const id = item.tmdbId.replace('tmdb:', '');
    const detailUrl = `${TMDB_BASE}/${item.mediaType}/${id}?api_key=${encodeURIComponent(
      apiKey
    )}&language=zh-CN&append_to_response=release_dates,content_ratings,watch/providers,credits,translations`;
    const resp = await fetch(detailUrl, { cache: 'no-store' });
    if (!resp.ok) return item;
    const data = await resp.json();

    // Localized title
    const translations = (data?.translations?.translations || []) as any[];
    const zhTrans = translations.find(
      (t) => t?.iso_639_1 === 'zh' && t?.iso_3166_1 === 'CN'
    );
    const localizedTitle =
      zhTrans?.data?.title ||
      zhTrans?.data?.name ||
      data?.title ||
      data?.name ||
      item.title;

    // Certification
    let certification: string | undefined;
    if (item.mediaType === 'movie') {
      const releases = (data?.release_dates?.results || []) as any[];
      const preferredRegion = releases.find((r) => r?.iso_3166_1 === 'US') ||
        releases.find((r) => r?.iso_3166_1 === 'CN') ||
        releases[0];
      const certEntry = preferredRegion?.release_dates?.find(
        (r: any) => r?.certification
      );
      certification = certEntry?.certification || undefined;
    } else {
      const ratings = (data?.content_ratings?.results || []) as any[];
      const preferred = ratings.find((r) => r?.iso_3166_1 === 'US') ||
        ratings.find((r) => r?.iso_3166_1 === 'CN') ||
        ratings[0];
      certification = preferred?.rating || undefined;
    }

    // Watch providers
    const providersData = data?.['watch/providers']?.results || {};
    const providerRegion =
      providersData?.US || providersData?.CN || providersData?.HK || providersData?.TW;
    const providers =
      providerRegion?.flatrate?.map((p: any) => p?.provider_name)?.filter(Boolean) ||
      providerRegion?.rent?.map((p: any) => p?.provider_name)?.filter(Boolean) ||
      providerRegion?.buy?.map((p: any) => p?.provider_name)?.filter(Boolean) ||
      [];

    // Genres
    const genres =
      (data?.genres as any[])
        ?.map((g) => g?.name)
        ?.filter(Boolean) ?? [];

    // Cast & crew
    const cast =
      (data?.credits?.cast as any[])
        ?.slice(0, 3)
        ?.map((c) => c?.name)
        ?.filter(Boolean) ?? [];
    const directors =
      (data?.credits?.crew as any[])
        ?.filter((c) => c?.job === 'Director')
        ?.slice(0, 2)
        ?.map((c) => c?.name)
        ?.filter(Boolean) ?? [];

    return {
      ...item,
      title: localizedTitle || item.title,
      originalTitle: data?.title || data?.name || item.originalTitle,
      year:
        (data?.release_date || data?.first_air_date || item.year || '').slice(0, 4),
      poster: data?.poster_path ? `${TMDB_IMAGE}${data.poster_path}` : item.poster,
      certification,
      genres,
      providers,
      cast,
      directors,
      voteAverage: data?.vote_average ?? item.voteAverage,
    };
  } catch {
    return item;
  }
}

export async function GET() {
  const apiKey =
    process.env.TMDB_API_KEY || '2de27bb73e68f7ebdc05dfcf29a5c2ed';

  try {
    let fetchError: string | null = null;
    let movies: TmdbItem[] = [];
    let tv: TmdbItem[] = [];
    let people: Array<Omit<TmdbItem, 'mediaType'>> = [];

    if (apiKey) {
      try {
        const [trendingMovies, popularMovies, trendingTv, popularTv, trendingPeople] =
          await Promise.all([
            fetchTmdbList(apiKey, '/trending/movie/day?sort_by=popularity.desc', 'movie'),
            fetchTmdbList(apiKey, '/movie/popular?', 'movie'),
            fetchTmdbList(apiKey, '/trending/tv/day?sort_by=popularity.desc', 'tv'),
            fetchTmdbList(apiKey, '/tv/popular?', 'tv'),
            fetchTmdbPeople(apiKey),
          ]);

        const localizedMovies = await Promise.all(
          dedup([...trendingMovies, ...popularMovies])
            .slice(0, 30)
            .map((item) => enrichTmdbItem(apiKey, item))
        );
        const localizedTv = await Promise.all(
          dedup([...trendingTv, ...popularTv])
            .slice(0, 30)
            .map((item) => enrichTmdbItem(apiKey, item))
        );

        movies = localizedMovies;
        tv = localizedTv;
        people = trendingPeople;
      } catch (err) {
        fetchError = (err as Error).message;
      }
    } else {
      fetchError = 'TMDB_API_KEY not configured';
    }

    if (!movies.length) {
      movies = FALLBACK_MOVIES.map((m) => ({ ...m, mediaType: 'movie' as const }));
    }

    if (!movies.length) {
      movies = FALLBACK_MOVIES.map((m) => ({ ...m, mediaType: 'movie' as const }));
    }

    return NextResponse.json(
      { movies, tv, people, error: fetchError ?? undefined },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unexpected error fetching TMDB list',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
