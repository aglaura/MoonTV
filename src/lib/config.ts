/* eslint-disable @typescript-eslint/no-explicit-any, no-console, @typescript-eslint/no-non-null-assertion */

import { db, getStorage } from '@/lib/db';

import { AdminConfig } from './admin.types';
import runtimeConfig from './runtime';
import { IStorage } from './types';
import { getQualityRank, parseSpeedToKBps } from './utils';

export interface ApiSite {
  key: string;
  name: string;
  api?: string;
  m3u8?: string;
  detail?: string;
}

interface ConfigFileStruct {
  cache_time?: number;
  api_site: {
    [key: string]: ApiSite;
  };
  users?: ConfigFileUser[];
}

interface ConfigFileUser {
  username: string;
  password: string;
  role?: 'user' | 'admin';
}

type NormalizedConfigUser = {
  username: string;
  password: string;
  role: 'user' | 'admin';
};

type BasicConfigUser = {
  username: string;
  role: 'user' | 'admin';
  group?: UserGroup | string;
};

type UserGroup = 'family' | 'guest';

const normalizeGroup = (group?: string): UserGroup =>
  group === 'guest' ? 'guest' : 'family';

function normalizeConfigUsers(
  users?: ConfigFileUser[]
): NormalizedConfigUser[] {
  if (!users) {
    return [];
  }
  const normalized: NormalizedConfigUser[] = [];
  for (const user of users) {
    const username = user?.username?.trim();
    const password = user?.password;
    if (!username || !password) {
      continue;
    }
    normalized.push({
      username,
      password,
      role: user.role === 'admin' ? 'admin' : 'user',
    });
  }
  return normalized;
}

async function ensureConfigUsersRegistered(
  storage: IStorage | null,
  users: NormalizedConfigUser[]
) {
  if (!storage || users.length === 0) {
    return;
  }
  for (const user of users) {
    try {
      const exists = await storage.checkUserExist(user.username);
      if (!exists) {
        await storage.registerUser(user.username, user.password);
      }
    } catch (error) {
      console.error(`初始化配置用户失败 (${user.username}):`, error);
    }
  }
}

export const API_CONFIG = {
  search: {
    path: '?ac=videolist&wd=',
    pagePath: '?ac=videolist&wd={query}&pg={page}',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  },
  detail: {
    path: '?ac=videolist&ids=',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  },
};

let fileConfig: ConfigFileStruct;
let cachedConfig: AdminConfig;
let sortedApiSitesCache: ApiSite[] | null = null;
let apiSiteOrderInitialized = false;

function buildAdminConfigFromFile(
  config: ConfigFileStruct,
  users: BasicConfigUser[] = []
): AdminConfig {
  const uniqueUsers = new Map<string, BasicConfigUser['role']>();
  users.forEach(({ username, role }) => {
    const trimmed = username?.trim();
    if (!trimmed) {
      return;
    }
    if (!uniqueUsers.has(trimmed)) {
      uniqueUsers.set(trimmed, role);
    }
  });

  const orderedUsers: {
    username: string;
    role: 'user' | 'admin' | 'owner';
    group?: UserGroup;
  }[] = [];
  uniqueUsers.forEach((role, username) => {
    orderedUsers.push({ username, role, group: 'family' });
  });

  const ownerUser = process.env.USERNAME?.trim();
  if (ownerUser) {
    const filtered = orderedUsers.filter((user) => user.username !== ownerUser);
    orderedUsers.length = 0;
    orderedUsers.push(...filtered);
    orderedUsers.unshift({
      username: ownerUser,
      role: 'owner',
      group: 'family',
    });
  }

  const apiSiteEntries = Object.entries(config?.api_site || {});

  return {
    SiteConfig: {
      SiteName: process.env.SITE_NAME || 'EssaouiraTV',
      Announcement:
        process.env.ANNOUNCEMENT ||
        '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
      SearchDownstreamMaxPage:
        Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
      SiteInterfaceCacheTime: config?.cache_time || 7200,
      ImageProxy: process.env.NEXT_PUBLIC_IMAGE_PROXY || '',
    },
    UserConfig: {
      AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
      Users: orderedUsers,
    },
    SourceConfig: apiSiteEntries.map(([key, site]) => ({
      key,
      name: site.name,
      api: site.api,
      m3u8: site.m3u8,
      detail: site.detail,
      from: 'config',
      disabled: false,
    })),
  };
}

