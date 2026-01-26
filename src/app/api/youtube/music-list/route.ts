import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { YoutubeMusicVideo } from '@/lib/types';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const list = await db.getYoutubeMusicList(authInfo.username);
    return NextResponse.json({ list }, { status: 200 });
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
    const list = Array.isArray(body?.list) ? (body.list as YoutubeMusicVideo[]) : [];
    const sanitized = list
      .map((item) => ({
        id: String(item?.id || '').trim(),
        title: String(item?.title || '').trim(),
        artist: item?.artist ? String(item.artist).trim() : undefined,
      }))
      .filter((item) => item.id && item.title);
    await db.saveYoutubeMusicList(authInfo.username, sanitized);
    return NextResponse.json({ success: true }, { status: 200 });
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
