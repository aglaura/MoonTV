/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';

import { ensureAdminUser, generateAuthCookie } from './utils';

export const runtime = 'nodejs';
const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'd1'
    | undefined) || 'localstorage';

export async function POST(req: NextRequest) {
  try {
    // 本地 / localStorage 模式——仅校验固定密码
    if (STORAGE_TYPE === 'localstorage') {
      const envPassword = process.env.PASSWORD;

      // 未配置 PASSWORD 时直接放行
      if (!envPassword) {
        const response = NextResponse.json({ ok: true });

        // 清除可能存在的认证cookie
        response.cookies.set('auth', '', {
          path: '/',
          expires: new Date(0),
          sameSite: 'lax', // 改为 lax 以支持 PWA
          httpOnly: false, // PWA 需要客户端可访问
          secure: false, // 根据协议自动设置
        });

        return response;
      }

      const { password } = await req.json();
      if (typeof password !== 'string') {
        return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
      }

      if (password !== envPassword) {
        return NextResponse.json(
          { ok: false, error: '密码错误' },
          { status: 401 }
        );
      }

      // 验证成功，设置认证cookie
      const response = NextResponse.json({ ok: true });
      const cookieValue = await generateAuthCookie(undefined, password, true); // localstorage 模式包含 password
      const expires = new Date();
      expires.setDate(expires.getDate() + 7); // 7天过期

      response.cookies.set('auth', cookieValue, {
        path: '/',
        expires,
        sameSite: 'lax', // 改为 lax 以支持 PWA
        httpOnly: false, // PWA 需要客户端可访问
        secure: false, // 根据协议自动设置
      });

      return response;
    }

    // 数据库 / redis 模式——共享密码，登录后再选择用户
    const { username, password } = (await req.json()) as {
      username?: string;
      password?: string;
    };

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: '密码不能为空' }, { status: 400 });
    }

    const sharedPassword = process.env.PASSWORD;
    if (!sharedPassword) {
      return NextResponse.json(
        { error: '服務器未設定 PASSWORD 環境變數' },
        { status: 500 }
      );
    }

    if (password !== sharedPassword) {
      return NextResponse.json(
        { error: '用户名或密码错误' },
        { status: 401 }
      );
    }

    if (!username || typeof username !== 'string') {
      const response = NextResponse.json({ ok: true, requiresSelection: true });
      const cookieValue = await generateAuthCookie(undefined, password, true);
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
    }

    const config = await getConfig();
    const targetUser = config.UserConfig.Users.find(
      (u) => u.username === username
    );
    if (targetUser && targetUser.banned) {
      return NextResponse.json({ error: '用户被封禁' }, { status: 401 });
    }

    try {
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
    } catch (err) {
      console.error('数据库验证失败', err);
      return NextResponse.json({ error: '数据库错误' }, { status: 500 });
    }
  } catch (error) {
    console.error('登录接口异常', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
