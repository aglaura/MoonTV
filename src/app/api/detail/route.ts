import { NextResponse } from 'next/server';

import { getAvailableApiSites, getCacheTime } from '@/lib/config';
import { getDetailFromApi } from '@/lib/downstream';
import { convertSearchResultToTraditional } from '@/lib/responseTrad';

function buildCacheBase(): string | null {
  const raw = process.env.CONFIGJSON?.trim();
  if (!raw) return null;
  let base = raw;
  if (base.toLowerCase().endsWith('config.json')) {
    base = base.slice(0, -'config.json'.length);
  }
  return base.replace(/\/+$/, '');
}

async function tryFetchCache(url: string) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function tryUploadCache(url: string, data: unknown) {
  try {
    const buffer = Buffer.from(JSON.stringify(data));
    const putResp = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: buffer,
    });
    if (putResp.ok) return;
  } catch {
    // ignore and try fallback
  }

  // Fallback: use poster.php uploader if available
  try {
    const base = url.replace(/\/cache\/.+$/, '');
    const fd = new FormData();
    fd.append(
      'fileToUpload',
      new Blob([JSON.stringify(data)], { type: 'application/json' }),
      url.split('/').pop() || 'detail-cache.json'
    );
    await fetch(`${base}/posters/poster.php`, { method: 'POST', body: fd });
  } catch {
    // swallow errors; cache is best-effort
  }
}

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const sourceCode = searchParams.get('source');

  if (!id || !sourceCode) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
  }

  if (!/^[\w-]+$/.test(id)) {
    return NextResponse.json({ error: '无效的视频ID格式' }, { status: 400 });
  }

  try {
    // Try cache on CONFIGJSON site first
    const cacheBase = buildCacheBase();
    const cacheKey = `detail-${sourceCode}-${id}.json`;
    const cacheUrl =
      cacheBase && cacheBase.length > 0 ? `${cacheBase}/cache/${cacheKey}` : null;

    if (cacheUrl) {
      const cached = await tryFetchCache(cacheUrl);
      if (cached) {
        return NextResponse.json(cached, {
          headers: {
            'Cache-Control': 'public, max-age=900, stale-while-revalidate=300',
            'x-cache': 'remote-hit',
          },
        });
      }
    }

    const apiSites = await getAvailableApiSites();
    const apiSite = apiSites.find((site) => site.key === sourceCode);

    if (!apiSite) {
      return NextResponse.json({ error: '无效的API来源' }, { status: 400 });
    }

    const result = await getDetailFromApi(apiSite, id);
    const cacheTime = await getCacheTime();

    const transformed = convertSearchResultToTraditional(result);

    if (cacheUrl) {
      void tryUploadCache(cacheUrl, transformed);
    }

    return NextResponse.json(transformed, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}
