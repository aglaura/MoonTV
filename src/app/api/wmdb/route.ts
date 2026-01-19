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
  const id = searchParams.get('id')?.trim() || searchParams.get('doubanId')?.trim();
  const lang = normalizeLang(searchParams.get('lang'));

  if (!id) {
    return NextResponse.json({ error: 'Missing required parameter: id' }, { status: 400 });
  }

  const url = new URL('/movie/api', WMDB_BASE);
  url.searchParams.set('id', id);
  if (lang) {
    url.searchParams.set('lang', lang);
  }

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
      { error: 'Failed to fetch WMDB detail', details: (error as Error).message },
      { status: 502 }
    );
  }
}
