/* eslint-disable @typescript-eslint/no-explicit-any, no-console, @typescript-eslint/no-non-null-assertion */

import { getStorage } from '@/lib/db';

import { AdminConfig } from './admin.types';
import runtimeConfig from './runtime';
import { IStorage } from './types';

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
};

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

// 在模块加载时根据环境决定配置来源
let fileConfig: ConfigFileStruct;
let cachedConfig: AdminConfig;

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

  const orderedUsers: { username: string; role: 'user' | 'admin' | 'owner' }[] =
    [];
  uniqueUsers.forEach((role, username) => {
    orderedUsers.push({ username, role });
  });

  const ownerUser = process.env.USERNAME?.trim();
  if (ownerUser) {
    const filtered = orderedUsers.filter((user) => user.username !== ownerUser);
    orderedUsers.length = 0;
    orderedUsers.push(...filtered);
    orderedUsers.unshift({
      username: ownerUser,
      role: 'owner',
    });
  }

  const apiSiteEntries = Object.entries(config?.api_site || {});

  return {
    SiteConfig: {
      SiteName: process.env.SITE_NAME || 'MoonTV',
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
    // 默认使用编译时生成的配置
    fileConfig = runtimeConfig as unknown as ConfigFileStruct;
  }

  const configUsers = normalizeConfigUsers(fileConfig.users);
  const configUserRoleMap = new Map(
    configUsers.map((user) => [user.username, user.role])
  );
  const configUserNames = configUsers.map((user) => user.username);

  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType !== 'localstorage') {
    // 数据库存储，读取并补全管理员配置
    let storage: IStorage | null = null;
    try {
      storage = getStorage();
    } catch (error) {
      console.error('获取存储实例失败:', error);
    }

    await ensureConfigUsersRegistered(storage, configUsers);

    let userNames: string[] = [];
    try {
      // 尝试从数据库获取管理员配置
      let adminConfig: AdminConfig | null = null;
      if (storage && typeof (storage as any).getAdminConfig === 'function') {
        adminConfig = await (storage as any).getAdminConfig();
      }

      // 获取所有用户名，用于补全 Users
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

      // 从文件中获取源信息，用于补全源
      const apiSiteEntries = Object.entries(fileConfig.api_site);

      if (adminConfig) {
        // 补全 SourceConfig
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

        // 检查现有源是否在 fileConfig.api_site 中，如果不在则标记为 custom
        const apiSiteKeys = new Set(apiSiteEntries.map(([key]) => key));
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
            if (user.role === 'owner') {
              return user;
            }
            const targetRole = configUserRoleMap.get(user.username);
            return targetRole && user.role !== targetRole
              ? { ...user, role: targetRole }
              : user;
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
            });
            existedUsers.add(cfg.username);
          }
        });

        userNames.forEach((uname) => {
          if (!existedUsers.has(uname)) {
            adminConfig!.UserConfig.Users.push({
              username: uname,
              role: configUserRoleMap.get(uname) ?? 'user',
            });
            existedUsers.add(uname);
          }
        });
        // 站长
        const ownerUser = process.env.USERNAME;
        if (ownerUser) {
          adminConfig!.UserConfig.Users = adminConfig!.UserConfig.Users.filter(
            (u) => u.username !== ownerUser
          );
          adminConfig!.UserConfig.Users.unshift({
            username: ownerUser,
            role: 'owner',
          });
        }
      } else {
        // 数据库中没有配置，创建新的管理员配置
        let allUsers: {
          username: string;
          role: 'user' | 'admin' | 'owner';
        }[] = userNames.map((uname) => ({
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
        adminConfig = {
          SiteConfig: {
            SiteName: process.env.SITE_NAME || 'MoonTV',
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

      // 写回数据库（更新/创建）
      if (storage && typeof (storage as any).setAdminConfig === 'function') {
        await (storage as any).setAdminConfig(adminConfig);
      }

      // 更新缓存
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
      }));
      cachedConfig = buildAdminConfigFromFile(fileConfig, fallbackUsers);
    }
  } else {
    // 本地存储直接使用文件配置
    cachedConfig = buildAdminConfigFromFile(fileConfig);
  }
}

export async function getConfig(): Promise<AdminConfig> {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (process.env.DOCKER_ENV === 'true' || storageType === 'localstorage') {
    await initConfig();
    return cachedConfig;
  }
  // 非 docker 环境且 DB 存储，直接读 db 配置
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
    // 合并一些环境变量配置
    adminConfig.SiteConfig.SiteName = process.env.SITE_NAME || 'MoonTV';
    adminConfig.SiteConfig.Announcement =
      process.env.ANNOUNCEMENT ||
      '本网站仅提供影视信息搜索服务，所有内容均来自第三方网站。本站不存储任何视频资源，不对任何内容的准确性、合法性、完整性负责。';
    adminConfig.UserConfig.AllowRegister =
      process.env.NEXT_PUBLIC_ENABLE_REGISTER === 'true';
    adminConfig.SiteConfig.ImageProxy =
      process.env.NEXT_PUBLIC_IMAGE_PROXY || '';

    // 合并文件中的源信息
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

    // 同步配置中的源信息，如果不存在则标记为 custom
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
    // DB 无配置，执行一次初始化
    await initConfig();
  }
  return cachedConfig;
}

export async function resetConfig() {
  const storage = getStorage();
  // 获取所有用户名，用于补全 Users
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
    // 默认使用编译时生成的配置
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

  // 从文件中获取源信息，用于补全源
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
      SiteName: process.env.SITE_NAME || 'MoonTV',
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
    // serverless 环境，直接使用 adminConfig
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

export async function getAvailableApiSites(): Promise<ApiSite[]> {
  const config = await getConfig();
  return config.SourceConfig.filter(
    (s) => !s.disabled && !!s.api
  ).map((s) => ({
    key: s.key,
    name: s.name,
    api: s.api!,
    m3u8: s.m3u8,
    detail: s.detail,
  }));
}
