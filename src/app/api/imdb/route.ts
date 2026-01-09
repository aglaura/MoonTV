import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const imdbTitleRegex = /<meta\s+property="og:title"\s+content="([^"]+)"/i;
const titleCleanupRegex = /\s*-\s*IMDb\s*$/i;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const imdbId = searchParams.get('id')?.trim();

  if (!imdbId || !/^tt\d{5,}$/.test(imdbId)) {
    return NextResponse.json(
      { error: 'Invalid or missing IMDb id' },
      { status: 400 }
    );
  }

  const targetUrl = `https://www.imdb.com/title/${imdbId}/`;

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
    });

    // If IMDb redirects (e.g., invalid id) to a generic page, reject.
    const finalUrl = response.url || targetUrl;
    if (!finalUrl.includes(`/title/${imdbId}/`)) {
      return NextResponse.json(
        { error: 'IMDb did not return a title page for this id' },
        { status: 404 }
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch IMDb page: ${response.status}` },
        { status: 502 }
      );
    }

    const html = await response.text();
    const match = imdbTitleRegex.exec(html);
    const rawTitle = match?.[1]?.trim() ?? '';
    const cleaned = titleCleanupRegex.test(rawTitle)
      ? rawTitle.replace(titleCleanupRegex, '').trim()
      : rawTitle;

    if (!cleaned) {
      return NextResponse.json(
        { error: 'Unable to extract IMDb title' },
        { status: 404 }
      );
    }

    return NextResponse.json({ title: cleaned });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unexpected error while fetching IMDb title',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
