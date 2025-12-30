import { NextRequest } from 'next/server';

import { ApiSite, getAvailableApiSites } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { SearchResult } from '@/lib/types';
import { convertToSimplified } from '@/lib/locale';
import { convertResultsArray } from '@/lib/responseTrad';

const RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS = 2;

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchWithRetry(
  site: ApiSite,
  query: string
): Promise<{ results: SearchResult[]; failed: boolean }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const results = await searchFromApi(site, query);
      if (results.length > 0) {
        return { results, failed: false };
      }
    } catch (error) {
      lastError = error;
    }
    if (attempt < MAX_ATTEMPTS) {
      await delay(RETRY_DELAY_MS);
    }
  }
  if (lastError) {
    return { results: [], failed: true };
  }
  return { results: [], failed: false };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) {
    return new Response('Missing query parameter', { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const apiSites = await getAvailableApiSites();
      const simplifiedQuery = convertToSimplified(query) || query;
      let foundCount = 0;
      let emptyCount = 0;
      let failedCount = 0;

      // Fire provider searches in parallel (order comes from SourceConfig/valuations).
      const searchPromises = apiSites.map(async (site) => {
        try {
          const { results, failed } = await searchWithRetry(
            site,
            simplifiedQuery
          );
          if (results.length > 0) {
            const transformed = convertResultsArray(results);
            controller.enqueue(JSON.stringify(transformed));
            foundCount += 1;
          } else if (failed) {
            failedCount += 1;
          } else {
            emptyCount += 1;
          }
        } catch (error) {
          failedCount += 1;
        }
      });

      await Promise.all(searchPromises);

      controller.enqueue(
        JSON.stringify({
          __meta: true,
          searched: apiSites.length,
          found: foundCount,
          notFound: emptyCount + failedCount,
          empty: emptyCount,
          failed: failedCount,
        })
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
  });
}
