import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3/playlistItems';

type YoutubePlaylistItem = {
  id: string;
  title: string;
  channel: string;
  thumbnail: string;
};

function getApiKey() {
  return process.env.YOUTUBE_API_KEY || process.env.NEXT_PUBLIC_YOUTUBE_API_KEY || '';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const playlistId = (searchParams.get('id') || '').trim();
  if (!playlistId) {
    return NextResponse.json({ error: 'Missing playlist id' }, { status: 400 });
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'YOUTUBE_API_KEY not configured' },
      { status: 500 }
    );
  }

  const params = new URLSearchParams();
  params.set('part', 'snippet');
  params.set('maxResults', '12');
  params.set('playlistId', playlistId);
  params.set('key', apiKey);

  const url = `${YOUTUBE_API}?${params.toString()}`;

  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      return NextResponse.json(
        { error: `YouTube playlist failed: ${res.status}` },
        { status: res.status }
      );
    }
    const data = (await res.json()) as {
      items?: Array<{
        snippet?: {
          title?: string;
          channelTitle?: string;
          resourceId?: { videoId?: string };
          thumbnails?: {
            high?: { url?: string };
            medium?: { url?: string };
            default?: { url?: string };
          };
        };
      }>;
    };
    const results: YoutubePlaylistItem[] = (data.items || [])
      .map((item) => ({
        id: item.snippet?.resourceId?.videoId || '',
        title: item.snippet?.title || '',
        channel: item.snippet?.channelTitle || '',
        thumbnail:
          item.snippet?.thumbnails?.high?.url ||
          item.snippet?.thumbnails?.medium?.url ||
          item.snippet?.thumbnails?.default?.url ||
          '',
      }))
      .filter((item) => item.id && item.title && item.title !== 'Deleted video');

    return NextResponse.json({ results }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'YouTube playlist request failed', details: String(error) },
      { status: 500 }
    );
  }
}
