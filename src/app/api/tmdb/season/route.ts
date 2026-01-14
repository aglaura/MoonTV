import { NextResponse } from 'next/server';

const TMDB_BASE = 'https://api.themoviedb.org/3';

function getApiKey() {
  return process.env.TMDB_API_KEY;
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`TMDB ${res.status}`);
  }
  return res.json();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tmdbIdRaw = searchParams.get('tmdbId') || '';
  const imdbId = searchParams.get('imdbId') || '';

  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'TMDB_API_KEY not configured' },
      { status: 500 }
    );
  }

  try {
    let tmdbId = tmdbIdRaw.startsWith('tmdb:')
      ? tmdbIdRaw.replace('tmdb:', '')
      : tmdbIdRaw;

    if (!tmdbId && imdbId) {
      const findUrl = `${TMDB_BASE}/find/${encodeURIComponent(
        imdbId
      )}?api_key=${encodeURIComponent(apiKey)}&external_source=imdb_id`;
      const findData = await fetchJson(findUrl);
      const tvRes = Array.isArray(findData?.tv_results)
        ? findData.tv_results[0]
        : null;
      tmdbId = tvRes?.id ? String(tvRes.id) : '';
    }

    if (!tmdbId) {
      return NextResponse.json(
        { error: 'tmdbId or imdbId required' },
        { status: 400 }
      );
    }

    const detailUrl = `${TMDB_BASE}/tv/${encodeURIComponent(
      tmdbId
    )}?api_key=${encodeURIComponent(apiKey)}&append_to_response=recommendations`;
    const detail = await fetchJson(detailUrl);

    const seasons = Array.isArray(detail?.seasons) ? detail.seasons : [];
    const recs = Array.isArray(detail?.recommendations?.results)
      ? detail.recommendations.results
      : [];

    return NextResponse.json({
      tmdbId: `tmdb:${tmdbId}`,
      seasons,
      recommendations: recs.map((r: any) => ({
        id: r.id,
        name: r.name || r.title || '',
        poster: r.poster_path
          ? `https://image.tmdb.org/t/p/w500${r.poster_path}`
          : '',
        firstAirDate: r.first_air_date || r.release_date || '',
        voteAverage: r.vote_average,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
