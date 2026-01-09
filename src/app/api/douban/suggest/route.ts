import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SuggestItem = {
  id: string;
  title: string;
  sub_title?: string;
  year?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim();

  if (!query) {
    return NextResponse.json({ error: 'Missing query' }, { status: 400 });
  }

  const target = `https://movie.douban.com/j/subject_suggest?q=${encodeURIComponent(
    query
  )}`;

  try {
    const res = await fetch(target, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        Accept: 'application/json,text/plain,*/*',
        Referer: 'https://movie.douban.com/',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Douban suggest failed: ${res.status}` },
        { status: res.status }
      );
    }

    const data = (await res.json()) as SuggestItem[];
    const items = Array.isArray(data)
      ? data
          .filter((item) => item?.title)
          .map((item) => ({
            id: item.id,
            title: item.title,
            sub_title: item.sub_title ?? '',
            year: item.year ?? '',
          }))
      : [];

    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: 'Douban suggest request failed', details: String(error) },
      { status: 500 }
    );
  }
}
