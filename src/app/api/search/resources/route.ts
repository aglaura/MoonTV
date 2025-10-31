import { NextResponse } from 'next/server';

import { getAvailableApiSites, getCacheTime } from '@/lib/config';
import { convertApiSiteToTraditional } from '@/lib/responseTrad';

export const runtime = 'nodejs';

// OrionTV 兼容接口
export async function GET() {
  try {
    const apiSites = await getAvailableApiSites();
    const cacheTime = await getCacheTime();

    // Convert any Chinese text to Traditional Chinese for OrionTV clients
    const transformed = apiSites.map((s) => convertApiSiteToTraditional(s));

    return NextResponse.json(transformed, {
      headers: {
        'Cache-Control': `public, max-age=${cacheTime}`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: '获取资源失败' }, { status: 500 });
  }
}
