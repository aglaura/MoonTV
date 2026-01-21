'use client';

import { useEffect, useMemo, useState } from 'react';

import type { TvRegion, UiLocale } from '@/lib/home.types';

type UseHomeRegionsParams = {
  tt: (en: string, zhHans: string, zhHant: string) => string;
  uiLocale: UiLocale;
};

export const useHomeRegions = ({ tt, uiLocale }: UseHomeRegionsParams) => {
  const [regionalTab, setRegionalTab] = useState<TvRegion>(() => {
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('homeRegionTab');
      if (saved === 'cn' || saved === 'kr' || saved === 'jp' || saved === 'en') {
        return saved;
      }
    }
    return uiLocale === 'en' ? 'en' : 'cn';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('homeRegionTab', regionalTab);
  }, [regionalTab]);

  const regionOptions = useMemo(
    () => [
      {
        key: 'cn' as const,
        label: tt('Chinese TV', '华语剧', '華語劇'),
        href: '/douban?type=tv&region=cn',
      },
      {
        key: 'kr' as const,
        label: tt('Korean TV', '韩剧', '韓劇'),
        href: '/douban?type=tv&region=kr',
      },
      {
        key: 'jp' as const,
        label: tt('Japanese TV', '日剧', '日劇'),
        href: '/douban?type=tv&region=jp',
      },
      {
        key: 'en' as const,
        label: tt('English TV', '欧美', '歐美'),
        href: '/douban?type=tv&region=us',
      },
    ],
    [tt]
  );

  const activeRegion =
    regionOptions.find((option) => option.key === regionalTab) ||
    regionOptions[0];

  return { regionalTab, setRegionalTab, regionOptions, activeRegion };
};
