'use client';

import { useState, useEffect } from 'react';
import { tt } from '../shared/i18n';

const RedisStatus = () => {
  const [redisInfo, setRedisInfo] = useState<{
    used?: number;
    usedHuman?: string;
    max?: number | null;
    maxHuman?: string;
    available?: number | null;
    availableHuman?: string;
    policy?: string | null;
    error?: string;
  } | null>(null);
  const [redisLoading, setRedisLoading] = useState(false);

  useEffect(() => {
    const loadRedisInfo = async () => {
      setRedisLoading(true);
      try {
        const resp = await fetch('/api/admin/redis-info');
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) {
          setRedisInfo({
            error:
              data?.error ||
              tt(
                'Unable to fetch Redis status. Check REDIS_URL and Redis service.',
                '无法获取 Redis 状态，请确认环境变量 REDIS_URL 或 Redis 服务。',
                '無法取得 Redis 狀態，請確認環境變數 REDIS_URL 或 Redis 服務。'
              ),
          });
          return;
        }
        setRedisInfo(data);
      } catch (err) {
        setRedisInfo({
          error:
            err instanceof Error
              ? err.message
              : tt(
                  'Failed to fetch Redis status',
                  '获取 Redis 状态时发生错误',
                  '取得 Redis 狀態時發生錯誤'
                ),
        });
      } finally {
        setRedisLoading(false);
      }
    };
    loadRedisInfo();
  }, []);

  return (
    <div>
      {redisLoading && (
        <div className='text-sm text-gray-600 dark:text-gray-300'>
          {tt('Loading…', '加载中…', '讀取中…')}
        </div>
      )}
      {!redisLoading && redisInfo?.error && (
        <div className='text-sm text-red-600 dark:text-red-400'>
          {redisInfo.error}
        </div>
      )}
      {!redisLoading && redisInfo && !redisInfo.error && (
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-800 dark:text-gray-200'>
          <div className='p-3 rounded-lg bg-gray-50 dark:bg-gray-800/70'>
            <div className='text-gray-500 dark:text-gray-400 text-xs mb-1'>
              {tt('Used', '已使用', '已使用')}
            </div>
            <div className='font-semibold'>
              {redisInfo.usedHuman || '—'}
              {redisInfo.used
                ? ` (${redisInfo.used.toLocaleString()} bytes)`
                : ''}
            </div>
          </div>
          <div className='p-3 rounded-lg bg-gray-50 dark:bg-gray-800/70'>
            <div className='text-gray-500 dark:text-gray-400 text-xs mb-1'>
              {tt('Max', '上限', '上限')}
            </div>
            <div className='font-semibold'>
              {redisInfo.maxHuman || '—'}
              {redisInfo.max
                ? ` (${redisInfo.max.toLocaleString()} bytes)`
                : redisInfo.max === null
                  ? tt(' (Unlimited)', ' (无上限)', ' (無上限)')
                  : ''}
            </div>
          </div>
          <div className='p-3 rounded-lg bg-gray-50 dark:bg-gray-800/70'>
            <div className='text-gray-500 dark:text-gray-400 text-xs mb-1'>
              {tt('Available', '剩余可用', '剩餘可用')}
            </div>
            <div className='font-semibold'>
              {redisInfo.availableHuman || '—'}
              {redisInfo.available
                ? ` (${redisInfo.available.toLocaleString()} bytes)`
                : redisInfo.available === null
                  ? ''
                  : ''}
            </div>
          </div>
          <div className='p-3 rounded-lg bg-gray-50 dark:bg-gray-800/70'>
            <div className='text-gray-500 dark:text-gray-400 text-xs mb-1'>
              {tt('Eviction policy', '淘汰策略', '淘汰策略')}
            </div>
            <div className='font-semibold'>
              {redisInfo.policy || '—'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RedisStatus;
