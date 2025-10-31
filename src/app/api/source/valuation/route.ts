import { NextResponse } from 'next/server';

import { db } from '@/lib/db';
import { SourceValuation } from '@/lib/types';

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
          typeof item?.source === 'string' &&
          typeof item?.id === 'string'
      )
      .map((item) => ({
        key: item.key,
        source: item.source,
        id: item.id,
        quality: item.quality ?? '',
        loadSpeed: item.loadSpeed ?? '',
        pingTime: Number.isFinite(item.pingTime) ? item.pingTime : 0,
        updated_at: item.updated_at ?? Date.now(),
      }));

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
    return NextResponse.json(valuations);
  } catch (error) {
    console.error('Failed to fetch source valuations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch source valuations' },
      { status: 500 }
    );
  }
}
