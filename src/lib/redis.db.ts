/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { createClient, RedisClientType } from 'redis';

import { AdminConfig } from './admin.types';
import { Favorite, IStorage, PlayRecord, SourceValuation, YoutubeMusicVideo } from './types';
import { getQualityRank, parseSpeedToKBps } from './utils';

const SEARCH_HISTORY_LIMIT = 20;

async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (err: any) {
      const isLastAttempt = i === maxRetries - 1;
      const isConnectionError =
        err.message?.includes('Connection') ||
        err.message?.includes('ECONNREFUSED') ||
        err.message?.includes('ENOTFOUND') ||
        err.code === 'ECONNRESET' ||
        err.code === 'EPIPE';

      if (isConnectionError && !isLastAttempt) {
        console.log(
          `Redis operation failed, retrying... (${i + 1}/${maxRetries})`
        );
        console.error('Error:', err.message);

        await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));

        try {
          const client = getRedisClient();
          if (!client.isOpen) {
            await client.connect();
          }
        } catch (reconnectErr) {
          console.error('Failed to reconnect:', reconnectErr);
        }

        continue;
      }

      throw err;
    }
  }

  throw new Error('Max retries exceeded');
}

export class RedisStorage implements IStorage {
  private client: RedisClientType;

  constructor() {
    this.client = getRedisClient();
  }

  private prKey(user: string, key: string) {
    return `u:${user}:pr:${key}`; // u:username:pr:source+id
  }

  async getPlayRecord(
    userName: string,
    key: string
  ): Promise<PlayRecord | null> {
    const val = await withRetry(() =>
      this.client.get(this.prKey(userName, key))
    );
    return val ? (JSON.parse(val) as PlayRecord) : null;
  }

  async setPlayRecord(
    userName: string,
    key: string,
    record: PlayRecord
  ): Promise<void> {
    await withRetry(() =>
      this.client.set(this.prKey(userName, key), JSON.stringify(record))
    );
  }

