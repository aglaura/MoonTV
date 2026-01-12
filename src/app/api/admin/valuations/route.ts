import { NextResponse } from 'next/server';

import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const valuations = await db.getAllSourceValuations();
    const dedup = new Map<string, typeof valuations[number]>();

    valuations.forEach((entry) => {
      const key = (entry.key || entry.source || '').trim();
      if (!key) return;
      const existing = dedup.get(key);
      if (!existing || (entry.updated_at || 0) > (existing.updated_at || 0)) {
        dedup.set(key, {
          ...entry,
          key,
        });
      }
    });

    const items = Array.from(dedup.values()).sort(
      (a, b) => (b.updated_at || 0) - (a.updated_at || 0)
    );

    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to load provider valuations' },
      { status: 500 }
    );
  }
}
