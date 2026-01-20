/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { tt } from '../shared/adminFetch';
import { parseSpeedToKBps } from '@/lib/utils';
import { DataSource } from '@/lib/admin.types';

interface SourceValuationRow {
  key: string;
  source: string;
  id?: string;
  quality: string;
  loadSpeed: string;
  pingTime: number;
  qualityRank?: number;
  speedValue?: number;
  sampleCount?: number;
  updated_at?: number;
  score?: number;
}

const getQualityScoreFromLabel = (
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

const getQualityBadgeClasses = (quality?: string): string => {
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

const toDisplayScore = (score: number | undefined): string => {
  if (!Number.isFinite(score) || score === undefined) {
    return '—';
  }
  if (Math.abs(score - Math.round(score)) < 0.05) {
    return Math.round(score).toString();
  }
  return score.toFixed(1);
};

const SourceValuationTable = ({ sourceConfig }: { sourceConfig?: DataSource[] }) => {
  const [valuations, setValuations] = useState<SourceValuationRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllProviders, setShowAllProviders] = useState(false);

  const sourceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (sourceConfig ?? []).forEach((source) => {
      if (!source?.key) return;
      map.set(source.key.trim(), source.name?.trim() || source.key.trim());
    });
    return map;
  }, [sourceConfig]);

  const fetchValuations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/admin/valuations');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error ||
            tt(
              `Failed to load: ${response.status}`,
              `载入失败: ${response.status}`,
              `載入失敗: ${response.status}`
            )
        );
      }
      const data = (await response.json()) as { items?: SourceValuationRow[] };
      const rows = data.items ?? [];
      const dedup = new Map<string, SourceValuationRow>();
      rows.forEach((item) => {
        const key = (item.source || item.key || '').trim();
        if (!key) return;
        dedup.set(key, {
          ...item,
          key,
        });
      });
      const dedupedRows = Array.from(dedup.values()).map((item) => {
        const normalizedSpeed =
          typeof item.speedValue === 'number' && item.speedValue > 0
            ? item.speedValue
            : parseSpeedToKBps(item.loadSpeed);
        return {
          ...item,
          speedValue: normalizedSpeed,
        };
      });

      if (dedupedRows.length === 0) {
        setValuations([]);
        return;
      }

      const speedValues = dedupedRows
        .map((item) => item.speedValue ?? 0)
        .filter((value) => value > 0);
      const maxSpeed = speedValues.length > 0 ? Math.max(...speedValues) : 0;

      const pingValues = dedupedRows
        .map((item) =>
          typeof item.pingTime === 'number' && item.pingTime > 0
            ? item.pingTime
            : null
        )
        .filter((value): value is number => value !== null);
      const minPing =
        pingValues.length > 0 ? Math.min(...pingValues) : Number.NaN;
      const maxPing =
        pingValues.length > 0 ? Math.max(...pingValues) : Number.NaN;

      const rowsWithScores = dedupedRows
        .map((item) => {
          const qualityScore = getQualityScoreFromLabel(
            item.quality,
            item.qualityRank
          );

          const speedScore =
            maxSpeed > 0 && (item.speedValue ?? 0) > 0
              ? Math.min(100, Math.max(0, ((item.speedValue ?? 0) / maxSpeed) * 100))
              : 0;

          let pingScore = 0;
          if (
            typeof item.pingTime === 'number' &&
            item.pingTime > 0 &&
            Number.isFinite(minPing) &&
            Number.isFinite(maxPing) &&
            maxPing - minPing !== 0
          ) {
            pingScore = Math.min(
              100,
              Math.max(
                0,
                ((maxPing - item.pingTime) / (maxPing - minPing)) * 100
              )
            );
          } else if (
            typeof item.pingTime === 'number' &&
            item.pingTime > 0 &&
            Number.isFinite(minPing) &&
            Number.isFinite(maxPing) &&
            maxPing === minPing
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

          return {
            ...item,
            score: Number.isFinite(score) ? Number(score.toFixed(1)) : undefined,
          };
        })
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

      setValuations(rowsWithScores);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : tt('Failed to load', '载入失败', '載入失敗');
      console.error('Failed to load provider valuations:', err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleTestValuations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      // Create a fake sample for the top provider to verify sampleCount/updated_at
      const target = valuations[0];
      if (!target) {
        throw new Error(
          tt(
            'No providers available to test.',
            '没有可测试的提供者。',
            '沒有可測試的提供者。'
          )
        );
      }
      const payload = {
        valuations: [
          {
            key: target.key,
            source: target.source,
            quality: target.quality || '1080p',
            loadSpeed: target.loadSpeed || '1 MB/s',
            pingTime: target.pingTime || 1000,
            qualityRank: target.qualityRank ?? 75,
            speedValue: target.speedValue ?? 1024,
            sampleCount: (target.sampleCount ?? 0) + 1,
            updated_at: Date.now(),
          },
        ],
      };

      const resp = await fetch('/api/source/valuation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(
          data.error ||
            tt(
              `Failed: ${resp.status}`,
              `失败: ${resp.status}`,
              `失敗: ${resp.status}`
            )
        );
      }

      await fetchValuations();

      Swal.fire({
        icon: 'success',
        title: tt('Valuations test', '估值测试', '估值測試'),
        text: tt(
          'Added a test sample to the first provider and refreshed.',
          '向第一个提供者添加了测试样本并已刷新。',
          '向第一個提供者新增了測試樣本並已刷新。'
        ),
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: tt('Valuations test failed', '估值测试失败', '估值測試失敗'),
        text:
          err instanceof Error
            ? err.message
            : tt('Unknown error', '未知错误', '未知錯誤'),
      });
    } finally {
      setIsLoading(false);
    }
  }, [valuations, fetchValuations]);

  useEffect(() => {
    fetchValuations();
  }, [fetchValuations]);

  const mergedRows = useMemo(() => {
    if (!showAllProviders || !Array.isArray(sourceConfig)) {
      return valuations;
    }
    const existing = new Set(valuations.map((v) => v.key));
    const missing = sourceConfig
      .filter((s) => s.key && !existing.has(s.key))
      .map((s) => ({
        key: s.key,
        source: s.name || s.key,
        quality: '—',
        loadSpeed: '—',
        pingTime: 0,
        qualityRank: undefined,
        speedValue: undefined,
        sampleCount: 0,
        score: undefined,
        updated_at: undefined,
      }))
      .sort((a, b) =>
        (a.source || a.key).localeCompare(b.source || b.key)
      );
    return [...valuations, ...missing];
  }, [showAllProviders, sourceConfig, valuations]);

  const providerCount = sourceConfig?.length || 0;

  return (
    <div className='space-y-4'>
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
        <div>
          <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            {tt(
              'Provider valuations (sorted by quality, speed, ping)',
              '提供者评估（按画质、速度、延迟排序）',
              '提供者評估（依畫質、速度、延遲排序）'
            )}
          </h4>
          <p className='text-xs text-gray-500 dark:text-gray-400'>
            {showAllProviders
              ? tt(
                  `Showing all providers (${providerCount || '—'} total; providers without data appear as placeholders)`,
                  `显示所有提供者（共 ${providerCount || '—'} 个，无数据者以占位显示）`,
                  `顯示所有提供者（共 ${providerCount || '—'} 個，無資料者以佔位顯示）`
                )
              : tt(
                  'Showing providers with benchmark data only',
                  '仅显示有测速记录的提供者',
                  '僅顯示有測速紀錄的提供者'
                )}
          </p>
        </div>
        <div className='flex items-center gap-3'>
          <label className='flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300'>
            <input
              type='checkbox'
              className='h-4 w-4'
              checked={showAllProviders}
              onChange={(e) => setShowAllProviders(e.target.checked)}
            />
            {tt('Show all providers', '显示所有提供者', '顯示所有提供者')}
          </label>
          <button
            onClick={fetchValuations}
            className='px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors'
            disabled={isLoading}
          >
            {isLoading
              ? tt('Refreshing…', '刷新中…', '刷新中…')
              : tt('Refresh', '刷新', '重新整理')}
          </button>
          <button
            onClick={handleTestValuations}
            className='px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg transition-colors'
            disabled={isLoading}
          >
            {tt('Test storage', '测试存储', '測試存儲')}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className='text-sm text-gray-500 dark:text-gray-400'>
          {tt('Loading…', '加载中…', '讀取中…')}
        </div>
      ) : mergedRows.length === 0 ? (
        <div className='text-sm text-gray-500 dark:text-gray-400'>
          {tt(
            'No benchmark records yet.',
            '尚无测速记录。',
            '尚無測速紀錄。'
          )}
        </div>
      ) : (
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg max-h-[28rem] overflow-y-auto overflow-x-auto'>
          <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm'>
            <thead className='bg-gray-50 dark:bg-gray-900'>
              <tr>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  {tt('Provider', '提供者', '提供者')}
                </th>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Key
                </th>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  {tt('Resolution', '分辨率', '解析度')}
                </th>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Score
                </th>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Speed
                </th>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Ping (ms)
                </th>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Samples
                </th>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-200 dark:divide-gray-700'>
              {mergedRows.map((item) => {
                const trimmedSource = (item.source || '').trim();
                const displayName =
                  sourceNameMap.get(item.key) ??
                  sourceNameMap.get(trimmedSource) ??
                  item.source ??
                  item.key;
                return (
                  <tr key={item.key} className='hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors'>
                    <td className='px-4 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap'>
                      {displayName}
                    </td>
                    <td className='px-4 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap'>
                      {item.key}
                    </td>
                    <td className='px-4 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap'>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getQualityBadgeClasses(
                          item.quality
                        )}`}
                      >
                        {item.quality || '—'}
                      </span>
                    </td>
                    <td className='px-4 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap'>
                      {(() => {
                        const scoreLabel = toDisplayScore(item.score);
                        return scoreLabel === '—'
                          ? '—'
                          : `${scoreLabel}${tt(' pts', ' 分', ' 分')}`;
                      })()}
                    </td>
                    <td className='px-4 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap'>
                      {item.loadSpeed}
                    </td>
                    <td className='px-4 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap'>
                      {item.pingTime ?? '—'}
                    </td>
                    <td className='px-4 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap'>
                      {item.sampleCount ?? 0}
                    </td>
                    <td className='px-4 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap'>
                      {item.updated_at
                        ? new Date(item.updated_at).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <div className='text-xs text-red-500'>{error}</div>
      )}
    </div>
  );
};

export default SourceValuationTable;