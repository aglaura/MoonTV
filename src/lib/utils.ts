/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import Hls from 'hls.js';

/**
 * 获取图片代理 URL 设置
 */
export function getImageProxyUrl(): string | null {
  if (typeof window === 'undefined') return null;

  const enableImageProxy = localStorage.getItem('enableImageProxy');
  if (enableImageProxy !== null) {
    if (!JSON.parse(enableImageProxy) as boolean) {
      return null;
    }
  }

  const localImageProxy = localStorage.getItem('imageProxyUrl');
  if (localImageProxy != null) {
    return localImageProxy.trim() ? localImageProxy.trim() : null;
  }

  const serverImageProxy = (window as any).RUNTIME_CONFIG?.IMAGE_PROXY;
  return serverImageProxy && serverImageProxy.trim()
    ? serverImageProxy.trim()
    : null;
}

/**
 * 处理图片 URL，如果设置了图片代理则使用代理
 */
export function processImageUrl(originalUrl: string): string {
  if (!originalUrl) return originalUrl;

  const proxyUrl = getImageProxyUrl();
  if (!proxyUrl) {
    // Default to built-in proxy to avoid hotlink blocks
    if (originalUrl.startsWith('/api/image-proxy')) return originalUrl;
    if (originalUrl.startsWith('http')) {
      return `/api/image-proxy?url=${encodeURIComponent(originalUrl)}`;
    }
    return originalUrl;
  }

  return `${proxyUrl}${encodeURIComponent(originalUrl)}`;
}

export function cleanHtmlTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/<[^>]+>/g, '\n') // 将 HTML 标签替换为换行
    .replace(/\n+/g, '\n') // 将多个连续换行合并为一个
    .replace(/[ \t]+/g, ' ') // 将多个连续空格和制表符合并为一个空格，但保留换行符
    .replace(/^\n+|\n+$/g, '') // 去掉首尾换行
    .replace(/&nbsp;/g, ' ') // 将 &nbsp; 替换为空格
    .trim(); // 去掉首尾空格
}

/**
 * 从m3u8地址获取视频质量等级和网络信息
 * @param m3u8Url m3u8播放列表的URL
 * @returns Promise<{quality: string, loadSpeed: string, pingTime: number}> 视频质量等级和网络信息
 */
