export const getQualityScoreFromLabel = (
  quality?: string,
  fallbackRank?: number
): number => {
  const normalized = (quality || '').toLowerCase();
  if (normalized.includes('4k') || normalized.includes('2160')) return 100;
  if (normalized.includes('2k') || normalized.includes('1440')) return 85;
  if (normalized.includes('1080')) return 75;
  if (normalized.includes('720')) return 60;
  if (normalized.includes('480')) return 40;
  if (normalized.includes('sd')) return 20;

  switch (fallbackRank) {
    case 4:
      return 100;
    case 3:
      return 85;
    case 2:
      return 75;
    case 1:
      return 60;
    default:
      return 0;
  }
};

export const getQualityBadgeClasses = (quality?: string): string => {
  const normalized = (quality || '').toLowerCase();
  if (!normalized || normalized === '—' || normalized === 'na') {
    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
  if (normalized.includes('4k') || normalized.includes('2160')) {
    return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-200';
  }
  if (normalized.includes('2k') || normalized.includes('1440')) {
    return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200';
  }
  if (normalized.includes('1080')) {
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200';
  }
  if (normalized.includes('720')) {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200';
  }
  if (normalized.includes('480') || normalized.includes('sd')) {
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200';
  }
  if (normalized.includes('unavailable') || normalized.includes('error')) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200';
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
};

export const toDisplayScore = (score: number | undefined): string => {
  if (!Number.isFinite(score) || score === undefined) {
    return '—';
  }
  if (Math.abs(score - Math.round(score)) < 0.05) {
    return Math.round(score).toString();
  }
  return score.toFixed(1);
};

export const calculateProviderScore = (item: any) => {
  const qualityScore = getQualityScoreFromLabel(
    item.quality,
    item.qualityRank
  );

  const speedScore = item.maxSpeed > 0 && (item.speedValue ?? 0) > 0
    ? Math.min(100, Math.max(0, ((item.speedValue ?? 0) / item.maxSpeed) * 100))
    : 0;

  let pingScore = 0;
  if (
    typeof item.pingTime === 'number' &&
    item.pingTime > 0 &&
    Number.isFinite(item.minPing) &&
    Number.isFinite(item.maxPing) &&
    item.maxPing - item.minPing !== 0
  ) {
    pingScore = Math.min(
      100,
      Math.max(
        0,
        ((item.maxPing - item.pingTime) / (item.maxPing - item.minPing)) * 100
      )
    );
  } else if (
    typeof item.pingTime === 'number' &&
    item.pingTime > 0 &&
    Number.isFinite(item.minPing) &&
    Number.isFinite(item.maxPing) &&
    item.maxPing === item.minPing
  ) {
    pingScore = 100;
  }

  // Provider valuation weights: prioritize quality, de-emphasize speed.
  const QUALITY_WEIGHT = 0.6;
  const SPEED_WEIGHT = 0.15;
  const PING_WEIGHT = 0.25;
  const score =
    qualityScore * QUALITY_WEIGHT +
    speedScore * SPEED_WEIGHT +
    pingScore * PING_WEIGHT;

  return Number.isFinite(score) ? Number(score.toFixed(1)) : undefined;
};