  async getAllPlayRecords(
    userName: string
  ): Promise<Record<string, PlayRecord>> {
    const pattern = `u:${userName}:pr:*`;
    const keys: string[] = await withRetry(() => this.client.keys(pattern));
    if (keys.length === 0) return {};
    const values = await withRetry(() => this.client.mGet(keys));
    const result: Record<string, PlayRecord> = {};
    keys.forEach((fullKey: string, idx: number) => {
      const raw = values[idx];
      if (raw) {
        const rec = JSON.parse(raw) as PlayRecord;
        const keyPart = fullKey.replace(`u:${userName}:pr:`, '');
        result[keyPart] = rec;
      }
    });
    return result;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.del(this.prKey(userName, key)));
  }

  private favKey(user: string, key: string) {
    return `u:${user}:fav:${key}`;
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const val = await withRetry(() =>
      this.client.get(this.favKey(userName, key))
    );
    return val ? (JSON.parse(val) as Favorite) : null;
  }

  async setFavorite(
    userName: string,
    key: string,
    favorite: Favorite
  ): Promise<void> {
    await withRetry(() =>
      this.client.set(this.favKey(userName, key), JSON.stringify(favorite))
    );
  }

  async getAllFavorites(userName: string): Promise<Record<string, Favorite>> {
    const pattern = `u:${userName}:fav:*`;
    const keys: string[] = await withRetry(() => this.client.keys(pattern));
    if (keys.length === 0) return {};
    const values = await withRetry(() => this.client.mGet(keys));
    const result: Record<string, Favorite> = {};
    keys.forEach((fullKey: string, idx: number) => {
      const raw = values[idx];
      if (raw) {
        const fav = JSON.parse(raw) as Favorite;
        const keyPart = fullKey.replace(`u:${userName}:fav:`, '');
        result[keyPart] = fav;
      }
    });
    return result;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    await withRetry(() => this.client.del(this.favKey(userName, key)));
  }

  private valuationKey(key: string) {
    return `sourceval:${key}`;
  }

  async setSourceValuation(valuation: SourceValuation): Promise<void> {
    const key = (valuation.key || '').trim();
    if (!key) return;
    const source = (valuation.source || '').trim();
    const payload: SourceValuation = {
      ...valuation,
      key,
      source,
      qualityRank: valuation.qualityRank ?? getQualityRank(valuation.quality),
      speedValue: valuation.speedValue ?? parseSpeedToKBps(valuation.loadSpeed),
      sampleCount: valuation.sampleCount ?? 1,
      updated_at: valuation.updated_at ?? Date.now(),
    };
    await withRetry(() =>
      this.client.set(this.valuationKey(key), JSON.stringify(payload))
    );
  }

  async getSourceValuation(key: string): Promise<SourceValuation | null> {
    const val = await withRetry(() =>
      this.client.get(this.valuationKey(key))
    );
    if (!val) return null;
    const parsed = JSON.parse(val) as SourceValuation;
    return {
      ...parsed,
      key: (parsed.key || key).trim(),
      qualityRank:
        parsed.qualityRank ?? getQualityRank(parsed.quality),
      speedValue:
        parsed.speedValue ?? parseSpeedToKBps(parsed.loadSpeed),
      sampleCount: parsed.sampleCount ?? 1,
    };
  }

  async getSourceValuations(
    keys: string[]
  ): Promise<Record<string, SourceValuation>> {
    const result: Record<string, SourceValuation> = {};
    if (keys.length === 0) return result;
    const redisKeys = keys.map((key) => this.valuationKey(key));
    const values = await withRetry(() => this.client.mGet(redisKeys));
    keys.forEach((key, idx) => {
      const raw = values[idx];
      if (raw) {
        const parsed = JSON.parse(raw) as SourceValuation;
        result[key] = {
          ...parsed,
          key,
          qualityRank:
            parsed.qualityRank ?? getQualityRank(parsed.quality),
          speedValue:
            parsed.speedValue ?? parseSpeedToKBps(parsed.loadSpeed),
          sampleCount: parsed.sampleCount ?? 1,
        };
      }
    });
    return result;
  }

  async getAllSourceValuations(): Promise<SourceValuation[]> {
    const pattern = 'sourceval:*';
    const keys: string[] = await withRetry(() => this.client.keys(pattern));
    if (keys.length === 0) return [];
    const values = await withRetry(() => this.client.mGet(keys));
    const result: SourceValuation[] = [];
    keys.forEach((redisKey: string, idx: number) => {
      const raw = values[idx];
      if (!raw) return;
      const parsed = JSON.parse(raw) as SourceValuation;
      result.push({
        ...parsed,
        key: (parsed.key || redisKey.replace('sourceval:', '')).trim(),
        qualityRank:
          parsed.qualityRank ?? getQualityRank(parsed.quality),
        speedValue:
          parsed.speedValue ?? parseSpeedToKBps(parsed.loadSpeed),
        sampleCount: parsed.sampleCount ?? 1,
      });
    });
    result.sort((a, b) => {
      if ((b.qualityRank ?? 0) !== (a.qualityRank ?? 0)) {
        return (b.qualityRank ?? 0) - (a.qualityRank ?? 0);
      }
      if ((b.speedValue ?? 0) !== (a.speedValue ?? 0)) {
        return (b.speedValue ?? 0) - (a.speedValue ?? 0);
      }
      return (a.pingTime ?? Number.MAX_SAFE_INTEGER) -
        (b.pingTime ?? Number.MAX_SAFE_INTEGER);
    });
    return result;
  }

  private userPwdKey(user: string) {
    return `u:${user}:pwd`;
  }

  async registerUser(userName: string, password: string): Promise<void> {
    await withRetry(() => this.client.set(this.userPwdKey(userName), password));
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = await withRetry(() =>
      this.client.get(this.userPwdKey(userName))
    );
    if (stored === null) return false;
    return stored === password;
  }

  async checkUserExist(userName: string): Promise<boolean> {
    const exists = await withRetry(() =>
      this.client.exists(this.userPwdKey(userName))
    );
    return exists === 1;
  }

  async changePassword(userName: string, newPassword: string): Promise<void> {
    await withRetry(() =>
      this.client.set(this.userPwdKey(userName), newPassword)
    );
  }

  async renameUser(oldUserName: string, newUserName: string): Promise<void> {
    // Move password
    const existingPwd = await withRetry(() =>
      this.client.get(this.userPwdKey(oldUserName))
    );
    if (existingPwd === null) {
      throw new Error('Source user does not exist');
    }
    await withRetry(() => this.client.set(this.userPwdKey(newUserName), existingPwd));
    await withRetry(() => this.client.del(this.userPwdKey(oldUserName)));

    // Helper to migrate hash-like key groups
    const migrateKeys = async (
      pattern: string,
      oldPrefix: string,
      newPrefix: string
    ) => {
      const keys: string[] = await withRetry(() => this.client.keys(pattern));
      if (!keys || keys.length === 0) return;
      for (const key of keys) {
        const newKey = key.replace(oldPrefix, newPrefix);
        const val = await withRetry(() => this.client.get(key));
        if (val !== null) {
          await withRetry(() => this.client.set(newKey, val));
        }
        await withRetry(() => this.client.del(key));
      }
    };

    await migrateKeys(
      `u:${oldUserName}:pr:*`,
      `u:${oldUserName}:pr:`,
      `u:${newUserName}:pr:`
    );
    await migrateKeys(
      `u:${oldUserName}:fav:*`,
      `u:${oldUserName}:fav:`,
      `u:${newUserName}:fav:`
    );

    const musicList = await withRetry(() =>
      this.client.get(this.ytMusicKey(oldUserName))
    );
    if (musicList !== null) {
      await withRetry(() =>
        this.client.set(this.ytMusicKey(newUserName), musicList)
      );
      await withRetry(() => this.client.del(this.ytMusicKey(oldUserName)));
    }

    // Search history list
    const history = await withRetry(() =>
      this.client.lRange(this.shKey(oldUserName), 0, -1)
    );
    if (history && history.length > 0) {
      await withRetry(() => this.client.del(this.shKey(newUserName)));
      await withRetry(() => this.client.rPush(this.shKey(newUserName), history));
    }
    await withRetry(() => this.client.del(this.shKey(oldUserName)));
  }

  async deleteUser(userName: string): Promise<void> {
    await withRetry(() => this.client.del(this.userPwdKey(userName)));

    await withRetry(() => this.client.del(this.shKey(userName)));

    const playRecordPattern = `u:${userName}:pr:*`;
    const playRecordKeys = await withRetry(() =>
      this.client.keys(playRecordPattern)
    );
    if (playRecordKeys.length > 0) {
      await withRetry(() => this.client.del(playRecordKeys));
    }

    const favoritePattern = `u:${userName}:fav:*`;
    const favoriteKeys = await withRetry(() =>
      this.client.keys(favoritePattern)
    );
    if (favoriteKeys.length > 0) {
      await withRetry(() => this.client.del(favoriteKeys));
    }

    await withRetry(() => this.client.del(this.ytMusicKey(userName)));
  }

  private shKey(user: string) {
    return `u:${user}:sh`; // u:username:sh
  }

  private ytMusicKey(user: string) {
    return `u:${user}:ytmusic`;
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    return withRetry(
      () => this.client.lRange(this.shKey(userName), 0, -1) as Promise<string[]>
    );
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const key = this.shKey(userName);
    await withRetry(() => this.client.lRem(key, 0, keyword));
    await withRetry(() => this.client.lPush(key, keyword));
    await withRetry(() => this.client.lTrim(key, 0, SEARCH_HISTORY_LIMIT - 1));
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const key = this.shKey(userName);
    if (keyword) {
      await withRetry(() => this.client.lRem(key, 0, keyword));
    } else {
      await withRetry(() => this.client.del(key));
    }
  }

  async getYoutubeMusicList(userName: string): Promise<YoutubeMusicVideo[]> {
    const raw = await withRetry(() =>
      this.client.get(this.ytMusicKey(userName))
    );
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as YoutubeMusicVideo[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item) => item?.id && item?.title);
    } catch {
      return [];
    }
  }

  async setYoutubeMusicList(
    userName: string,
    list: YoutubeMusicVideo[]
  ): Promise<void> {
    const payload = Array.isArray(list)
      ? list.filter((item) => item?.id && item?.title)
      : [];
    await withRetry(() =>
      this.client.set(this.ytMusicKey(userName), JSON.stringify(payload))
    );
  }

  async deleteYoutubeMusicList(userName: string): Promise<void> {
    await withRetry(() => this.client.del(this.ytMusicKey(userName)));
  }

  async getAllUsers(): Promise<string[]> {
    const keys = await withRetry(() => this.client.keys('u:*:pwd'));
    return keys
      .map((k) => {
        const match = k.match(/^u:(.+?):pwd$/);
        return match ? match[1] : undefined;
      })
      .filter((u): u is string => typeof u === 'string');
  }

  private adminConfigKey() {
    return 'admin:config';
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const val = await withRetry(() => this.client.get(this.adminConfigKey()));
    return val ? (JSON.parse(val) as AdminConfig) : null;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    await withRetry(() =>
      this.client.set(this.adminConfigKey(), JSON.stringify(config))
    );
  }
}

