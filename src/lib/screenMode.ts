import { useEffect, useState } from 'react';

export type ScreenMode = 'mobile' | 'tablet' | 'desktop' | 'tv';

export interface DeviceInfo {
  screenMode: ScreenMode;
  isTV: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  browser: 'safari' | 'chrome' | 'firefox' | 'edge' | 'other';
}

function detectBrowser(ua: string): DeviceInfo['browser'] {
  const lower = ua.toLowerCase();
  if (/edg\//.test(lower)) return 'edge';
  if (/firefox\//.test(lower)) return 'firefox';
  if (/chrome\//.test(lower) && !/edg\//.test(lower)) return 'chrome';
  if (/safari\//.test(lower) && !/chrome\//.test(lower)) return 'safari';
  return 'other';
}

function detectTV(ua: string): boolean {
  return /SmartTV|Tizen|Web0S|NetCast|HbbTV|Viera|AFT|CrKey|AppleTV|Android TV|GoogleTV/i.test(
    ua
  );
}

export function detectDeviceInfo(): DeviceInfo {
  if (typeof window === 'undefined') {
    return {
      screenMode: 'desktop',
      isTV: false,
      isIOS: false,
      isAndroid: false,
      browser: 'other',
    };
  }

  const w = window.innerWidth;
  const ua = navigator.userAgent || '';
  const isTV = detectTV(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const browser = detectBrowser(ua);

  let screenMode: ScreenMode;
  if (isTV && w >= 1200) screenMode = 'tv';
  else if (w < 768) screenMode = 'mobile';
  else if (w < 1200) screenMode = 'tablet';
  else screenMode = 'desktop';

  return { screenMode, isTV, isIOS, isAndroid, browser };
}

export function useDeviceInfo(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>(() => detectDeviceInfo());

  useEffect(() => {
    const handler = () => {
      setInfo(detectDeviceInfo());
    };
    window.addEventListener('resize', handler);
    handler();
    return () => window.removeEventListener('resize', handler);
  }, []);

  return info;
}

