import { useEffect, useState } from 'react';

export type ScreenMode = 'mobile' | 'tablet' | 'tv';
export type OsFamily = 'windows' | 'ios' | 'macos' | 'android' | 'linux' | 'other';
export type ScreenModeOverride = 'tv' | 'tablet';

export interface DeviceInfo {
  screenMode: ScreenMode;
  isTV: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  browser: 'safari' | 'chrome' | 'firefox' | 'edge' | 'other';
  osFamily: OsFamily;
}

const SCREEN_MODE_OVERRIDE_KEY = 'moontv_screen_mode_override';

export function getScreenModeOverride(): ScreenModeOverride | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(SCREEN_MODE_OVERRIDE_KEY);
  return raw === 'tv' || raw === 'tablet' ? raw : null;
}

export function setScreenModeOverride(value: ScreenModeOverride | null): void {
  if (typeof window === 'undefined') return;
  if (value) {
    window.localStorage.setItem(SCREEN_MODE_OVERRIDE_KEY, value);
  } else {
    window.localStorage.removeItem(SCREEN_MODE_OVERRIDE_KEY);
  }
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
      screenMode: 'tablet',
      isTV: false,
      isIOS: false,
      isAndroid: false,
      browser: 'other',
      osFamily: 'other',
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
  const osFamily: OsFamily = isIOS
    ? 'ios'
    : isAndroid
    ? 'android'
    : isWindows
    ? 'windows'
    : isMac
    ? 'macos'
    : isLinuxDesktop
    ? 'linux'
    : 'other';
  const smallestWidth = Math.min(w, h);
  const isMobileLayout = smallestWidth < 600;
  const allowTv = !isWindows && !isIOS && !isMac;
  const requestedOverride = getScreenModeOverride();
  const override =
    requestedOverride === 'tv' && !allowTv ? null : requestedOverride;
  let isTV = false;
  if (!isMobileLayout) {
    if (w >= 3000) {
      isTV = true;
    } else if (override === 'tv') {
      isTV = true;
    } else if (override === 'tablet') {
      isTV = false;
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
  }
  const browser = detectBrowser(ua);

  let screenMode: ScreenMode;
  if (isMobileLayout) screenMode = 'mobile';
  else if (w >= 3000) screenMode = 'tv';
  else if (override === 'tv') screenMode = 'tv';
  else if (override === 'tablet') screenMode = 'tablet';
  else if (isTV) screenMode = 'tv';
  else screenMode = 'tablet';

  return { screenMode, isTV, isIOS, isAndroid, browser, osFamily };
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