function getRedisClient(): RedisClientType {
  const globalKey = Symbol.for('__MOONTV_REDIS_CLIENT__');
  let client: RedisClientType | undefined = (global as any)[globalKey];

  if (!client) {
    const url = process.env.REDIS_URL;
    if (!url) {
      throw new Error('REDIS_URL env variable not set');
    }

    client = createClient({
      url,
      socket: {
        reconnectStrategy: (retries: number) => {
          console.log(`Redis reconnection attempt ${retries + 1}`);
          if (retries > 10) {
            console.error('Redis max reconnection attempts exceeded');
            return false; // 停止重连
          }
          return Math.min(1000 * Math.pow(2, retries), 30000); // 指数退避，最大30秒
        },
        connectTimeout: 10000, // 10秒连接超时
        noDelay: true,
      },
      pingInterval: 30000, // 30秒ping一次，保持连接活跃
    });

    client.on('error', (err) => {
      console.error('Redis client error:', err);
    });

    client.on('connect', () => {
      console.log('Redis connected');
    });

    client.on('reconnecting', () => {
      console.log('Redis reconnecting...');
    });

    client.on('ready', () => {
      console.log('Redis ready');
    });

    const connectWithRetry = async () => {
      try {
        await client!.connect();
        console.log('Redis connected successfully');
      } catch (err) {
        console.error('Redis initial connection failed:', err);
        console.log('Will retry in 5 seconds...');
        setTimeout(connectWithRetry, 5000);
      }
    };

    connectWithRetry();

    (global as any)[globalKey] = client;
  }

  return client;
}
