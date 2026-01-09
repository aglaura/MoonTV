import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const revalidate = 3600; // cache for 1 hour

// Very light IMDb list scrape for a curated chart URL (default: Top 250).
// Only returns title, imdbId, year, and poster.
// Adjust the TARGET_URL if you want a different list.
const TARGET_URL =
  'https://www.imdb.com/chart/top';

const itemRegex = /<li class="ipc-metadata-list-summary-item.*?<a href="\/title\/(tt\d{5,})\/"[^>]*>\s*<div[^>]*>\s*<img[^>]*?alt="([^"]+)"[^>]*?src="([^"]+)"[^>]*?>[\s\S]*?<span class="cli-title-metadata-item">(\d{4})<\/span>/gi;

export async function GET() {
  try {
    const response = await fetch(TARGET_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch IMDb list: ${response.status}` },
        { status: 502 }
      );
    }

    const html = await response.text();
    const items: Array<{ imdbId: string; title: string; year: string; poster: string }> = [];
    let match: RegExpExecArray | null;

    while ((match = itemRegex.exec(html)) !== null) {
      const imdbId = match[1];
      const title = match[2]?.trim() || '';
      const poster = match[3]?.trim() || '';
      const year = match[4]?.trim() || '';
      if (!imdbId || !title) continue;
      items.push({ imdbId, title, year, poster });
      if (items.length >= 50) break; // cap to keep payload small
    }

    return NextResponse.json(
      { items },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300',
        },
      }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Unexpected error fetching IMDb list',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