async function initConfig() {
  if (cachedConfig) {
    return;
  }

  if (process.env.DOCKER_ENV === 'true') {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const _require = eval('require') as NodeRequire;
    const fs = _require('fs') as typeof import('fs');
    const path = _require('path') as typeof import('path');

    const configPath = path.join(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    fileConfig = JSON.parse(raw) as ConfigFileStruct;
    console.log('load dynamic config success');
  } else {
    fileConfig = runtimeConfig as unknown as ConfigFileStruct;
  }

  const configUsers = normalizeConfigUsers(fileConfig.users);
  const configUserRoleMap = new Map(
    configUsers.map((user) => [user.username, user.role])
  );
  const configUserNames = configUsers.map((user) => user.username);

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType !== 'localstorage') {
    let storage: IStorage | null = null;
    try {
      storage = getStorage();
    } catch (error) {
      console.error('获取存储实例失败:', error);
    }

    await ensureConfigUsersRegistered(storage, configUsers);

    let userNames: string[] = [];
    try {
      let adminConfig: AdminConfig | null = null;
      if (storage && typeof (storage as any).getAdminConfig === 'function') {
        adminConfig = await (storage as any).getAdminConfig();
      }

      if (storage && typeof (storage as any).getAllUsers === 'function') {
        try {
          userNames = await (storage as any).getAllUsers();
        } catch (e) {
          console.error('获取用户列表失败:', e);
        }
      }
      configUserNames.forEach((uname) => {
        if (!userNames.includes(uname)) {
          userNames.push(uname);
        }
      });

      const apiSiteEntries = Object.entries(fileConfig.api_site);

      if (adminConfig) {
        const existed = new Set(
          (adminConfig.SourceConfig || []).map((s) => s.key)
        );
        apiSiteEntries.forEach(([key, site]) => {
          if (!existed.has(key)) {
            adminConfig!.SourceConfig.push({
              key,
              name: site.name,
              api: site.api,
              m3u8: site.m3u8,
              detail: site.detail,
              from: 'config',
              disabled: false,
            });
          }
        });

        adminConfig.SourceConfig.forEach((source) => {
          const site = fileConfig.api_site[source.key];
          if (!site) {
            source.from = 'custom';
            return;
          }
          source.from = 'config';
          source.name = site.name;
          source.api = site.api;
          source.m3u8 = site.m3u8;
          source.detail = site.detail;
        });

        adminConfig.UserConfig.Users = (adminConfig.UserConfig.Users || []).map(
          (user) => {
            const normalizedGroup =
              typeof (user as any)?.group === 'string' &&
              (user as any)?.group?.trim()
                ? (user as any).group.trim()
                : normalizeGroup((user as any)?.group);
            if (user.role === 'owner') {
              return { ...user, group: normalizedGroup };
            }
            const targetRole = configUserRoleMap.get(user.username);
            return targetRole && user.role !== targetRole
              ? { ...user, role: targetRole, group: normalizedGroup }
              : { ...user, group: normalizedGroup };
          }
        );

        const existedUsers = new Set(
          adminConfig.UserConfig.Users.map((u) => u.username)
        );

        configUsers.forEach((cfg) => {
          if (!existedUsers.has(cfg.username)) {
            adminConfig!.UserConfig.Users.push({
              username: cfg.username,
              role: cfg.role,
              group: 'family',
            });
            existedUsers.add(cfg.username);
          }
        });

        userNames.forEach((uname) => {
          if (!existedUsers.has(uname)) {
            adminConfig!.UserConfig.Users.push({
              username: uname,
              role: configUserRoleMap.get(uname) ?? 'user',
              group: 'family',
            });
            existedUsers.add(uname);
          }
        });
        const ownerUser = process.env.USERNAME;
        if (ownerUser) {
          const existingOwner = adminConfig!.UserConfig.Users.find(
            (u) => u.username === ownerUser
          );
          adminConfig!.UserConfig.Users = adminConfig!.UserConfig.Users.filter(
            (u) => u.username !== ownerUser
          );
          adminConfig!.UserConfig.Users.unshift({
            username: ownerUser,
            role: 'owner',
            group: normalizeGroup(existingOwner?.group),
            ...(existingOwner?.avatar ? { avatar: existingOwner.avatar } : {}),
          });
        }
      } else {
        let allUsers: {
          username: string;
          role: 'user' | 'admin' | 'owner';
          group?: UserGroup;
        }[] = userNames.map((uname) => ({
          username: uname,
          role: (configUserRoleMap.get(uname) ?? 'user') as 'user' | 'admin',
          group: 'family',
        }));
        const ownerUser = process.env.USERNAME;
        if (ownerUser) {
          allUsers = allUsers.filter((u) => u.username !== ownerUser);
          allUsers.unshift({
            username: ownerUser,
            role: 'owner',
            group: 'family',
          });
        }
        adminConfig = {
          SiteConfig: {
            SiteName: process.env.SITE_NAME || 'EssaouiraTV',
            Announcement:
              process.env.ANNOUNCEMENT ||
              '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
            SearchDownstreamMaxPage:
              Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
            SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
            ImageProxy: process.env.NEXT_PUBLIC_IMAGE_PROXY || '',
          },
          UserConfig: {
            AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
            Users: allUsers as any,
          },
          SourceConfig: apiSiteEntries.map(([key, site]) => ({
            key,
            name: site.name,
            api: site.api,
            m3u8: site.m3u8,
            detail: site.detail,
            from: 'config',
            disabled: false,
          })),
        };
      }

      if (storage && typeof (storage as any).setAdminConfig === 'function') {
        await (storage as any).setAdminConfig(adminConfig);
      }

      cachedConfig = adminConfig;
    } catch (err) {
      console.error('加载管理员配置失败:', err);
    }

    if (!cachedConfig) {
      const fallbackUsers: BasicConfigUser[] = Array.from(
        new Set([...configUserNames, ...userNames])
      ).map((username) => ({
        username,
        role: configUserRoleMap.get(username) ?? 'user',
        group: 'family',
      }));
      cachedConfig = buildAdminConfigFromFile(fileConfig, fallbackUsers);
    }
  } else {
    cachedConfig = buildAdminConfigFromFile(fileConfig);
  }
}

