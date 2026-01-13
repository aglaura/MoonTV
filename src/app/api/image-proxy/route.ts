import { NextResponse } from 'next/server';

export const runtime = 'edge';

function buildPosterBaseUrl(): string | null {
  const raw = process.env.CONFIGJSON?.trim();
  if (!raw) return null;
  let base = raw;
  if (base.toLowerCase().endsWith('config.json')) {
    base = base.slice(0, -'config.json'.length);
  }
  return base.replace(/\/+$/, '');
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

    const posterBase = buildPosterBaseUrl();
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
