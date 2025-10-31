/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { AdminConfig } from './admin.types';
import { D1Storage } from './d1.db';
import { RedisStorage } from './redis.db';
import { Favorite, IStorage, PlayRecord, SourceValuation } from './types';
import {
  formatSpeedFromKBps,
  getQualityLabelFromRank,
  getQualityRank,
  parseSpeedToKBps,
} from './utils';

// storage type 常量: 'localstorage' | 'redis' | 'd1'，默认 'localstorage'
const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'd1'
    | undefined) || 'localstorage';

// 创建存储实例
function createStorage(): IStorage {
  switch (STORAGE_TYPE) {
    case 'redis':
      return new RedisStorage();
    case 'd1':
      return new D1Storage();
    case 'localstorage':
    default:
      // 默认返回内存实现，保证本地开发可用
      return null as unknown as IStorage;
  }
}

// 单例存储实例
let storageInstance: IStorage | null = null;

export function getStorage(): IStorage {
  if (!storageInstance) {
    storageInstance = createStorage();
  }
  return storageInstance;
}

// 工具函数：生成存储key
export function generateStorageKey(source: string, id: string): string {
  return `${source}+${id}`;
}

// 导出便捷方法
export class DbManager {
  private storage: IStorage;

  constructor() {
    this.storage = getStorage();
  }

  // 播放记录相关方法
  async getPlayRecord(
    userName: string,
    source: string,
    id: string
  ): Promise<PlayRecord | null> {
    const key = generateStorageKey(source, id);
    return this.storage.getPlayRecord(userName, key);
  }

  async savePlayRecord(
    userName: string,
    source: string,
    id: string,
    record: PlayRecord
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    await this.storage.setPlayRecord(userName, key, record);
  }

  async getAllPlayRecords(userName: string): Promise<{
    [key: string]: PlayRecord;
  }> {
    return this.storage.getAllPlayRecords(userName);
  }

  async deletePlayRecord(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    await this.storage.deletePlayRecord(userName, key);
  }

  // 收藏相关方法
  async getFavorite(
    userName: string,
    source: string,
    id: string
  ): Promise<Favorite | null> {
    const key = generateStorageKey(source, id);
    return this.storage.getFavorite(userName, key);
  }

  async saveFavorite(
    userName: string,
    source: string,
    id: string,
    favorite: Favorite
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    await this.storage.setFavorite(userName, key, favorite);
  }

  async getAllFavorites(
    userName: string
  ): Promise<{ [key: string]: Favorite }> {
    return this.storage.getAllFavorites(userName);
  }

  async deleteFavorite(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    await this.storage.deleteFavorite(userName, key);
  }

  async isFavorited(
    userName: string,
    source: string,
    id: string
  ): Promise<boolean> {
    const favorite = await this.getFavorite(userName, source, id);
    return favorite !== null;
  }

  // ---------- 用户相关 ----------
  async registerUser(userName: string, password: string): Promise<void> {
    await this.storage.registerUser(userName, password);
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    return this.storage.verifyUser(userName, password);
  }

  // 检查用户是否已存在
  async checkUserExist(userName: string): Promise<boolean> {
    return this.storage.checkUserExist(userName);
  }

  // ---------- 搜索历史 ----------
  async getSearchHistory(userName: string): Promise<string[]> {
    return this.storage.getSearchHistory(userName);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    await this.storage.addSearchHistory(userName, keyword);
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    await this.storage.deleteSearchHistory(userName, keyword);
  }

  // 获取全部用户名
  async getAllUsers(): Promise<string[]> {
    if (typeof (this.storage as any).getAllUsers === 'function') {
      return (this.storage as any).getAllUsers();
    }
    return [];
  }

  // ---------- 管理员配置 ----------
  async getAdminConfig(): Promise<AdminConfig | null> {
    if (typeof (this.storage as any).getAdminConfig === 'function') {
      return (this.storage as any).getAdminConfig();
    }
    return null;
  }

  async saveAdminConfig(config: AdminConfig): Promise<void> {
    if (typeof (this.storage as any).setAdminConfig === 'function') {
      await (this.storage as any).setAdminConfig(config);
    }
  }