export async function getVideoResolutionFromM3u8(m3u8Url: string): Promise<{
  quality: string; // 如720p、1080p等
  loadSpeed: string; // 自动转换为KB/s或MB/s
  pingTime: number; // 网络延迟（毫秒）
}> {
  const MAX_ATTEMPTS = 4;
  const TIMEOUT_MS = 1000;

  try {
    return await new Promise((resolve, reject) => {
      const pingStart = performance.now();
      let pingTime = 0;

      fetch(m3u8Url, { method: 'HEAD', mode: 'no-cors' })
        .then(() => {
          pingTime = performance.now() - pingStart;
        })
        .catch(() => {
          pingTime = performance.now() - pingStart;
        });

      let attempt = 0;

      const runAttempt = () => {
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'metadata';

        const hls = new Hls();

        let actualLoadSpeed = '未知';
        let hasSpeedCalculated = false;
        let hasMetadataLoaded = false;
        let fragmentStartTime = 0;

        const timeout = setTimeout(() => {
          handleFailure(new Error('Timeout loading video metadata'));
        }, TIMEOUT_MS);

        const cleanup = () => {
          clearTimeout(timeout);
          try {
            hls.destroy();
          } catch (error) {
            console.warn('Failed to destroy HLS instance:', error);
          }
          video.remove();
        };

        const handleSuccess = () => {
          cleanup();
          const width = video.videoWidth;
          if (width && width > 0) {
            const quality =
              width >= 3840
                ? '4K'
                : width >= 2560
                ? '2K'
                : width >= 1920
                ? '1080p'
                : width >= 1280
                ? '720p'
                : width >= 854
                ? '480p'
                : 'SD';

            resolve({
              quality,
              loadSpeed: actualLoadSpeed,
              pingTime: Math.round(pingTime),
            });
          } else {
            resolve({
              quality: '未知',
              loadSpeed: actualLoadSpeed,
              pingTime: Math.round(pingTime),
            });
          }
        };

        const handleFailure = (error: Error) => {
          cleanup();
          attempt += 1;
          if (attempt < MAX_ATTEMPTS) {
            runAttempt();
          } else {
            reject(error);
          }
        };

        const checkAndResolve = () => {
          if (
            hasMetadataLoaded &&
            (hasSpeedCalculated || actualLoadSpeed !== '未知')
          ) {
            handleSuccess();
          }
        };

        hls.on(Hls.Events.FRAG_LOADING, () => {
          fragmentStartTime = performance.now();
        });

        hls.on(Hls.Events.FRAG_LOADED, (event: any, data: any) => {
          if (
            fragmentStartTime > 0 &&
            data &&
            data.payload &&
            !hasSpeedCalculated
          ) {
            const loadTime = performance.now() - fragmentStartTime;
            const size = data.payload.byteLength || 0;

            if (loadTime > 0 && size > 0) {
              const speedKBps = size / 1024 / (loadTime / 1000);

              if (speedKBps >= 1024) {
                actualLoadSpeed = `${(speedKBps / 1024).toFixed(1)} MB/s`;
              } else {
                actualLoadSpeed = `${speedKBps.toFixed(1)} KB/s`;
              }
              hasSpeedCalculated = true;
              checkAndResolve();
            }
          }
        });

        hls.on(Hls.Events.ERROR, (event: any, data: any) => {
          console.error('HLS错误:', data);
          if (data.fatal) {
            handleFailure(new Error(`HLS播放失败: ${data.type}`));
          }
        });

        video.onloadedmetadata = () => {
          hasMetadataLoaded = true;
          checkAndResolve();
        };

        video.onerror = () => {
          handleFailure(new Error('Failed to load video metadata'));
        };

        hls.loadSource(m3u8Url);
        hls.attachMedia(video);
      };

      runAttempt();
    });
  } catch (error) {
    throw new Error(
      `Error getting video resolution: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

const QUALITY_ORDER = new Map<string, number>([
  ['4k', 6],
  ['2160p', 6],
  ['2k', 5],
  ['1440p', 5],
  ['1080p', 4],
  ['1080', 4],
  ['720p', 3],
  ['720', 3],
  ['480p', 2],
  ['480', 2],
  ['sd', 1],
]);

export function getQualityRank(label?: string | null): number {
  if (!label) return 0;
  const normalized = label.toLowerCase().trim();
  return QUALITY_ORDER.get(normalized) ?? 0;
}

export function parseSpeedToKBps(value?: string | null): number {
  if (!value) return 0;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '未知' || trimmed === '測量中...') return 0;
  const match = trimmed.match(/^([\d.]+)\s*(kb\/s|mb\/s)$/i);
  if (!match) return 0;
  const numeric = parseFloat(match[1]);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  const unit = match[2].toLowerCase();
  if (unit === 'mb/s') {
    return Math.round(numeric * 1024);
  }
  return Math.round(numeric);
}

const QUALITY_CANONICAL_LABELS: Array<{ rank: number; label: string }> = [
  { rank: 6, label: '4K' },
  { rank: 5, label: '2K' },
  { rank: 4, label: '1080p' },
  { rank: 3, label: '720p' },
  { rank: 2, label: '480p' },
  { rank: 1, label: 'SD' },
];

export function getQualityLabelFromRank(
  rank: number,
  fallback = '未知'
): string {
  if (!Number.isFinite(rank) || rank <= 0) return fallback;
  const matchEntry = QUALITY_CANONICAL_LABELS.find(
    (entry) => rank >= entry.rank
  );
  return matchEntry ? matchEntry.label : fallback;
}

export function formatSpeedFromKBps(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '未知';
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} MB/s`;
  }
  return `${value.toFixed(1)} KB/s`;
}
