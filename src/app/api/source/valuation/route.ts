import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { SourceValuation } from '@/lib/types';
import { getQualityRank, parseSpeedToKBps } from '@/lib/utils';

export const runtime = 'nodejs';

type SourceValuationPayload = SourceValuation;

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const valuations = Array.isArray(body?.valuations)
      ? (body.valuations as SourceValuationPayload[])
      : [];

    if (valuations.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const sanitized = valuations
      .filter(
        (item) =>
          typeof item?.key === 'string' &&
          typeof item?.source === 'string'
      )
      .map((item) => {
        const trimmedKey = item.key.trim();
        const trimmedSource = item.source.trim();
        const trimmedId =
          typeof item.id === 'string' ? item.id.trim() : '';

        return {
          key: trimmedKey,
          source: trimmedSource,
          ...(trimmedId ? { id: trimmedId } : {}),
          quality: item.quality ?? '',
          loadSpeed: item.loadSpeed ?? '',
          pingTime: Number.isFinite(item.pingTime) ? item.pingTime : 0,
          qualityRank: getQualityRank(item.quality),
          speedValue: parseSpeedToKBps(item.loadSpeed),
          sampleCount:
            typeof item.sampleCount === 'number' && item.sampleCount > 0
              ? Math.round(item.sampleCount)
              : 1,
          updated_at: item.updated_at ?? Date.now(),
        };
      });

    if (sanitized.length === 0) {
      return NextResponse.json({ ok: true });
    }

    await db.saveSourceValuations(sanitized);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Failed to persist source valuations:', error);
    return NextResponse.json(
      { error: 'Failed to persist source valuations' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const keysParam = searchParams.get('keys');
    if (!keysParam) {
      return NextResponse.json({});
    }

    const keys = keysParam
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean);

    if (keys.length === 0) {
      return NextResponse.json({});
    }

    const valuations = await db.getSourceValuations(keys);
    const normalizedItems = Object.values(valuations).map((item) => {
      const qualityRank = item.qualityRank ?? getQualityRank(item.quality);
      const speedValue = item.speedValue ?? parseSpeedToKBps(item.loadSpeed);
      const sampleCount =
        typeof item.sampleCount === 'number' && item.sampleCount > 0
          ? Math.round(item.sampleCount)
          : 1;
      return {
        ...item,
        qualityRank,
        speedValue,
        sampleCount,
      };
    });

    const items: SourceValuation[] = [];
    normalizedItems.forEach((item) => {
      const trimmedKey = (item.key || item.source || '').trim();
      if (!trimmedKey) {
        return;
      }
      items.push({
        ...item,
        key: trimmedKey,
      });
    });

    items.sort((a, b) => {
      const qualityRankB = b.qualityRank ?? 0;
      const qualityRankA = a.qualityRank ?? 0;
      if (qualityRankB !== qualityRankA) {
        return qualityRankB - qualityRankA;
      }
      const speedValueB = b.speedValue ?? 0;
      const speedValueA = a.speedValue ?? 0;
      if (speedValueB !== speedValueA) {
        return speedValueB - speedValueA;
      }
      return (a.pingTime ?? Number.MAX_SAFE_INTEGER) -
        (b.pingTime ?? Number.MAX_SAFE_INTEGER);
    });

    const lookup: Record<string, SourceValuation> = {};
    items.forEach((item) => {
      lookup[item.key] = item;
    });

    return NextResponse.json({ items, lookup });
  } catch (error) {
    console.error('Failed to fetch source valuations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch source valuations' },
      { status: 500 }
    );
  }
}
