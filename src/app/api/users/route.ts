/* eslint-disable no-console */

import { NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

export async function GET() {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  const ownerUser = process.env.USERNAME?.trim();

  // 始終至少返回站長帳號（若配置了 USERNAME）
  const fallbackOwner: Array<{ username: string; role: 'owner' }> = ownerUser
    ? [{ username: ownerUser, role: 'owner' }]
    : [];

  if (storageType === 'localstorage') {
    return NextResponse.json(
      { users: fallbackOwner },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  try {
    const config = await getConfig();
    const users: Array<{ username: string; role: 'user' | 'admin' | 'owner' }> =
      config.UserConfig.Users?.map((user) => ({
        username: user.username,
        role: (user.role as 'user' | 'admin' | 'owner') ?? 'user',
      })) ?? [];

    fallbackOwner.forEach((owner) => {
      if (!users.some((user) => user.username === owner.username)) {
        users.unshift(owner);
      }
    });

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
