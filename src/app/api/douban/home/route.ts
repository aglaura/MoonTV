import { NextResponse } from 'next/server';

import { normalizeConfigJsonBase } from '@/lib/configjson';
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

function parseRegion(subtitle?: string): string | undefined {
  if (!subtitle) return undefined;
  if (/日本/.test(subtitle)) return 'jp';
  if (/韩国|韓國|韓/.test(subtitle)) return 'kr';
  if (/中国大陆|中國大陸|大陆|內地/.test(subtitle)) return 'cn';
  if (/香港/.test(subtitle)) return 'hk';
  if (/台湾|台灣/.test(subtitle)) return 'tw';
  return undefined;
}

function mapCategoryResponse(data: DoubanCategoryApiResponse): DoubanItem[] {
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    poster: item.pic?.normal || item.pic?.large || '',
    rate: item.rating?.value ? item.rating.value.toFixed(1) : '',
    year: item.card_subtitle?.match(/(\d{4})/)?.[1] || '',
    subtitle: item.card_subtitle,
    region: parseRegion(item.card_subtitle),
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
  return normalizeConfigJsonBase(process.env.CONFIGJSON);
}

function extFromContentType(ct?: string | null): string {
  if (!ct) return '.jpg';
  if (ct.includes('png')) return '.png';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  return '.jpg';
}

async function hasCachedPoster(base: string, baseName: string): Promise<boolean> {
  const exts = ['.jpg', '.webp', '.png', '.gif'];
  for (const ext of exts) {
    const candidate = `${base}/posters/${encodeURIComponent(`${baseName}${ext}`)}`;
    try {
      const head = await fetch(candidate, { method: 'HEAD' });
      if (head.ok) return true;
    } catch {
      // ignore single failure
    }
  }
  return false;
}

async function cachePoster(url: string, doubanId: string) {
  const base = buildPosterBase();
  if (!base || !url || !doubanId) return;
  const baseName = `douban-${doubanId}`;
  if (await hasCachedPoster(base, baseName)) return;

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
    const ext = extFromContentType(contentType);
    const filename = `${baseName}${ext}`;
    const target = `${base}/posters/${encodeURIComponent(filename)}`;

    // If another worker cached it while we fetched, skip upload.
    try {
      const head = await fetch(target, { method: 'HEAD' });
      if (head.ok) return;
    } catch {
      // ignore
    }
    const tryUpload = async () => {
      try {
        const direct = await fetch(target, {
          method: 'POST',
          headers: { 'Content-Type': contentType },
          body: buffer,
        });
        if (direct.ok) return true;
      } catch {
        // ignore
      }
      try {
        const fd = new FormData();
        fd.append('fileToUpload', new Blob([buffer], { type: contentType }), filename);
        const fbUrl = `${base}/posters/poster.php?name=${encodeURIComponent(filename)}`;
        const fbResp = await fetch(fbUrl, { method: 'POST', body: fd });
        return fbResp.ok;
      } catch {
        return false;
      }
    };
    await tryUpload();
  } catch {
    // ignore caching errors
  }
}

export async function GET() {
  try {
    const [movies, tv, variety, latestMovies, latestTv] = await Promise.all([
      fetchRecentHot('movie', '热门', '全部'),
      fetchRecentHot('tv', 'tv', 'tv'),
      fetchRecentHot('tv', 'show', 'show'),
      fetchRecentHot('movie', '最新', '全部'),
      fetchRecentHot('tv', '最新', '全部'),
    ]);

    // fire-and-forget cache posters to remote store if configured
    Promise.allSettled(
      [...movies, ...tv, ...variety]
        .filter((item) => item.poster && item.id)
        .map((item) => cachePoster(item.poster, item.id.toString()))
    ).catch(() => {});

    return NextResponse.json(
      { movies, tv, variety, latestMovies, latestTv },
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
