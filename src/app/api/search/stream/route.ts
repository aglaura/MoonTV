import { NextRequest } from 'next/server';

import { ApiSite, getAvailableApiSites } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { convertToSimplified } from '@/lib/locale';
import { convertResultsArray } from '@/lib/responseTrad';

const RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS = 2;

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchWithRetry(site: ApiSite, query: string) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const results = await searchFromApi(site, query);
      if (results.length > 0) {
        return results;
      }
    } catch (error) {
      // Ignore and retry
    }
    if (attempt < MAX_ATTEMPTS) {
      await delay(RETRY_DELAY_MS);
    }
  }
  return [];
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

      // Fire provider searches in parallel (order comes from SourceConfig).
      const searchPromises = apiSites.map(async (site) => {
        try {
          const results = await searchWithRetry(site, simplifiedQuery);
          if (results.length > 0) {
            const transformed = convertResultsArray(results);
            controller.enqueue(JSON.stringify(transformed));
          }
        } catch (error) {
          // Ignore individual search errors
        }
      });

      await Promise.all(searchPromises);
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
