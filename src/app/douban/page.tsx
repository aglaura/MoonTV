import { DoubanItem } from '@/lib/types';

import DoubanPageClient from './page.client';

export const revalidate = 600;
export const dynamic = 'force-static';

type SearchParams = {
  [key: string]: string | string[] | undefined;
};

function getBaseUrl() {
  if (typeof process !== 'undefined') {
    const envUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
    if (envUrl) return envUrl;
  }
  return 'http://localhost:3000';
}

function buildInitialParams(type: string) {
  if (type === 'movie') {
    return { kind: 'movie', category: '热门', type: '全部' };
  }
  if (type === 'tv') {
    return { kind: 'tv', category: 'tv', type: 'tv' };
  }
  if (type === 'show') {
    return { kind: 'tv', category: 'show', type: 'show' };
  }
  return null;
}

async function fetchInitialList(params: {
  kind: 'tv' | 'movie';
  category: string;
  type: string;
}): Promise<DoubanItem[] | null> {
  const qs = new URLSearchParams({
    kind: params.kind,
    category: params.category,
    type: params.type,
    limit: '25',
    start: '0',
  });

  const base = getBaseUrl();
  try {
    const res = await fetch(`${base}/api/douban/categories?${qs.toString()}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.code !== 200 || !Array.isArray(data.list)) return null;
    return data.list;
  } catch (err) {
    return null;
  }
}

export default async function DoubanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const type = typeof searchParams.type === 'string' ? searchParams.type : 'movie';
  const initialParams = buildInitialParams(type);

  const initialData =
    initialParams &&
    (await fetchInitialList(
      initialParams as { kind: 'tv' | 'movie'; category: string; type: string }
    ));

  return (
    <DoubanPageClient
      initialData={initialData ?? []}
      initialSnapshot={
        initialParams
          ? {
              type,
              primarySelection:
                type === 'movie'
                  ? '热门'
                  : type === 'tv' || type === 'show'
                  ? '最近热门'
                  : '',
              secondarySelection:
                type === 'movie'
                  ? '全部'
                  : type === 'tv'
                  ? 'tv'
                  : type === 'show'
                  ? 'show'
                  : '',
            }
          : undefined
      }
    />
  );
}
