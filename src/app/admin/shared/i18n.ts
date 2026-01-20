/* eslint-disable @typescript-eslint/no-explicit-any */

type UiLocale = 'en' | 'zh-Hans' | 'zh-Hant';

function resolveUiLocale(): UiLocale {
  try {
    const saved =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('userLocale')
        : null;
    if (saved === 'en' || saved === 'zh-Hans' || saved === 'zh-Hant') {
      return saved;
    }
  } catch {
    // ignore
  }

  const nav =
    typeof navigator !== 'undefined' ? (navigator.language || '') : '';
  const lower = nav.toLowerCase();
  if (lower.startsWith('zh-cn') || lower.startsWith('zh-hans')) return 'zh-Hans';
  if (
    lower.startsWith('zh-tw') ||
    lower.startsWith('zh-hant') ||
    lower.startsWith('zh-hk')
  ) {
    return 'zh-Hant';
  }
  return 'en';
}

export const uiLocale = resolveUiLocale();

export function tt(en: string, zhHans: string, zhHant: string): string {
  if (uiLocale === 'zh-Hans') return zhHans;
  if (uiLocale === 'zh-Hant') return zhHant;
  return en;
}