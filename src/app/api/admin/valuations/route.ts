import { NextResponse } from 'next/server';

import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const valuations = await db.getAllSourceValuations();
    return NextResponse.json({ items: valuations });
  } catch (error) {
    console.error('Failed to load source valuations:', error);
    return NextResponse.json(
      { error: 'Failed to load source valuations' },
      { status: 500 }
    );
  }
}
