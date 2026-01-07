export type FetchRetryOptions = {
  retries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  retryStatuses?: number[];
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(ms: number): number {
  const factor = 0.2;
  const delta = ms * factor;
  return Math.max(0, Math.round(ms - delta + Math.random() * delta * 2));
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' || error.message.includes('aborted'))
  );
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: FetchRetryOptions
): Promise<Response> {
  const retries = options?.retries ?? 2;
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const baseDelayMs = options?.baseDelayMs ?? 400;
  const maxDelayMs = options?.maxDelayMs ?? 3_000;
  const retryStatuses = options?.retryStatuses ?? [429, 500, 502, 503, 504];

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (!retryStatuses.includes(res.status) || attempt === retries) {
        return res;
      }

      const retryAfterHeader = res.headers.get('retry-after');
      const retryAfterSeconds = retryAfterHeader
        ? Number(retryAfterHeader)
        : NaN;
      const retryAfterMs = Number.isFinite(retryAfterSeconds)
        ? retryAfterSeconds * 1000
        : null;

      const delay = Math.min(
        maxDelayMs,
        baseDelayMs * Math.pow(2, attempt)
      );
      await sleep(jitter(retryAfterMs ?? delay));
      continue;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      await sleep(jitter(isAbortError(error) ? delay : delay));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Fetch failed');
}

export async function fetchJsonWithRetry<T>(
  url: string,
  init?: RequestInit,
  options?: FetchRetryOptions
): Promise<T> {
  const res = await fetchWithRetry(url, init, options);
  if (!res.ok) {
    throw new Error(`HTTP error! Status: ${res.status}`);
  }
  return (await res.json()) as T;
}

