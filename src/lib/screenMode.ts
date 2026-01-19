import { useEffect, useState } from 'react';

export type ScreenMode = 'mobile' | 'tablet' | 'desktop' | 'tv' | 'pc';

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

function getAndroidMajorVersion(ua: string): number | null {
  const match = ua.match(/Android\s+(\d+)(?:[._]\d+)?/i);
  if (!match) return null;
  const major = Number.parseInt(match[1], 10);
  return Number.isNaN(major) ? null : major;
}

type UAData = {
  deviceType?: string;
  platform?: string;
  uaList?: Array<{ ua: string }>;
  brands?: Array<{ brand: string }>;
  mobile?: boolean;
};

function detectTV(ua: string, uaData?: UAData): boolean {
  const uaDataDeviceType = uaData?.deviceType?.toLowerCase?.() || '';
  const uaDataPlatform = uaData?.platform?.toLowerCase?.() || '';
  const uaListMatches =
    uaData?.uaList?.some((item) => /tv|crkey|aft/i.test(item.ua)) ?? false;
  const uaDataBrands =
    uaData?.brands?.some((item) => /crkey|aft/i.test(item.brand)) ?? false;
  if (
    uaDataDeviceType === 'tv' ||
    uaDataPlatform.includes('tv') ||
    uaListMatches ||
    uaDataBrands
  ) {
    return true;
  }

  const androidMajor = getAndroidMajorVersion(ua);
  const androidTvMarkers =
    /Android TV|AndroidTV|GoogleTV|Google TV|Leanback|AFT|CrKey/i;
  const androidTvDevices = /BRAVIA|SHIELD|MiTV|MiBox|MIBOX|TV\s?Box/i;
  if (
    androidMajor !== null &&
    (androidTvMarkers.test(ua) || androidTvDevices.test(ua))
  ) {
    return true;
  }

  return /SmartTV|Tizen|Web0S|NetCast|HbbTV|Viera|AFT|CrKey|AppleTV|Android TV|AndroidTV|GoogleTV|Google TV|Leanback/i.test(
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
  const h = window.innerHeight;
  const ua = navigator.userAgent || '';
  const nav = navigator as Navigator & {
    userAgentData?: UAData;
    maxTouchPoints?: number;
  };
  const uaData: UAData | undefined = nav.userAgentData;
  const hasTouch = typeof nav.maxTouchPoints === 'number' && nav.maxTouchPoints > 0;
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isAndroid = /Android/i.test(ua);
  const isWindows = /windows/i.test(ua);
  const isMac = /macintosh|mac os x/i.test(ua);
  const isChromebook = /CrOS/i.test(ua);
  const isLinuxDesktop =
    !/android|windows|iphone|ipad|ipod|macintosh|mac os x|cros/i.test(ua) &&
    /linux/i.test(ua);
  const isOtherPlatform =
    !isAndroid && !isIOS && !isWindows && !isMac;
  let isTV = false;
  if (isWindows || isIOS || isMac) {
    isTV = false;
  } else if (w >= 3600) {
    isTV = true;
  } else {
    isTV =
      detectTV(ua, uaData) ||
      // Treat Linux desktop browsers as TV mode (kiosk/HTPC cases).
      isLinuxDesktop ||
      // Anything not Android/Windows/iOS/macOS → assume TV (kiosk/embedded).
      isOtherPlatform ||
      // Android + not mobile + non-Chromebook = likely TV/box.
      (isAndroid && uaData?.mobile === false && !isChromebook) ||
      // Fallback heuristic: large Android screens without touch are likely TVs.
      (isAndroid && Math.max(w, h) >= 1280 && !hasTouch);
  }
  const browser = detectBrowser(ua);

  const smallestWidth = Math.min(w, h);
  let screenMode: ScreenMode;
  if (isTV) screenMode = 'tv';
  else if (isWindows) screenMode = 'pc';
  else if (smallestWidth < 600) screenMode = 'mobile';
  else if (smallestWidth < 1200) screenMode = 'tablet';
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
