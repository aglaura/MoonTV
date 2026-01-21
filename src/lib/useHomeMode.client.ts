'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  detectDeviceInfo,
  setScreenModeOverride,
  type OsFamily,
  type ScreenMode,
  type ScreenModeOverride,
} from '@/lib/screenMode';

type UseHomeModeParams = {
  tt: (en: string, zhHans: string, zhHant: string) => string;
};

type UseHomeModeResult = {
  screenMode: ScreenMode;
  osFamily: OsFamily;
  isTV: boolean;
  isMobile: boolean;
  topBarModeLabel?: string;
  canToggleMode: boolean;
  handleToggleMode: () => void;
};

const computeResolutionTag = () => {
  if (typeof window === 'undefined') return '';
  const w = Math.max(Math.round(window.innerWidth), 1);
  const h = Math.max(Math.round(window.innerHeight), 1);
  const dpr = Math.max(window.devicePixelRatio || 1, 1);
  const physicalW = Math.round(w * dpr);
  const physicalH = Math.round(h * dpr);
  const density = dpr > 1 ? ` @${Number(dpr.toFixed(2))}x` : '';
  return `${physicalW}x${physicalH}${density}`;
};

export const useHomeMode = ({ tt }: UseHomeModeParams): UseHomeModeResult => {
  const [screenMode, setScreenMode] = useState<ScreenMode>(() =>
    typeof window === 'undefined' ? 'tablet' : detectDeviceInfo().screenMode
  );
  const [osFamily, setOsFamily] = useState<OsFamily>(() =>
    typeof window === 'undefined' ? 'other' : detectDeviceInfo().osFamily
  );
  const [resolutionTag, setResolutionTag] = useState(() =>
    typeof window === 'undefined' ? '' : computeResolutionTag()
  );

  const osLabel = useMemo(() => {
    switch (osFamily) {
      case 'windows':
        return 'Windows';
      case 'ios':
        return 'iOS';
      case 'macos':
        return 'macOS';
      case 'android':
        return 'Android';
      case 'linux':
        return 'Linux';
      default:
        return 'Other';
    }
  }, [osFamily]);

  const topBarModeLabel = useMemo(() => {
    const resSuffix = resolutionTag ? ` · ${resolutionTag}` : '';
    const osSuffix = osLabel ? ` · ${osLabel}` : '';
    if (screenMode === 'tv') {
      return `${tt('TV mode', '电视模式', '電視模式')}${osSuffix}${resSuffix}`;
    }
    if (screenMode === 'tablet') {
      return `${tt('Tablet mode', '平板模式', '平板模式')}${osSuffix}${resSuffix}`;
    }
    return undefined;
  }, [osLabel, resolutionTag, screenMode, tt]);

  const canToggleMode = useMemo(
    () => osFamily !== 'windows' && osFamily !== 'ios' && osFamily !== 'macos',
    [osFamily]
  );

  const handleToggleMode = useCallback(() => {
    if (screenMode === 'mobile') return;
    if (!canToggleMode) return;
    const nextMode: ScreenModeOverride = screenMode === 'tv' ? 'tablet' : 'tv';
    setScreenModeOverride(nextMode);
    const nextInfo = detectDeviceInfo();
    setScreenMode(nextInfo.screenMode);
    setOsFamily(nextInfo.osFamily);
    setResolutionTag(computeResolutionTag());
  }, [canToggleMode, screenMode]);

  useEffect(() => {
    const handleResize = () => {
      if (typeof window === 'undefined') return;
      const nextInfo = detectDeviceInfo();
      setScreenMode(nextInfo.screenMode);
      setOsFamily(nextInfo.osFamily);
      setResolutionTag(computeResolutionTag());
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return {
    screenMode,
    osFamily,
    isTV: screenMode === 'tv',
    isMobile: screenMode === 'mobile',
    topBarModeLabel,
    canToggleMode,
    handleToggleMode,
  };
};
