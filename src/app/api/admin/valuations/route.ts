import { NextResponse } from 'next/server';

import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const valuations = await db.getAllSourceValuations();
    const dedup = new Map<string, typeof valuations[number]>();
    valuations.forEach((entry) => {
      const key = (entry.source || entry.key || '').trim();
      if (!key) return;
      dedup.set(key, {
        ...entry,
        key,
      });
    });
    return NextResponse.json({ items: Array.from(dedup.values()) });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load provider valuations' },
      { status: 500 }
    );
  }
}
