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
    year: '1994',
    poster: `${TMDB_IMAGE}/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg`,
  },
  {
    tmdbId: 'tmdb:238',
    title: 'The Godfather',
    year: '1972',
    poster: `${TMDB_IMAGE}/3bhkrj58Vtu7enYsRolD1fZdja1.jpg`,
  },
  {
    tmdbId: 'tmdb:424',
    title: 'Schindler\'s List',
    year: '1993',
    poster: `${TMDB_IMAGE}/sF1U4EUQS8YHUYjNl3pMGNIQyr0.jpg`,
  },
  {
    tmdbId: 'tmdb:550',
    title: 'Fight Club',
    year: '1999',
    poster: `${TMDB_IMAGE}/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg`,
  },
  {
    tmdbId: 'tmdb:155',
    title: 'The Dark Knight',
    year: '2008',
    poster: `${TMDB_IMAGE}/qJ2tW6WMUDux911r6m7haRef0WH.jpg`,
  },
];

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

        const fetched = results
          .map((item: any) => ({
            tmdbId: `tmdb:${item?.id ?? ''}`,
            title: (item?.title || item?.original_title || '').trim(),
            year: (item?.release_date || '').toString().slice(0, 4),
            poster: item?.poster_path ? `${TMDB_IMAGE}${item.poster_path}` : '',
          }))
          .filter((item: any) => item.tmdbId && item.title)
          .slice(0, 50);

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
