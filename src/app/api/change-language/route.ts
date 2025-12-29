import { getAuthInfoFromCookie } from '@/lib/auth';
import { getUserLanguage, setUserLanguage, type Locale } from '@/lib/userLanguage';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Get user from auth cookie
    const authInfo = getAuthInfoFromCookie(request);
    
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { locale } = await request.json() as { locale: string };

    if (!locale) {
      return NextResponse.json({ error: 'Locale is required' }, { status: 400 });
    }

    // Validate locale
    if (!['en', 'zh-Hans', 'zh-Hant'].includes(locale)) {
      return NextResponse.json({ error: 'Invalid locale' }, { status: 400 });
    }

    // Set user's language preference in Redis
    await setUserLanguage(authInfo.username, locale as Locale);

    return NextResponse.json({
      message: 'Language preference updated successfully'
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get user from auth cookie
    const authInfo = getAuthInfoFromCookie(request);
    
    if (!authInfo?.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user's language preference from Redis
    const locale = await getUserLanguage(authInfo.username);

    return NextResponse.json({ locale });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