export async function getConfig(): Promise<AdminConfig> {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (process.env.DOCKER_ENV === 'true' || storageType === 'localstorage') {
    await initConfig();
    return cachedConfig;
  }
  let storage: IStorage | null = null;
  try {
    storage = getStorage();
  } catch (error) {
    console.error('获取存储实例失败:', error);
  }
  let adminConfig: AdminConfig | null = null;
  if (storage && typeof (storage as any).getAdminConfig === 'function') {
    adminConfig = await (storage as any).getAdminConfig();
  }
  if (adminConfig) {
    adminConfig.UserConfig.Users =
      adminConfig.UserConfig.Users?.map((user) => ({
        ...user,
        group: normalizeGroup((user as any)?.group),
      })) ?? [];
    adminConfig.SiteConfig.SiteName = process.env.SITE_NAME || 'EssaouiraTV';
    adminConfig.SiteConfig.Announcement =
      process.env.ANNOUNCEMENT ||
      '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。';
    adminConfig.UserConfig.AllowRegister =
      process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true';
    adminConfig.SiteConfig.ImageProxy =
      process.env.NEXT_PUBLIC_IMAGE_PROXY || '';

    fileConfig = runtimeConfig as unknown as ConfigFileStruct;
    const apiSiteEntries = Object.entries(fileConfig.api_site);
    const existed = new Set((adminConfig.SourceConfig || []).map((s) => s.key));
    apiSiteEntries.forEach(([key, site]) => {
      if (!existed.has(key)) {
        adminConfig!.SourceConfig.push({
          key,
          name: site.name,
          api: site.api,
          m3u8: site.m3u8,
          detail: site.detail,
          from: 'config',
          disabled: false,
        });
      }
    });

    const apiSiteMap = new Map(apiSiteEntries);
    adminConfig.SourceConfig.forEach((source) => {
      const site = apiSiteMap.get(source.key);
      if (site) {
        source.from = 'config';
        source.name = site.name;
        source.api = site.api;
        source.m3u8 = site.m3u8;
        source.detail = site.detail;
      } else if (source.from !== 'custom') {
        source.from = 'custom';
      }
    });
    cachedConfig = adminConfig;
  } else {
    await initConfig();
  }
  return cachedConfig;
}

