import { NextRequest } from 'next/server';

import { ApiSite, getAvailableApiSites } from '@/lib/config';
import { searchFromApi } from '@/lib/downstream';
import { SearchResult } from '@/lib/types';
import { convertToSimplified } from '@/lib/locale';
import { convertResultsArray } from '@/lib/responseTrad';

const RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS = 2;
const PROVIDER_RETRY_INTERVAL_MS = 1000;
const PROVIDER_RETRY_WINDOW_MS = 4000; // initial attempt + up to ~3s of retries
const OVERALL_TIMEOUT_MS = 5000; // ensure we return stats within ~5s

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
      let finalized = false;

      // Track per-provider response and retry up to the configured window.
      const providerStates = apiSites.map((site) => ({
        site,
        returned: false,
      }));

      const runProvider = async (state: { site: ApiSite; returned: boolean }) => {
        const deadline = Date.now() + PROVIDER_RETRY_WINDOW_MS;
        while (!state.returned && Date.now() <= deadline) {
          try {
            const { results, failed } = await searchWithRetry(
              state.site,
              simplifiedQuery
            );

            if (results.length > 0) {
              if (!finalized) {
                const transformed = convertResultsArray(results);
                controller.enqueue(JSON.stringify(transformed));
                foundCount += 1;
              }
              state.returned = true;
              return;
            }

            if (failed) {
              if (!finalized) {
                failedCount += 1;
              }
              state.returned = true;
              return;
            }

            // Empty but responded.
            if (!finalized) {
              emptyCount += 1;
            }
            state.returned = true;
            return;
          } catch (error) {
            // Treat exceptions as failure for this site.
            if (!finalized) {
              failedCount += 1;
            }
            state.returned = true;
            return;
          }
          // No response within attempt window, retry after interval until deadline.
          if (!state.returned && Date.now() < deadline) {
            await delay(PROVIDER_RETRY_INTERVAL_MS);
          }
        }
        if (!state.returned) {
          if (!finalized) {
            failedCount += 1;
          }
          state.returned = true;
        }
      };

      // Fire all providers in parallel with per-provider retry window, but stop waiting after timeout.
      const tasks = providerStates.map((state) => runProvider(state));
      await Promise.race([
        Promise.allSettled(tasks),
        delay(OVERALL_TIMEOUT_MS),
      ]);

      // If some providers never returned by the timeout, count them as failed.
      for (const state of providerStates) {
        if (!state.returned) {
          failedCount += 1;
          state.returned = true;
        }
      }
      finalized = true;

      controller.enqueue(
        JSON.stringify({
          __meta: true,
          searched: apiSites.length,
          found: foundCount,
          notFound: emptyCount,
          empty: emptyCount, // kept for backward compatibility; equals notFound
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
