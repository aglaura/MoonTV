import { NextRequest, NextResponse } from 'next/server';

import { ensureAdminUser, generateAuthCookie } from '../route';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const { username } = (await req.json()) as { username?: string };

    if (!username || typeof username !== 'string') {
      return NextResponse.json(
        { error: '缺少使用者名稱' },
        { status: 400 }
      );
    }

    const sharedPassword = process.env.PASSWORD;
    if (!sharedPassword) {
      return NextResponse.json(
        { error: '服務器未設定 PASSWORD 環境變數' },
        { status: 500 }
      );
    }

    const authInfo = getAuthInfoFromCookie(req);
    if (!authInfo?.password || authInfo.password !== sharedPassword) {
      return NextResponse.json({ error: '未授權' }, { status: 401 });
    }

    const config = await getConfig();
    const targetUser = config.UserConfig.Users.find(
      (u) => u.username === username
    );

    if (targetUser && targetUser.banned) {
      return NextResponse.json({ error: '用户被封禁' }, { status: 401 });
    }

    await ensureAdminUser(username, config);

    const response = NextResponse.json({ ok: true });
    const cookieValue = await generateAuthCookie(
      username,
      sharedPassword,
      false
    );
    const expires = new Date();
    expires.setDate(expires.getDate() + 7);

    response.cookies.set('auth', cookieValue, {
      path: '/',
      expires,
      sameSite: 'lax',
      httpOnly: false,
      secure: false,
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: '選擇使用者失敗',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
