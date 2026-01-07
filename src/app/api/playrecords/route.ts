/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { db } from '@/lib/db';
import { PlayRecord } from '@/lib/types';

export const runtime = 'nodejs';
const normalizeTitle = (title?: string): string =>
  (title || '').trim().toLowerCase();

const normalizeImdbId = (value?: string | null): string | null => {
  if (!value) return null;
  const m = value.match(/(tt\d{5,}|imdbt\d+)/i);
  return m ? m[0].toLowerCase() : null;
};

const getVideoIdentities = (record: Partial<PlayRecord>): string[] => {
  const identities: string[] = [];
  const doubanId =
    typeof record.douban_id === 'number' && Number.isFinite(record.douban_id)
      ? record.douban_id
      : undefined;
  if (doubanId) identities.push(`douban:${doubanId}`);

  const imdbId = normalizeImdbId(record.imdbId);
  if (imdbId) identities.push(`imdb:${imdbId}`);

  const titleNorm = normalizeTitle(
    (record.search_title || record.title || '').toString(),
  );
  const year = (record.year || '').toString().trim();
  const cover = (record.cover || '').toString().trim();

  if (titleNorm) {
    if (year) identities.push(`titleyear:${titleNorm}:${year}`);
    if (cover) identities.push(`titlecover:${titleNorm}:${cover}`);
    if (!year && !cover && titleNorm.length >= 6) {
      identities.push(`title:${titleNorm}`);
    }
  }

  return Array.from(new Set(identities));
};

const overlapsAnyIdentity = (a: Partial<PlayRecord>, b: Partial<PlayRecord>) => {
  const aIds = getVideoIdentities(a);
  if (aIds.length === 0) return false;
  const bIds = getVideoIdentities(b);
  if (bIds.length === 0) return false;
  return bIds.some((id) => aIds.includes(id));
};

export async function GET(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const username = authInfo.username as string;

    const records = await db.getAllPlayRecords(authInfo.username);

    // Deduplicate by stable video identity (douban/imdb preferred), keeping newest.
    const entries = Object.entries(records || {}).sort(([, a], [, b]) => {
      const at = typeof a?.save_time === 'number' ? a.save_time : 0;
      const bt = typeof b?.save_time === 'number' ? b.save_time : 0;
      return bt - at;
    });

    const seen = new Set<string>();
    const deduped: Record<string, PlayRecord> = {};
    const toDelete: string[] = [];

    for (const [key, record] of entries) {
      const ids = getVideoIdentities(record);
      if (ids.length && ids.some((id) => seen.has(id))) {
        toDelete.push(key);
        continue;
      }
      deduped[key] = record;
      ids.forEach((id) => seen.add(id));
    }

    if (toDelete.length) {
      await Promise.all(
        toDelete.map(async (dupKey) => {
          const [dupSource, dupId] = dupKey.split('+');
          if (dupSource && dupId) {
            try {
              await db.deletePlayRecord(username, dupSource, dupId);
            } catch (deleteErr) {
              console.warn(`删除重复的播放记录失败: ${dupKey}`, deleteErr);
            }
          }
        }),
      );
    }

    return NextResponse.json(deduped, { status: 200 });
  } catch (err) {
    console.error('获取播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const username = authInfo.username as string;

    const body = await request.json();
    const { key, record }: { key: string; record: PlayRecord } = body;

    if (!key || !record) {
      return NextResponse.json(
        { error: 'Missing key or record' },
        { status: 400 }
      );
    }

    // 验证播放记录数据
    if (!record.title || !record.source_name || record.index < 1) {
      return NextResponse.json(
        { error: 'Invalid record data' },
        { status: 400 }
      );
    }

    // 从key中解析source和id
    const [source, id] = key.split('+');
    if (!source || !id) {
      return NextResponse.json(
        { error: 'Invalid key format' },
        { status: 400 }
      );
    }

    const finalRecord = {
      ...record,
      save_time: record.save_time ?? Date.now(),
    } as PlayRecord;

    // Remove existing records with the same identity (keep only one per video)
    const existingRecords = await db.getAllPlayRecords(username);
    const identities = getVideoIdentities(finalRecord);
    const duplicates = Object.entries(existingRecords).filter(
      ([existingKey, existingRecord]) =>
        existingKey !== key &&
        (identities.length
          ? overlapsAnyIdentity(existingRecord as PlayRecord, finalRecord)
          : normalizeTitle((existingRecord as PlayRecord | undefined)?.title) ===
            normalizeTitle(finalRecord.title)),
    );

    await Promise.all(
      duplicates.map(async ([dupKey]) => {
        const [dupSource, dupId] = dupKey.split('+');
        if (dupSource && dupId) {
          try {
            await db.deletePlayRecord(username, dupSource, dupId);
          } catch (deleteErr) {
            console.warn(
              `删除重复的播放记录失败: ${dupKey}`,
              deleteErr as unknown
            );
          }
        }
      })
    );

    await db.savePlayRecord(username, source, id, finalRecord);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('保存播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // 从 cookie 获取用户信息
    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const username = authInfo.username;
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    if (key) {
      // 如果提供了 key，删除单条播放记录
      const [source, id] = key.split('+');
      if (!source || !id) {
        return NextResponse.json(
          { error: 'Invalid key format' },
          { status: 400 }
        );
      }

      await db.deletePlayRecord(username, source, id);
    } else {
      // 未提供 key，则清空全部播放记录
      // 目前 DbManager 没有对应方法，这里直接遍历删除
      const all = await db.getAllPlayRecords(username);
      await Promise.all(
        Object.keys(all).map(async (k) => {
          const [s, i] = k.split('+');
          if (s && i) await db.deletePlayRecord(username, s, i);
        })
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error('删除播放记录失败', err);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
