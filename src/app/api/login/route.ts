/* eslint-disable no-console,@typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';

import type { AdminConfig } from '@/lib/admin.types';
import { getConfig } from '@/lib/config';
import { db, getStorage } from '@/lib/db';

export async function ensureAdminUser(
  username: string,
  config: AdminConfig
): Promise<void> {
  if (
    !username ||
    username === process.env.USERNAME ||
    (process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage') === 'localstorage'
  ) {
    return;
  }

  let changed = false;
  let user = config.UserConfig.Users.find((u) => u.username === username);

  if (!user) {
    user = {
      username,
      role: 'admin',
    };
    config.UserConfig.Users.push(user);
    changed = true;
  } else if (user.role !== 'owner' && user.role !== 'admin') {
    user.role = 'admin';
    changed = true;
  }

  if (changed) {
    const storage = getStorage();
    if (storage && typeof (storage as any).setAdminConfig === 'function') {
      await (storage as any).setAdminConfig(config);
    }
  }
}

export const runtime = 'nodejs';

// 读取存储类型环境变量，默认 localstorage
const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'd1'
    | undefined) || 'localstorage';

// 生成签名
async function generateSignature(
  data: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  // 导入密钥
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // 生成签名
  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  // 转换为十六进制字符串
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// 生成认证Cookie（带签名）
export async function generateAuthCookie(
  username?: string,
  password?: string,
  includePassword = false
): Promise<string> {
  const authData: any = {};

  // 只在需要时包含 password
  if (includePassword && password) {
    authData.password = password;
  }

  if (username && process.env.PASSWORD) {
    authData.username = username;
    // 使用密码作为密钥对用户名进行签名
    const signature = await generateSignature(username, process.env.PASSWORD);
    authData.signature = signature;
    authData.timestamp = Date.now(); // 添加时间戳防重放攻击
  }

  return encodeURIComponent(JSON.stringify(authData));
}

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