  // ---------- 播放源評估 ----------
  async saveSourceValuations(
    valuations: SourceValuation[]
  ): Promise<void> {
    if (
      !this.storage ||
      typeof this.storage.setSourceValuation !== 'function'
    ) {
      return;
    }

    for (const valuation of valuations) {
      try {
        const trimmedKey = valuation.key.trim();
        if (!trimmedKey) {
          continue;
        }
        const trimmedSource = valuation.source.trim();

        let existing: SourceValuation | null = null;
        if (typeof this.storage.getSourceValuation === 'function') {
          try {
            existing = await this.storage.getSourceValuation(trimmedKey);
          } catch (error) {
            console.warn('Failed to fetch existing valuation:', error);
          }
        }

        const previousCount = existing?.sampleCount ?? 0;

        const measurementQualityRank =
          valuation.qualityRank ?? getQualityRank(valuation.quality);
        const measurementSpeedValue =
          valuation.speedValue ?? parseSpeedToKBps(valuation.loadSpeed);
        const measurementPingTime = Number.isFinite(valuation.pingTime)
          ? valuation.pingTime
          : 0;

        const existingQualityRank =
          existing?.qualityRank ?? getQualityRank(existing?.quality);
        const existingSpeedValue =
          existing?.speedValue ?? parseSpeedToKBps(existing?.loadSpeed);
        const existingPingTime = Number.isFinite(existing?.pingTime)
          ? existing!.pingTime
          : 0;

        const hasQuality = measurementQualityRank > 0;
        const hasSpeed = measurementSpeedValue > 0;
        const hasPing = measurementPingTime > 0;
        const increment = hasQuality || hasSpeed || hasPing ? 1 : 0;
        const combinedCount = previousCount + increment;

        const blendedQualityRank = hasQuality
          ? previousCount > 0
            ? (existingQualityRank * previousCount + measurementQualityRank) /
              (previousCount + 1)
            : measurementQualityRank
          : existingQualityRank;

        const blendedSpeedValue = hasSpeed
          ? previousCount > 0
            ? (existingSpeedValue * previousCount + measurementSpeedValue) /
              (previousCount + 1)
            : measurementSpeedValue
          : existingSpeedValue;

        const blendedPingTime = hasPing
          ? previousCount > 0
            ? (existingPingTime * previousCount + measurementPingTime) /
              (previousCount + 1)
            : measurementPingTime
          : existingPingTime;

        const roundedQualityRank = Math.max(0, Math.round(blendedQualityRank));
        const qualityLabel = getQualityLabelFromRank(
          roundedQualityRank,
          existing?.quality ?? valuation.quality ?? '未知'
        );

        const formattedSpeed =
          blendedSpeedValue > 0
            ? formatSpeedFromKBps(blendedSpeedValue)
            : existing?.loadSpeed ?? valuation.loadSpeed ?? '未知';

        const aggregateCount = Math.max(
          combinedCount,
          increment > 0 ? combinedCount : previousCount
        );
        if (aggregateCount === 0) {
          continue;
        }

        const payload: SourceValuation = {
          key: trimmedKey,
          source: trimmedSource,
          quality: qualityLabel,
          loadSpeed: formattedSpeed,
          pingTime:
            blendedPingTime > 0 || previousCount > 0
              ? Math.round(blendedPingTime)
              : measurementPingTime,
          qualityRank: roundedQualityRank,
          speedValue: Math.round(blendedSpeedValue),
          sampleCount: aggregateCount,
          updated_at: Date.now(),
        };

        await this.storage.setSourceValuation(payload);
      } catch (error) {
        console.error('Failed to save source valuation:', error);
      }
    }
  }

  async getSourceValuations(
    keys: string[]
  ): Promise<Record<string, SourceValuation>> {
    const result: Record<string, SourceValuation> = {};
    if (!this.storage || keys.length === 0) {
      return result;
    }

    if (typeof this.storage.getSourceValuations === 'function') {
      try {
        const fetched = await this.storage.getSourceValuations(keys);
        const normalized: Record<string, SourceValuation> = {};
        Object.keys(fetched).forEach((initialKey) => {
          const entry = fetched[initialKey];
          if (!entry) return;
          const trimmedKey = (entry.key || initialKey || '').trim();
          if (!trimmedKey) {
            return;
          }
          const normalizedEntry: SourceValuation = {
            ...entry,
            key: trimmedKey,
            qualityRank:
              entry.qualityRank ?? getQualityRank(entry.quality),
            speedValue:
              entry.speedValue ?? parseSpeedToKBps(entry.loadSpeed),
            sampleCount:
              entry.sampleCount ??
              (entry.qualityRank || entry.speedValue ? 1 : 0),
          };
          normalized[trimmedKey] = normalizedEntry;
        });
        return normalized;
      } catch (error) {
        console.error('Failed to get source valuations:', error);
        return result;
      }
    }

    if (typeof this.storage.getSourceValuation === 'function') {
      for (const key of keys) {
        try {
          const valuation: SourceValuation | null =
            await this.storage.getSourceValuation(key);
          if (valuation) {
            const trimmedKey = (valuation.key || key || '').trim();
            if (!trimmedKey) {
              continue;
            }
            valuation.qualityRank =
              valuation.qualityRank ?? getQualityRank(valuation.quality);
            valuation.speedValue =
              valuation.speedValue ?? parseSpeedToKBps(valuation.loadSpeed);
            valuation.sampleCount =
              valuation.sampleCount ??
              (valuation.qualityRank || valuation.speedValue ? 1 : 0);
            valuation.key = trimmedKey;
            result[trimmedKey] = valuation;
          }
        } catch (error) {
          console.error('Failed to get source valuation:', error);
        }
      }
    }

    return result;
  }

  async getAllSourceValuations(): Promise<SourceValuation[]> {
    if (
      !this.storage ||
      typeof this.storage.getAllSourceValuations !== 'function'
    ) {
      return [];
    }
    try {
      const entries = await this.storage.getAllSourceValuations();
      return entries.map((entry) => ({
        ...entry,
        qualityRank: entry.qualityRank ?? getQualityRank(entry.quality),
        speedValue: entry.speedValue ?? parseSpeedToKBps(entry.loadSpeed),
        sampleCount:
          entry.sampleCount ??
          (entry.qualityRank || entry.speedValue ? 1 : 0),
      }));
    } catch (error) {
      console.error('Failed to get all source valuations:', error);
      return [];
    }
  }
}

// 导出默认实例
export const db = new DbManager();
