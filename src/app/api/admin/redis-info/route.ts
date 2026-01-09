import { NextResponse } from 'next/server';
import { createClient } from 'redis';

type RedisInfo = {
  used_memory?: number;
  used_memory_human?: string;
  maxmemory?: number;
  maxmemory_human?: string;
  maxmemory_policy?: string;
};

const parseInfo = (info: string): RedisInfo => {
  const lines = info.split('\n');
  const map: Record<string, string> = {};
  lines.forEach((line) => {
    const [k, v] = line.split(':');
    if (k && v !== undefined) {
      map[k.trim()] = v.trim();
    }
  });
  return {
    used_memory: map.used_memory ? Number(map.used_memory) : undefined,
    used_memory_human: map.used_memory_human,
    maxmemory: map.maxmemory ? Number(map.maxmemory) : undefined,
    maxmemory_human: map.maxmemory_human,
    maxmemory_policy: map.maxmemory_policy,
  };
};

const formatBytes = (bytes?: number): string | null => {
  if (!Number.isFinite(bytes)) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes as number;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[u]}`;
};

export async function GET() {
  const url = process.env.REDIS_URL;
  if (!url) {
    return NextResponse.json(
      { error: 'REDIS_URL is not configured' },
      { status: 400 }
    );
  }

  const client = createClient({ url });
  try {
    await client.connect();
    // `memory` section contains the metrics we need
    const rawInfo = await client.info('memory');
    const parsed = parseInfo(rawInfo);
    const used = parsed.used_memory ?? 0;
    const max = parsed.maxmemory ?? 0;
    const available =
      max > 0 && used >= 0 ? Math.max(0, max - used) : undefined;

    return NextResponse.json({
      used,
      usedHuman: parsed.used_memory_human || formatBytes(used),
      max,
      maxHuman: parsed.maxmemory_human || (max ? formatBytes(max) : null),
      available,
      availableHuman:
        available !== undefined ? formatBytes(available) : null,
      policy: parsed.maxmemory_policy || '—',
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Failed to query Redis';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  } finally {
    try {
      await client.quit();
    } catch {
      /* ignore */
    }
  }
}
