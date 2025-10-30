import { NextResponse } from 'next/server';

import { getCacheTime } from '@/lib/config';

interface DoubanSubjectApiResponse {
  subject?: {
    id?: string;
    title?: string;
    original_title?: string;
    year?: string;
    pubdate?: string;
    pub_dates?: string[];
  };
}

async function fetchImdbIdFromDouban(
  subjectId: string
): Promise<string | undefined> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const detailUrl = `https://movie.douban.com/subject/${subjectId}/`;

  try {
    const response = await fetch(detailUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Referer: 'https://movie.douban.com/',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return undefined;
    }

    const html = await response.text();
    // Match standard IMDb IDs (tt\d+) or Douban's imdbt format (imdbt\d+)
    const anchorMatch = html.match(/IMDb:\s*<a[^>]*>((?:tt|imdbt)\d+)<\/a>/i);
    if (anchorMatch?.[1]) {
      return anchorMatch[1];
    }

    // Match standard IMDb IDs in plain text or Douban's imdbt format
    const textMatch = html.match(/IMDb:\s*((?:tt|imdbt)\d+)/i);
    if (textMatch?.[1]) {
      return textMatch[1];
    }

    // Fallback: sometimes Douban structures differ; try a generic search for an IMDb-like id
    const genericMatch = html.match(/(tt\d{5,}|imdbt\d+)/i);
    return genericMatch?.[1];
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchImdbTitle(imdbId: string): Promise<string | undefined> {
  // If it's a Douban-specific imdbt ID, we can't fetch the title from IMDb
  if (imdbId.startsWith('imdbt')) {
    return undefined;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  const imdbUrl = `https://www.imdb.com/title/${imdbId}/`;

  try {
    const response = await fetch(imdbUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return undefined;
    }

    const html = await response.text();
    const ogTitleMatch = html.match(
      /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i
    );
    if (ogTitleMatch?.[1]) {
      return ogTitleMatch[1].replace(/- IMDb.*$/i, '').trim();
    }

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch?.[1]) {
      return titleMatch[1].replace(/- IMDb.*$/i, '').trim();
    }

    return undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: '缺少必要参数: id' }, { status: 400 });
  }

  const sanitizedId = id.trim();
  if (!/^\d+$/.test(sanitizedId)) {
    return NextResponse.json({ error: '无效的豆瓣ID' }, { status: 400 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const targetUrl = `https://movie.douban.com/j/subject_abstract?subject_id=${encodeURIComponent(
    sanitizedId
  )}`;

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Referer: 'https://movie.douban.com/',
        Accept: 'application/json, text/plain, */*',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return NextResponse.json(
        { error: `豆瓣接口请求失败: ${response.status}` },
        { status: response.status }
      );
    }

    const data = (await response.json()) as DoubanSubjectApiResponse;
    if (!data?.subject) {
      return NextResponse.json(
        { error: '未找到豆瓣条目信息' },
        { status: 404 }
      );
    }

    const subject = data.subject;
    const year =
      subject.year ||
      subject.pubdate?.match?.(/\d{4}/)?.[0] ||
      subject.pub_dates
        ?.find((item) => /\d{4}/.test(item))
        ?.match(/\d{4}/)?.[0] ||
      '';

    const [imdbId, imdbTitle] = await (async () => {
      const fetchedImdbId = await fetchImdbIdFromDouban(sanitizedId);
      if (!fetchedImdbId) {
        return [undefined, undefined] as const;
      }
      const fetchedImdbTitle = await fetchImdbTitle(fetchedImdbId);
      return [fetchedImdbId, fetchedImdbTitle] as const;
    })();

    const result = {
      id: subject.id ?? sanitizedId,
      title: subject.title ?? '',
      original_title: subject.original_title ?? '',
      year,
      imdbId,
      imdbTitle,
    };

    const cacheTime = await getCacheTime();
    return NextResponse.json(result, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? '请求豆瓣接口超时'
        : (error as Error).message;
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    clearTimeout(timeoutId);
  }
}
