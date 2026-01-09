import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-static';
export const revalidate = 3600; // cache for 1 hour

// IMDb Top list endpoint. Uses __NEXT_DATA__ JSON to avoid brittle scraping.
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
    const nextMatch = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/
    );

    const items: Array<{ imdbId: string; title: string; year: string; poster: string }> = [];

    if (nextMatch && nextMatch[1]) {
      try {
        const json = JSON.parse(nextMatch[1]);
        const edges =
          json?.props?.pageProps?.pageData?.chartTitles?.edges ||
          json?.props?.pageProps?.pageData?.chartTitles ||
          [];
        for (const edge of edges) {
          const node = edge?.node ?? edge;
          const imdbId: string | undefined = node?.id;
          const title: string | undefined =
            node?.originalTitleText?.text || node?.titleText?.text;
          const poster: string | undefined = node?.primaryImage?.url;
          const year: string | undefined =
            node?.releaseYear?.year?.toString() ||
            node?.releaseYear?.endYear?.toString() ||
            '';
          if (!imdbId || !title) continue;
          items.push({
            imdbId,
            title: title.trim(),
            year: year ?? '',
            poster: poster?.trim() ?? '',
          });
          if (items.length >= 50) break;
        }
      } catch {
        // ignore parse errors
      }
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
