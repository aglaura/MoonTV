import { NextRequest, NextResponse } from 'next/server';

import { getSharedPasswords } from '@/lib/sharedPasswords';

type AuthCookiePayload = {
  password?: string;
  username?: string;
  signature?: string;
  timestamp?: number;
};

function decodePossiblyDoubleEncoded(value: string): string {
  try {
    let decoded = decodeURIComponent(value);
    if (decoded.includes('%')) {
      decoded = decodeURIComponent(decoded);
    }
    return decoded;
  } catch {
    return value;
  }
}

async function hmacHex(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  const raw = request.cookies.get('auth')?.value;
  if (!raw || raw === 'guest') return false;

  const decoded = decodePossiblyDoubleEncoded(raw);
  let payload: AuthCookiePayload | null = null;
  try {
    payload = JSON.parse(decoded) as AuthCookiePayload;
  } catch {
    return false;
  }

  const username = payload?.username?.trim();
  const signature = payload?.signature?.trim();
  if (!username || !signature) return false;

  const secrets = getSharedPasswords();
  if (!secrets.length) return false;

  const expectedSignatures = await Promise.all(
    secrets.map((secret) => hmacHex(username, secret))
  );
  const signatureLower = signature.toLowerCase();
  return expectedSignatures.some((sig) => sig === signatureLower);
}

export async function middleware(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  // Let static assets through (public files, etc.)
  if (pathname.includes('.') && !pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const publicPaths = new Set([
    '/login',
    '/register',
    '/api/login',
    '/api/login/select',
    '/api/logout',
    '/api/register',
    '/api/server-config',
    '/api/users',
  ]);

  if (publicPaths.has(pathname)) {
    return NextResponse.next();
  }

  const ok = await isAuthenticated(request);
  if (ok) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('redirect', `${pathname}${search || ''}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|robots.txt|sitemap.xml).*)',
  ],
};

