import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_SEARCH = 'https://www.youtube.com/results';
const YOUTUBE_OEMBED = 'https://www.youtube.com/oembed';

type YoutubeSearchItem = {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
};

function getApiKey() {
  return process.env.YOUTUBE_API_KEY || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || '';
}

function buildThumbnail(id: string) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}

function normalizeLang(lang?: string) {
  const value = (lang || '').toLowerCase();
  if (value.startsWith('zh-hant')) return 'zh-Hant';
  if (value.startsWith('zh')) return 'zh-Hans';
  if (value.startsWith('ja')) return 'ja';
  if (value.startsWith('ko')) return 'ko';
  return 'en';
}

function resolveRegion(lang?: string) {
  if (!lang) return { region: 'US', relevance: 'en' };
  if (lang.startsWith('zh')) return { region: 'CN', relevance: 'zh-Hans' };
  if (lang.startsWith('ja')) return { region: 'JP', relevance: 'ja' };
  if (lang.startsWith('ko')) return { region: 'KR', relevance: 'ko' };
  return { region: 'US', relevance: 'en' };
}

async function fetchOEmbed(id: string) {
  const url = `${YOUTUBE_OEMBED}?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${id}`
  )}&format=json`;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      author_name?: string;
    };
    return {
      title: data.title || '',
      channel: data.author_name || '',
    };
  } catch {
    return null;
  }
}

async function scrapeYoutube(query: string, lang: string) {
  const normalized = normalizeLang(lang);
  const params = new URLSearchParams();
  params.set('search_query', query);
  params.set('hl', normalized);
  const url = `${YOUTUBE_SEARCH}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept-Language': normalized,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    return { results: [] as YoutubeSearchItem[], error: `YouTube HTML ${res.status}` };
  }
  const html = await res.text();
  const ids = Array.from(html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g))
    .map((match) => match[1])
    .filter(Boolean);
  const uniqueIds = Array.from(new Set(ids)).slice(0, 8);
  if (uniqueIds.length === 0) {
    return { results: [] as YoutubeSearchItem[], error: 'No video ids found' };
  }
  const meta = await Promise.all(uniqueIds.map((id) => fetchOEmbed(id)));
  const results: YoutubeSearchItem[] = uniqueIds.map((id, idx) => ({
    id,
    title: meta[idx]?.title || id,
    channel: meta[idx]?.channel || 'YouTube',
    thumbnail: buildThumbnail(id),
  }));
  return { results, error: '' };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').trim();
  const lang = (searchParams.get('lang') || '').trim().toLowerCase();
  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  try {
    const scrape = await scrapeYoutube(query, lang);
    if (scrape.results.length > 0) {
      return NextResponse.json({ results: scrape.results, source: 'scrape' }, { status: 200 });
    }
    const apiKey = getApiKey();
    if (!apiKey) {
      return NextResponse.json(
        { results: [], error: scrape.error || 'YOUTUBE_API_KEY not configured' },
        { status: 200 }
      );
    }

    const { region, relevance } = resolveRegion(lang);
    const params = new URLSearchParams();
    params.set('part', 'snippet');
    params.set('type', 'video');
    params.set('maxResults', '8');
    params.set('q', query);
    params.set('safeSearch', 'moderate');
    params.set('regionCode', region);
    params.set('relevanceLanguage', relevance);
    params.set('key', apiKey);

    const url = `${YOUTUBE_API}?${params.toString()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json(
        { results: [], error: `YouTube API ${res.status}` },
        { status: 200 }
      );
    }
    const data = (await res.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          channelTitle?: string;
          thumbnails?: {
            high?: { url?: string };
            medium?: { url?: string };
            default?: { url?: string };
          };
        };
      }>;
    };
    const results: YoutubeSearchItem[] = (data.items || [])
      .map((item) => ({
        id: item.id?.videoId || '',
        title: item.snippet?.title || '',
        channel: item.snippet?.channelTitle || '',
        thumbnail:
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          '',
      }))
      .filter((item) => item.id && item.title);

    return NextResponse.json({ results, source: 'api' }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { results: [], error: 'YouTube search request failed', details: String(error) },
      { status: 200 }
    );
  }
}
