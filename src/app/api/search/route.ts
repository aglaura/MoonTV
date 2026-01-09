import { NextResponse } from 'next/server';

import { getAvailableApiSites, getCacheTime } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { fetchJsonWithRetry, fetchWithRetry } from '@/lib/fetchRetry.server';
import { convertToSimplified } from '@/lib/locale';
import { convertResultsArray } from '@/lib/responseTrad';
import { SearchResult } from '@/lib/types';

export const runtime = 'nodejs';

const imdbIdRegex = /(tt\d{5,}|imdbt\d+)/i;
const doubanIdRegex = /^\d{3,}$/;

type DoubanMeta = {
  title?: string;
  originalTitle?: string;
  year?: string;
  imdbId?: string;
  imdbTitle?: string;
};

async function fetchImdbTitle(imdbId: string): Promise<string | undefined> {
  if (imdbId.startsWith('imdbt')) return undefined;

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

    if (!response.ok) return undefined;
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

async function fetchImdbIdFromDouban(subjectId: string): Promise<string | undefined> {
  const detailUrl = `https://movie.douban.com/subject/${subjectId}/`;

  try {
    const response = await fetchWithRetry(detailUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Referer: 'https://movie.douban.com/',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) return undefined;
    const html = await response.text();
    const anchorMatch = html.match(/IMDb:\s*<a[^>]*>((?:tt|imdbt)\d+)<\/a>/i);
    if (anchorMatch?.[1]) return anchorMatch[1];
    const textMatch = html.match(/IMDb:\s*((?:tt|imdbt)\d+)/i);
    if (textMatch?.[1]) return textMatch[1];
    const genericMatch = html.match(/(tt\d{5,}|imdbt\d+)/i);
    return genericMatch?.[1];
  } catch {
    return undefined;
  }
}

async function fetchDoubanMeta(subjectId: string): Promise<DoubanMeta | null> {
  if (!doubanIdRegex.test(subjectId)) return null;

  const targetUrl = `https://movie.douban.com/j/subject_abstract?subject_id=${encodeURIComponent(
    subjectId
  )}`;

  try {
    const data = await fetchJsonWithRetry<{
      subject?: {
        id?: string;
        title?: string;
        original_title?: string;
        year?: string;
        pubdate?: string;
        pub_dates?: string[];
      };
    }>(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Referer: 'https://movie.douban.com/',
        Accept: 'application/json, text/plain, */*',
      },
    });

    const subject = data?.subject;
    if (!subject) return null;

    const year =
      subject.year ||
      subject.pubdate?.match?.(/\d{4}/)?.[0] ||
      subject.pub_dates
        ?.find((item) => /\d{4}/.test(item))
        ?.match(/\d{4}/)?.[0] ||
      '';

    const imdbId = await fetchImdbIdFromDouban(subjectId);
    const imdbTitle = imdbId ? await fetchImdbTitle(imdbId) : undefined;

    return {
      title: subject.title ?? undefined,
      originalTitle: subject.original_title ?? undefined,
      year,
      imdbId,
      imdbTitle,
    };
  } catch {
    return null;
  }
}

function dedupeQueries(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((v) => v.trim())
    .filter((v) => {
      if (!v) return false;
      const key = v.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    const cacheTime = await getCacheTime();
    return NextResponse.json(
      { results: [] },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}`,
        },
      }
    );
  }

  const apiSites = await getAvailableApiSites();
  const normalizedQueries = new Set<string>();
  normalizedQueries.add(query);

  const imdbMatch = query.match(imdbIdRegex);
  if (imdbMatch) {
    const imdbId = imdbMatch[1];
    const imdbTitle = await fetchImdbTitle(imdbId);
    if (imdbTitle) {
      normalizedQueries.add(imdbTitle);
    }
  }

  if (doubanIdRegex.test(query.trim())) {
    const doubanMeta = await fetchDoubanMeta(query.trim());
    if (doubanMeta?.title) normalizedQueries.add(doubanMeta.title);
    if (doubanMeta?.originalTitle) normalizedQueries.add(doubanMeta.originalTitle);
    if (doubanMeta?.imdbTitle) normalizedQueries.add(doubanMeta.imdbTitle);
  }

  const queriesToSearch = dedupeQueries(
    Array.from(normalizedQueries).map(
      (q) => convertToSimplified(q) || q
    )
  );

  const searchOnce = async (q: string): Promise<SearchResult[]> => {
    const promises = apiSites.map((site) => searchFromApi(site, q));
    const results = await Promise.all(promises);
    return results.flat() as SearchResult[];
  };

  const dedupeResults = (items: SearchResult[]) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      const altId = (item as { _id?: string })._id;
      const key = `${item.source || ''}-${item.id || altId || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  try {
    const allResults: SearchResult[] = [];
    for (const q of queriesToSearch) {
      const partial = await searchOnce(q);
      allResults.push(...partial);
    }

    const flattenedResults = dedupeResults(allResults);
    const cacheTime = await getCacheTime();

    const transformed = convertResultsArray(flattenedResults);

    return NextResponse.json(
      { results: transformed },
      {
        headers: {
          'Cache-Control': `public, max-age=${cacheTime}`,
        },
      }
    );
  } catch (error) {
    return NextResponse.json({ error: '搜索失败' }, { status: 500 });
  }
}
