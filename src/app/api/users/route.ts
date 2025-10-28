/* eslint-disable no-console */

import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

export async function GET() {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';

  if (storageType === 'localstorage') {
    return NextResponse.json(
      { users: [] },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  try {
    const config = await getConfig();
    const users =
      config.UserConfig.Users?.map((user) => ({
        username: user.username,
        role: user.role,
      })) ?? [];

    return NextResponse.json(
      { users },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('获取用户列表失败:', error);
    return NextResponse.json(
      {
        users: [],
        error: 'Failed to load users',
      },
      { status: 500 }
    );
  }
}
