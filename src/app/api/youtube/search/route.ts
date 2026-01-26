import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3/search';

type YoutubeSearchItem = {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
};

function getApiKey() {
  return process.env.YOUTUBE_API_KEY || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || '';
}

function resolveRegion(lang?: string) {
  if (!lang) return { region: 'US', relevance: 'en' };
  if (lang.startsWith('zh')) return { region: 'CN', relevance: 'zh-Hans' };
  if (lang.startsWith('ja')) return { region: 'JP', relevance: 'ja' };
  if (lang.startsWith('ko')) return { region: 'KR', relevance: 'ko' };
  return { region: 'US', relevance: 'en' };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') || '').trim();
  const lang = (searchParams.get('lang') || '').trim().toLowerCase();
  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'YOUTUBE_API_KEY not configured' },
      { status: 500 }
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

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json(
        { error: `YouTube search failed: ${res.status}` },
        { status: res.status }
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

    return NextResponse.json({ results }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'YouTube search request failed', details: String(error) },
      { status: 500 }
    );
  }
}
