import { NextRequest } from 'next/server';

import { ApiSite, getAvailableApiSites } from '@/lib/config';
import { db } from '@/lib/db';
import { searchFromApi } from '@/lib/downstream';
import { convertToSimplified } from '@/lib/locale';
import { convertResultsArray } from '@/lib/responseTrad';
import { SearchResult } from '@/lib/types';

const RETRY_DELAY_MS = 500;
const MAX_ATTEMPTS = 2;
const PROVIDER_RETRY_INTERVAL_MS = 500;
const PROVIDER_RETRY_WINDOW_MS = 5000; // initial attempt + retries within ~5s
const OVERALL_TIMEOUT_MS = 5000; // ensure we return stats within ~5s
const DEFAULT_PROVIDER_CONCURRENCY = 4;

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

async function persistProviderOutcome(
  siteKey: string,
  outcome:
    | { type: 'success'; pingTime: number }
    | { type: 'unavailable' | 'failed' | 'empty' }
) {
  try {
    if (!siteKey) return;
    if (outcome.type === 'success') {
      await db.saveSourceValuations([
        {
          key: siteKey,
          source: siteKey,
          quality: '未知',
          loadSpeed: '未知',
          pingTime: Math.max(1, Math.round(outcome.pingTime)),
          sampleCount: 1,
          updated_at: Date.now(),
        },
      ]);
      return;
    }

    await db.saveSourceValuations([
      {
        key: siteKey,
        source: siteKey,
        quality: 'Unavailable',
        loadSpeed: 'Unavailable',
        pingTime: Number.MAX_SAFE_INTEGER,
        qualityRank: -1,
        speedValue: 0,
        sampleCount: 1,
        updated_at: Date.now(),
      },
    ]);
  } catch {
    // ignore
  }
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
      const encoder = new TextEncoder();
      const apiSites = await getAvailableApiSites();
      const providerConcurrencyRaw = Number(
        process.env.PROVIDER_SEARCH_CONCURRENCY ?? DEFAULT_PROVIDER_CONCURRENCY
      );
      const providerConcurrency = Number.isFinite(providerConcurrencyRaw)
        ? Math.max(
            1,
            Math.min(Math.floor(providerConcurrencyRaw), apiSites.length || 1)
          )
        : Math.min(DEFAULT_PROVIDER_CONCURRENCY, apiSites.length || 1);
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
            const startTime = Date.now();
            const { results, failed } = await searchWithRetry(
              state.site,
              simplifiedQuery
            );
            const pingTime = Date.now() - startTime;

            if (results.length > 0) {
              const transformed = convertResultsArray(results);
              const playable = transformed.filter(
                (r) => Array.isArray(r.episodes) && r.episodes.length > 0
              );

              if (!finalized && playable.length > 0) {
                controller.enqueue(encoder.encode(`${JSON.stringify(playable)}\n`));
                foundCount += 1;
                await persistProviderOutcome(state.site.key, {
                  type: 'success',
                  pingTime,
                });
                state.returned = true;
                return;
              }

              // Provider responded but none of the results were playable.
              if (!finalized) {
                emptyCount += 1;
              }
              await persistProviderOutcome(state.site.key, { type: 'unavailable' });
              state.returned = true;
              return;
            }

            if (failed) {
              if (!finalized) {
                failedCount += 1;
              }
              await persistProviderOutcome(state.site.key, { type: 'failed' });
              state.returned = true;
              return;
            }

            // Empty but responded.
            if (!finalized) {
              emptyCount += 1;
            }
            await persistProviderOutcome(state.site.key, { type: 'empty' });
            state.returned = true;
            return;
          } catch (error) {
            // Treat exceptions as failure for this site.
            if (!finalized) {
              failedCount += 1;
            }
            await persistProviderOutcome(state.site.key, { type: 'failed' });
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
          await persistProviderOutcome(state.site.key, { type: 'failed' });
          state.returned = true;
        }
      };

      // Run providers in priority order (as returned by getAvailableApiSites),
      // with limited concurrency so early providers get searched first.
      let nextIndex = 0;
      const workers = Array.from(
        { length: Math.min(providerConcurrency, providerStates.length) },
        async () => {
          while (!finalized) {
            const idx = nextIndex++;
            if (idx >= providerStates.length) return;
            await runProvider(providerStates[idx]);
          }
        }
      );

      const outcome = await Promise.race([
        Promise.allSettled(workers).then(() => 'done' as const),
        delay(OVERALL_TIMEOUT_MS).then(() => 'timeout' as const),
      ]);
      finalized = outcome === 'timeout';

      // If some providers never returned by the timeout, count them as failed.
      for (const state of providerStates) {
        if (!state.returned) {
          failedCount += 1;
          await persistProviderOutcome(state.site.key, { type: 'failed' });
          state.returned = true;
        }
      }
      finalized = true;

      controller.enqueue(
        encoder.encode(
          `${JSON.stringify({
          __meta: true,
          searched: apiSites.length,
          found: foundCount,
          notFound: emptyCount,
          empty: emptyCount, // kept for backward compatibility; equals notFound
          failed: failedCount,
        })}\n`
        )
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
