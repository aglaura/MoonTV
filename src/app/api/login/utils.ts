import { AdminConfig } from '@/lib/admin.types';
import { getStorage } from '@/lib/db';

interface AuthCookiePayload {
  password?: string;
  username?: string;
  signature?: string;
  timestamp?: number;
}

export async function ensureAdminUser(
  username: string | undefined,
  config: AdminConfig,
  group?: string
): Promise<void> {
  if (
    !username ||
    username.toLowerCase() === 'guest' ||
    username === process.env.USERNAME ||
    (process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage') === 'localstorage'
  ) {
    return;
  }

  let changed = false;
  let user = config.UserConfig.Users.find((u) => u.username === username);

  if (!user) {
    user = {
      username,
      role: 'admin',
      group: group && group.trim().length > 0 ? group.trim() : 'family',
    };
    config.UserConfig.Users.push(user);
    changed = true;
  } else {
    if (user.role !== 'owner' && user.role !== 'admin') {
      user.role = 'admin';
      changed = true;
    }
    if (!user.group && group) {
      user.group = group;
      changed = true;
    }
  }

  if (changed) {
    const storage = getStorage() as {
      setAdminConfig?: (cfg: AdminConfig) => Promise<void> | void;
    };
    if (typeof storage?.setAdminConfig === 'function') {
      await storage.setAdminConfig(config);
    }
  }
}

async function generateSignature(
  data: string,
  secret: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(data);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function generateAuthCookie(
  username?: string,
  passwordOrSecret?: string,
  includePassword = false
): Promise<string> {
  const authData: AuthCookiePayload = {};

  if (includePassword && passwordOrSecret) {
    authData.password = passwordOrSecret;
  }

  const signingSecret =
    passwordOrSecret || process.env.PASSWORD || process.env.PASSWORD2;

  if (username && signingSecret) {
    authData.username = username;
    authData.signature = await generateSignature(username, signingSecret);
    authData.timestamp = Date.now();
  }

  return encodeURIComponent(JSON.stringify(authData));
}
