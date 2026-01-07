import { NextResponse } from 'next/server';

import { fetchJsonWithRetry } from '@/lib/fetchRetry.server';
import { DoubanItem } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const revalidate = 600; // 10 minutes

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
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Referer: 'https://movie.douban.com/',
        Accept: 'application/json, text/plain, */*',
        Origin: 'https://movie.douban.com',
      },
    },
    { retries: 2, timeoutMs: 10000 },
  );

  return mapCategoryResponse(data);
}

export async function GET() {
  try {
    const [movies, tv, variety] = await Promise.all([
      fetchRecentHot('movie', '热门', '全部'),
      fetchRecentHot('tv', 'tv', 'tv'),
      fetchRecentHot('tv', 'show', 'show'),
    ]);

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

