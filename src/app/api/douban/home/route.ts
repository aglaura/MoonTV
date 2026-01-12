import { NextResponse } from 'next/server';

import { fetchJsonWithRetry } from '@/lib/fetchRetry.server';
import { DoubanItem } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const revalidate = 600; // 10 minutes
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

type DoubanCategoryApiResponse = {
  total: number;
  items: Array<{
    id: string;
    title: string;
    card_subtitle: string;
    pic: {
      large: string;
      normal: string;
    };
    rating: {
      value: number;
    };
  }>;
};

function mapCategoryResponse(data: DoubanCategoryApiResponse): DoubanItem[] {
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    poster: item.pic?.normal || item.pic?.large || '',
    rate: item.rating?.value ? item.rating.value.toFixed(1) : '',
    year: item.card_subtitle?.match(/(\d{4})/)?.[1] || '',
  }));
}

async function fetchRecentHot(kind: 'tv' | 'movie', category: string, type: string) {
  const base = 'https://m.douban.cmliussss.net/rexxar/api/v2/subject/recent_hot';
  const target = `${base}/${kind}?start=0&limit=20&category=${encodeURIComponent(
    category,
  )}&type=${encodeURIComponent(type)}`;

  const data = await fetchJsonWithRetry<DoubanCategoryApiResponse>(
    target,
    {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://movie.douban.com/',
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://movie.douban.com',
      },
    },
    { retries: 2, timeoutMs: 10000 },
  );

  return mapCategoryResponse(data);
}

function buildPosterBase(): string | null {
  const raw = process.env.CONFIGJSON?.trim();
  if (!raw) return null;
  let base = raw;
  if (base.toLowerCase().endsWith('config.json')) {
    base = base.slice(0, -'config.json'.length);
  }
  return base.replace(/\/+$/, '');
}

async function cachePoster(url: string, doubanId: string) {
  const base = buildPosterBase();
  if (!base || !url || !doubanId) return;
  const target = `${base}/posters/${encodeURIComponent(`douban-${doubanId}.jpg`)}`;

  try {
    const head = await fetch(target, { method: 'HEAD' });
    if (head.ok) return;
  } catch {
    // ignore
  }

  try {
    const resp = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Referer: 'https://movie.douban.com/',
      },
    });
    if (!resp.ok) return;
    const contentType = resp.headers.get('content-type') || 'application/octet-stream';
    const buffer = await resp.arrayBuffer();
    await fetch(target, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: buffer,
    }).catch(() => {});
  } catch {
    // ignore caching errors
  }
}

export async function GET() {
  try {
    const [movies, tv, variety] = await Promise.all([
      fetchRecentHot('movie', '热门', '全部'),
      fetchRecentHot('tv', 'tv', 'tv'),
      fetchRecentHot('tv', 'show', 'show'),
    ]);

    // fire-and-forget cache posters to remote store if configured
    Promise.allSettled(
      [...movies, ...tv, ...variety]
        .filter((item) => item.poster && item.id)
        .map((item) => cachePoster(item.poster, item.id.toString()))
    ).catch(() => {});

    return NextResponse.json(
      { movies, tv, variety },
      {
        headers: {
          // Encourage CDN caching; Next's `revalidate` controls refresh cadence.
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=60',
        },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to load Douban home data',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
