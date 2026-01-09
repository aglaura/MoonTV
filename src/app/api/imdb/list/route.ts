import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 1800; // cache for 30 minutes (best-effort; dynamic fetch)

// TMDB "Most Popular" movies (page 1)
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w500';

const FALLBACK_ITEMS = [
  {
    tmdbId: 'tmdb:278',
    title: 'The Shawshank Redemption',
    originalTitle: 'The Shawshank Redemption',
    year: '1994',
    poster: `${TMDB_IMAGE}/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg`,
  },
  {
    tmdbId: 'tmdb:238',
    title: 'The Godfather',
    originalTitle: 'The Godfather',
    year: '1972',
    poster: `${TMDB_IMAGE}/3bhkrj58Vtu7enYsRolD1fZdja1.jpg`,
  },
  {
    tmdbId: 'tmdb:424',
    title: 'Schindler\'s List',
    originalTitle: 'Schindler\'s List',
    year: '1993',
    poster: `${TMDB_IMAGE}/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg`,
  },
  {
    tmdbId: 'tmdb:550',
    title: 'Fight Club',
    originalTitle: 'Fight Club',
    year: '1999',
    poster: `${TMDB_IMAGE}/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg`,
  },
  {
    tmdbId: 'tmdb:155',
    title: 'The Dark Knight',
    originalTitle: 'The Dark Knight',
    year: '2008',
    poster: `${TMDB_IMAGE}/qJ2tW6WMUDux911r6m7haRef0WH.jpg`,
  },
];

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
    if (Array.isArray(data?.items) && data.items[0]?.title) {
      return data.items[0].title as string;
    }
    return undefined;
  } catch {
    return undefined;
  }
}

export async function GET() {
  const apiKey =
    process.env.TMDB_API_KEY || '2de27bb73e68f7ebdc05dfcf29a5c2ed';

  try {
    let items = FALLBACK_ITEMS;
    let fetchError: string | null = null;

    if (apiKey) {
      const url = `${TMDB_BASE}/movie/popular?api_key=${encodeURIComponent(
        apiKey
      )}&language=en-US&page=1`;
      const response = await fetch(url, { next: { revalidate: 3600 } });

      if (response.ok) {
        const json = await response.json();
        const results = Array.isArray(json?.results) ? json.results : [];

        const fetchedRaw = results
          .map((item: any) => {
            const originalTitle = (item?.title || item?.original_title || '').trim();
            return {
              tmdbId: `tmdb:${item?.id ?? ''}`,
              title: originalTitle,
              originalTitle,
              year: (item?.release_date || '').toString().slice(0, 4),
              poster: item?.poster_path ? `${TMDB_IMAGE}${item.poster_path}` : '',
            };
          })
          .filter((item: any) => item.tmdbId && item.title)
          .slice(0, 50);

        const fetched = await Promise.all(
          fetchedRaw.map(async (item: any) => {
            const cn = await fetchDoubanChineseTitle(item.title);
            if (cn) {
              return { ...item, title: cn };
            }
            return item;
          })
        );

        if (fetched.length > 0) {
          items = fetched;
        }
      } else {
        fetchError = `TMDB responded with ${response.status}`;
      }
    } else {
      fetchError = 'TMDB_API_KEY not configured';
    }

    return NextResponse.json(
      { items, error: fetchError ?? undefined },
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
