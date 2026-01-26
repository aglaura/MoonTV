import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { normalizeYoutubeMusicState } from '@/lib/youtubeMusicList';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const state = await db.getYoutubeMusicList(authInfo.username);
    return NextResponse.json(
      { state, list: state.lists[state.activeIndex] || [] },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to load music list' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const body = await request.json();
    const state = normalizeYoutubeMusicState(
      body?.state ?? body?.lists ?? body?.list ?? body
    );
    await db.saveYoutubeMusicList(authInfo.username, state);
    return NextResponse.json({ success: true, state }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to save music list' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await db.deleteYoutubeMusicList(authInfo.username);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to delete music list' },
      { status: 500 }
    );
  }
}