export async function resetConfig() {
  const storage = getStorage();
  let userNames: string[] = [];
  if (storage && typeof (storage as any).getAllUsers === 'function') {
    try {
      userNames = await (storage as any).getAllUsers();
    } catch (e) {
      console.error('获取用户列表失败:', e);
    }
  }

  if (process.env.DOCKER_ENV === 'true') {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const _require = eval('require') as NodeRequire;
    const fs = _require('fs') as typeof import('fs');
    const path = _require('path') as typeof import('path');

    const configPath = path.join(process.cwd(), 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    fileConfig = JSON.parse(raw) as ConfigFileStruct;
    console.log('load dynamic config success');
  } else {
    fileConfig = runtimeConfig as unknown as ConfigFileStruct;
  }

  const configUsers = normalizeConfigUsers(fileConfig.users);
  const configUserRoleMap = new Map(
    configUsers.map((user) => [user.username, user.role])
  );
  const configUserNames = configUsers.map((user) => user.username);

  await ensureConfigUsersRegistered(storage, configUsers);

  configUserNames.forEach((uname) => {
    if (!userNames.includes(uname)) {
      userNames.push(uname);
    }
  });

  const apiSiteEntries = Object.entries(fileConfig.api_site);
  let allUsers: { username: string; role: 'user' | 'admin' | 'owner' }[] =
    userNames.map((uname) => ({
      username: uname,
      role: (configUserRoleMap.get(uname) ?? 'user') as 'user' | 'admin',
    }));
  const ownerUser = process.env.USERNAME;
  if (ownerUser) {
    allUsers = allUsers.filter((u) => u.username !== ownerUser);
    allUsers.unshift({
      username: ownerUser,
      role: 'owner',
    });
  }
  const adminConfig = {
    SiteConfig: {
      SiteName: process.env.SITE_NAME || 'EssaouiraTV',
      Announcement:
        process.env.ANNOUNCEMENT ||
        '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。',
      SearchDownstreamMaxPage:
        Number(process.env.NEXT_PUBLIC_SEARCH_MAX_PAGE) || 5,
      SiteInterfaceCacheTime: fileConfig.cache_time || 7200,
      ImageProxy: process.env.NEXT_PUBLIC_IMAGE_PROXY || '',
    },
    UserConfig: {
      AllowRegister: process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true',
      Users: allUsers as any,
    },
    SourceConfig: apiSiteEntries.map(([key, site]) => ({
      key,
      name: site.name,
      api: site.api,
      detail: site.detail,
      from: 'config',
      disabled: false,
    })),
  } as AdminConfig;

  if (storage && typeof (storage as any).setAdminConfig === 'function') {
    await (storage as any).setAdminConfig(adminConfig);
  }
  if (cachedConfig == null) {
    cachedConfig = adminConfig;
  }
  cachedConfig.SiteConfig = adminConfig.SiteConfig;
  cachedConfig.UserConfig = adminConfig.UserConfig;
  cachedConfig.SourceConfig = adminConfig.SourceConfig;
}

export async function getCacheTime(): Promise<number> {
  const config = await getConfig();
  return config.SiteConfig.SiteInterfaceCacheTime || 7200;
}

async function sortApiSitesByValuations(base: ApiSite[]): Promise<ApiSite[]> {
  if (!base || base.length === 0) return [];
  try {
    const valuations = await db.getAllSourceValuations();
    if (!valuations || valuations.length === 0) {
      return base;
    }
    const valMap = new Map<
      string,
      { qualityRank: number; speedValue: number; pingTime: number }
    >();
    valuations.forEach((v: any) => {
      const key = (v.key || v.source || '').trim();
      if (!key) return;
      const qualityRank = v.qualityRank ?? getQualityRank(v.quality);
      const speedValue = v.speedValue ?? parseSpeedToKBps(v.loadSpeed);
      const pingTime = Number.isFinite(v.pingTime)
        ? v.pingTime
        : Number.MAX_SAFE_INTEGER;
      valMap.set(key, { qualityRank, speedValue, pingTime });
    });

    const scored = base.map((site, index) => {
      const val =
        valMap.get(site.key) ||
        valMap.get(site.name) ||
        (site.api ? valMap.get(site.api) : undefined);
      return {
        site,
        qualityRank: val?.qualityRank ?? 0,
        speedValue: val?.speedValue ?? 0,
        pingTime: val?.pingTime ?? Number.MAX_SAFE_INTEGER,
        index,
      };
    });

    scored.sort((a, b) => {
      if (b.qualityRank !== a.qualityRank) return b.qualityRank - a.qualityRank;
      if (b.speedValue !== a.speedValue) return b.speedValue - a.speedValue;
      if (a.pingTime !== b.pingTime) return a.pingTime - b.pingTime;
      return a.index - b.index;
    });

    return scored.map((s) => s.site);
  } catch (error) {
    console.warn('Failed to sort API sites by valuations:', error);
    return base;
  }
}

export async function getAvailableApiSites(): Promise<ApiSite[]> {
  const config = await getConfig();
  const base = config.SourceConfig.filter(
    (s) => !s.disabled && !!s.api
  ).map((s) => ({
    key: s.key,
    name: s.name,
    api: s.api!,
    m3u8: s.m3u8,
    detail: s.detail,
  }));

  if (sortedApiSitesCache) {
    return sortedApiSitesCache;
  }

  if (!apiSiteOrderInitialized) {
    apiSiteOrderInitialized = true;
    sortedApiSitesCache = await sortApiSitesByValuations(base);
  }

  return sortedApiSitesCache || base;
}
