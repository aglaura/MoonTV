import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const revalidate = 3600; // cache for 1 hour

// TMDB "Most Popular" movies (page 1)
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMAGE = 'https://image.tmdb.org/t/p/w500';

export async function GET() {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'TMDB_API_KEY is not configured' },
      { status: 500 }
    );
  }

  try {
    const url = `${TMDB_BASE}/movie/popular?api_key=${encodeURIComponent(
      apiKey
    )}&language=en-US&page=1`;
    const response = await fetch(url, { next: { revalidate: 3600 } });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch TMDB popular list: ${response.status}` },
        { status: 502 }
      );
    }

    const json = await response.json();
    const results = Array.isArray(json?.results) ? json.results : [];

    const items = results
      .map((item: any) => ({
        tmdbId: `tmdb:${item?.id ?? ''}`,
        title: (item?.title || item?.original_title || '').trim(),
        year: (item?.release_date || '').toString().slice(0, 4),
        poster: item?.poster_path ? `${TMDB_IMAGE}${item.poster_path}` : '',
      }))
      .filter((item: any) => item.tmdbId && item.title)
      .slice(0, 50);

    return NextResponse.json(
      { items },
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
