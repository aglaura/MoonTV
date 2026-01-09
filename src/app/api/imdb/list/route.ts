import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const revalidate = 3600; // cache for 1 hour

// IMDb Top list endpoint. Uses the JSON-LD block on the page to avoid brittle HTML scraping.
const TARGET_URL = 'https://www.imdb.com/chart/top';

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
    const ldMatch = html.match(
      /<script type="application\/ld\+json">([^<]+)<\/script>/
    );

    const items: Array<{ imdbId: string; title: string; year: string; poster: string }> =
      [];

    if (ldMatch && ldMatch[1]) {
      try {
        const json = JSON.parse(ldMatch[1]);
        const list = json?.itemListElement ?? [];
        for (const entry of list) {
          const item = entry?.item;
          const url: string | undefined = item?.url;
          const imdbId = url?.match(/title\/(tt\d+)/)?.[1];
          const title = item?.name ?? '';
          const poster = item?.image ?? '';
          const year = item?.datePublished ?? '';
          if (!imdbId || !title) continue;
          items.push({
            imdbId,
            title: title.trim(),
            year: year?.toString() ?? '',
            poster: poster?.trim() ?? '',
          });
          if (items.length >= 50) break;
        }
      } catch (err) {
        // ignore parse errors and return empty list
      }
    }

    // Fallback: keep payload empty but return 200 to avoid crashing pages.

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
