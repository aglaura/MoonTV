import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';
import { fetchJsonWithRetry } from '@/lib/fetchRetry.server';

export const runtime = 'nodejs';

const WMDB_BASE = 'https://api.wmdb.tv';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

function normalizeLang(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const actor = searchParams.get('actor')?.trim() ?? '';
  const year = searchParams.get('year')?.trim() ?? '';
  const lang = normalizeLang(searchParams.get('lang'));

  if (!q && !actor && !year) {
    return NextResponse.json(
      { error: 'Missing query: provide q, actor, or year' },
      { status: 400 }
    );
  }

  const url = new URL('/api/v1/movie/search', WMDB_BASE);
  if (q) url.searchParams.set('q', q);
  if (actor) url.searchParams.set('actor', actor);
  if (year) url.searchParams.set('year', year);
  if (lang) url.searchParams.set('lang', lang);

  try {
    const data = await fetchJsonWithRetry<unknown>(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
      },
    });
    const cacheTime = await getCacheTime();
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to search WMDB', details: (error as Error).message },
      { status: 502 }
    );
  }
}
