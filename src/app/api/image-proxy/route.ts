import { NextResponse } from 'next/server';

import { normalizeConfigJsonBase } from '@/lib/configjson';

export const runtime = 'edge';

const MAX_IMAGE_BYTES = (() => {
  const raw = Number(process.env.IMAGE_PROXY_MAX_BYTES);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 8 * 1024 * 1024; // 8MB default
})();

function buildPosterBaseUrl(): string | null {
  return normalizeConfigJsonBase(process.env.CONFIGJSON);
}

function getAllowedHosts(posterBase: string | null): string[] {
  const raw =
    process.env.IMAGE_PROXY_ALLOWED_HOSTS ||
    process.env.IMAGE_PROXY_ALLOWLIST ||
    '';
  const parsed = raw
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (posterBase) {
    try {
      const host = new URL(posterBase).hostname.toLowerCase();
      if (host) parsed.push(host);
    } catch {
      // ignore invalid poster base
    }
  }
  return Array.from(new Set(parsed));
}

function normalizeHost(host: string): string {
  return host.replace(/\.$/, '').toLowerCase();
}

function isPrivateIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return false;
  const [a, b] = nums;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const normalized = host.toLowerCase();
  return (
    normalized === '::1' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

function isLocalHostname(host: string): boolean {
  const normalized = normalizeHost(host);
  return (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local') ||
    normalized.endsWith('.internal')
  );
}

function matchesAllowlist(host: string, allowlist: string[]): boolean {
  if (!allowlist.length) return true;
  const normalized = normalizeHost(host);
  return allowlist.some((entry) => {
    const rule = normalizeHost(entry);
    if (!rule) return false;
    if (rule.startsWith('.')) {
      const suffix = rule.slice(1);
      return normalized === suffix || normalized.endsWith(`.${suffix}`);
    }
    return normalized === rule || normalized.endsWith(`.${rule}`);
  });
}

function validateRemoteUrl(url: string, allowlist: string[]): { ok: boolean; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: 'Invalid image URL' };
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    return { ok: false, error: 'Unsupported URL scheme' };
  }
  const host = parsed.hostname;
  if (!host) {
    return { ok: false, error: 'Invalid image host' };
  }
  if (isLocalHostname(host)) {
    return { ok: false, error: 'Blocked local host' };
  }
  const normalized = normalizeHost(host);
  const isIpv4 = /^[0-9.]+$/.test(normalized);
  const isIpv6 = normalized.includes(':');
  if (isIpv4 && isPrivateIpv4(normalized)) {
    return { ok: false, error: 'Blocked private IP' };
  }
  if (isIpv6 && isPrivateIpv6(normalized)) {
    return { ok: false, error: 'Blocked private IP' };
  }
  if (!matchesAllowlist(normalized, allowlist)) {
    return { ok: false, error: 'Host not allowed' };
  }
  return { ok: true };
}

async function readResponseWithLimit(
  response: Response,
  maxBytes: number
): Promise<{ buffer: ArrayBuffer | null; tooLarge: boolean }> {
  if (!response.body) {
    return { buffer: null, tooLarge: false };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      received += value.byteLength;
      if (received > maxBytes) {
        return { buffer: null, tooLarge: true };
      }
      chunks.push(value);
    }
  }
  const buffer = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { buffer: buffer.buffer, tooLarge: false };
}

function extFromContentType(ct?: string | null): string {
  if (!ct) return '.jpg';
  if (ct.includes('png')) return '.png';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  return '.jpg';
}

async function hashBuffer(input: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', input);
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

async function findCachedPosterByBaseName(
  posterBase: string | null,
  baseName: string | null
): Promise<string | null> {
  if (!posterBase || !baseName) return null;
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
    const allowlist = getAllowedHosts(posterBase);
    const validation = validateRemoteUrl(imageUrl, allowlist);
    if (!validation.ok) {
      return NextResponse.json(
        { error: validation.error || 'Invalid image URL' },
        { status: 400 }
      );
    }

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
    const contentLengthRaw = imageResponse.headers.get('content-length');
    const contentLength = contentLengthRaw ? Number(contentLengthRaw) : 0;
    if (contentLength && contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: 'Image too large' },
        { status: 413 }
      );
    }

    if (!imageResponse.body) {
      return NextResponse.json(
        { error: 'Image response has no body' },
        { status: 500 }
      );
    }

    const { buffer, tooLarge } = await readResponseWithLimit(
      imageResponse,
      MAX_IMAGE_BYTES
    );
    if (tooLarge) {
      return NextResponse.json(
        { error: 'Image too large' },
        { status: 413 }
      );
    }
    if (!buffer) {
      return NextResponse.json(
        { error: 'Image response has no body' },
        { status: 500 }
      );
    }

    if (posterBase) {
      try {
        const ext = extFromContentType(contentType);
        const baseName = doubanId
          ? `douban-${doubanId}`
          : imdbId
          ? `imdb-${imdbId}`
          : `hash-${await hashBuffer(buffer)}`;
        const filename = `${baseName}${ext}`;
        const targetUrl = `${posterBase}/posters/${encodeURIComponent(filename)}`;

        // If already cached under any supported extension, redirect to it.
        const cachedAnyExt = await findCachedPosterByBaseName(posterBase, baseName);
        if (cachedAnyExt) {
          return NextResponse.redirect(cachedAnyExt, { status: 302 });
        }

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
    return new Response(buffer, {
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
