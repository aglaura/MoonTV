import { NextResponse } from 'next/server';

import { normalizeConfigJsonBase } from '@/lib/configjson';

export const runtime = 'edge';

function buildPosterBaseUrl(): string | null {
  return normalizeConfigJsonBase(process.env.CONFIGJSON);
}

function extFromContentType(ct?: string | null): string {
  if (!ct) return '.jpg';
  if (ct.includes('png')) return '.png';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  return '.jpg';
}

async function hashString(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const bytes = Array.from(new Uint8Array(digest));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function findCachedPoster(
  posterBase: string | null,
  doubanId?: string | null,
  imdbId?: string | null
): Promise<string | null> {
  if (!posterBase) return null;
  const baseName = doubanId
    ? `douban-${doubanId}`
    : imdbId
    ? `imdb-${imdbId}`
    : null;
  if (!baseName) return null;

  const exts = ['.jpg', '.webp', '.png', '.gif'];
  for (const ext of exts) {
    const candidate = `${posterBase}/posters/${baseName}${ext}`;
    try {
      const head = await fetch(candidate, {
        method: 'HEAD',
        cache: 'no-store',
      });
      if (head.ok) return candidate;
    } catch {
      // ignore single failure
    }
  }
  return null;
}

async function tryRemoteProxy(opts: {
  imageUrl: string;
  doubanId?: string | null;
  imdbId?: string | null;
  posterBase: string | null;
}) {
  const { imageUrl, doubanId, imdbId, posterBase } = opts;
  if (!posterBase) return null;

  const proxyUrl = `${posterBase}/posters/proxy.php`;
  const qs = new URLSearchParams({ url: imageUrl });
  if (doubanId) qs.set('doubanId', doubanId);
  if (imdbId) qs.set('imdbId', imdbId);

  try {
    const resp = await fetch(`${proxyUrl}?${qs.toString()}`, {
      cache: 'no-store',
    });
    if (!resp.ok) return null;

    const contentType = resp.headers.get('content-type') || '';
    // If proxy returns JSON with a cached URL, redirect directly
    if (contentType.includes('application/json')) {
      const data = await resp.json().catch(() => null);
      const cached = data?.url || data?.path;
      if (cached) {
        const target = cached.startsWith('http')
          ? cached
          : `${posterBase}/posters/${cached.replace(/^\//, '')}`;
        return { redirect: target };
      }
    }

    // If proxy streams the image, passthrough
    const headers = new Headers();
    if (contentType) headers.set('Content-Type', contentType);
    headers.set('Cache-Control', 'public, max-age=15720000');
    return {
      response: new Response(resp.body, {
        status: resp.status,
        headers,
      }),
    };
  } catch {
    return null;
  }
}

// OrionTV 兼容接口
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');
  const doubanId = searchParams.get('doubanId')?.trim();
  const imdbId = searchParams.get('imdbId')?.trim();

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing image URL' }, { status: 400 });
  }

  try {
    const posterBase = buildPosterBaseUrl();
    const cachedPoster = await findCachedPoster(posterBase, doubanId, imdbId);
    if (cachedPoster) {
      return NextResponse.redirect(cachedPoster, { status: 302 });
    }

    const remote = await tryRemoteProxy({
      imageUrl,
      doubanId,
      imdbId,
      posterBase,
    });
    if (remote?.redirect) {
      return NextResponse.redirect(remote.redirect, { status: 302 });
    }
    if (remote?.response) {
      return remote.response;
    }

    const imageResponse = await fetch(imageUrl, {
      headers: {
        Referer: 'https://movie.douban.com/',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
    });

    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: imageResponse.statusText },
        { status: imageResponse.status }
      );
    }

    const contentType = imageResponse.headers.get('content-type');

    if (!imageResponse.body) {
      return NextResponse.json(
        { error: 'Image response has no body' },
        { status: 500 }
      );
    }

    if (posterBase) {
      try {
        const buffer = await imageResponse.arrayBuffer();
        const ext = extFromContentType(contentType);
        const filename = doubanId
          ? `douban-${doubanId}${ext}`
          : imdbId
          ? `imdb-${imdbId}${ext}`
          : `hash-${await hashString(imageUrl)}${ext}`;
        const targetUrl = `${posterBase}/posters/${encodeURIComponent(filename)}`;

        // If already cached, redirect to it.
        try {
          const head = await fetch(targetUrl, { method: 'HEAD' });
          if (head.ok) {
            return NextResponse.redirect(targetUrl, { status: 302 });
          }
        } catch {
          // ignore head failures
        }

        // Upload via POST; fallback to poster.php multipart for servers that block direct POST
        const tryUploads = async () => {
          try {
            const postResp = await fetch(targetUrl, {
              method: 'POST',
              headers: {
                'Content-Type': contentType || 'application/octet-stream',
              },
              body: buffer,
            });
            if (postResp.ok) return true;
          } catch {
            // ignore
          }

          // fallback poster.php multipart using fileToUpload to match common handlers
          try {
            const fd = new FormData();
            fd.append(
              'fileToUpload',
              new Blob([buffer], { type: contentType || 'application/octet-stream' }),
              filename
            );
            const fbUrl = `${posterBase}/posters/poster.php?name=${encodeURIComponent(filename)}`;
            const fbResp = await fetch(fbUrl, { method: 'POST', body: fd });
            if (fbResp.ok) return true;
          } catch {
            // ignore
          }
          return false;
        };

        const uploaded = await tryUploads();
        if (uploaded) {
          return NextResponse.redirect(targetUrl, { status: 302 });
        }

        // Fallback: serve original buffer
        const headers = new Headers();
        if (contentType) headers.set('Content-Type', contentType);
        headers.set('Cache-Control', 'public, max-age=15720000');
        return new Response(buffer, { status: 200, headers });
      } catch {
        // fallback to streaming response
      }
    }

    // 创建响应头
    const headers = new Headers();
    if (contentType) {
      headers.set('Content-Type', contentType);
    }

    // 设置缓存头（可选）
    headers.set('Cache-Control', 'public, max-age=15720000'); // 缓存半年

    // 直接返回图片流
    return new Response(imageResponse.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Error fetching image' },
      { status: 500 }
    );
  }
}
