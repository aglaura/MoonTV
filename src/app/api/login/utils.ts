import { getStorage } from '@/lib/db';
import { AdminConfig } from '@/lib/admin.types';

export async function ensureAdminUser(
  username: string | undefined,
  config: AdminConfig
): Promise<void> {
  if (
    !username ||
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
    };
    config.UserConfig.Users.push(user);
    changed = true;
  } else if (user.role !== 'owner' && user.role !== 'admin') {
    user.role = 'admin';
    changed = true;
  }

  if (changed) {
    const storage = getStorage();
    if (storage && typeof (storage as any).setAdminConfig === 'function') {
      await (storage as any).setAdminConfig(config);
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
  password?: string,
  includePassword = false
): Promise<string> {
  const authData: any = {};

  if (includePassword && password) {
    authData.password = password;
  }

  if (username && process.env.PASSWORD) {
    authData.username = username;
    const signature = await generateSignature(username, process.env.PASSWORD);
    authData.signature = signature;
    authData.timestamp = Date.now();
  }

  return encodeURIComponent(JSON.stringify(authData));
}
