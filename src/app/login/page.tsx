/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<string[]>([]);
  const [userThumbnails, setUserThumbnails] = useState<Record<string, string>>({});
  const { siteName } = useSite();

  // 当 STORAGE_TYPE 不为空且不为 localstorage 时，要求输入用户名
  const shouldAskUsername =
    typeof window !== 'undefined' &&
    (window as any).RUNTIME_CONFIG?.STORAGE_TYPE &&
    (window as any).RUNTIME_CONFIG?.STORAGE_TYPE !== 'localstorage';

  // 是否允许注册
  const enableRegister =
    typeof window !== 'undefined' &&
    Boolean((window as any).RUNTIME_CONFIG?.ENABLE_REGISTER);

  useEffect(() => {
    if (!shouldAskUsername) {
      return;
    }

    let cancelled = false;

    const fetchUsers = async () => {
      try {
        const response = await fetch('/api/users', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }
        const data = await response.json();
        if (!cancelled && Array.isArray(data?.users)) {
          const normalizedUsersRaw = data.users.map(
            (user: { username?: string; avatar?: string }) => ({
              username: user.username?.trim(),
              avatar: user.avatar?.trim(),
            })
          );
          const normalizedUsers = normalizedUsersRaw.filter(
            (entry: { username?: string; avatar?: string }): entry is {
              username: string;
              avatar?: string;
            } => Boolean(entry.username)
          );

          setAvailableUsers(normalizedUsers.map((entry) => entry.username));
          const thumbnailMap: Record<string, string> = {};
          normalizedUsers.forEach((entry) => {
            if (entry.avatar) {
              thumbnailMap[entry.username] = entry.avatar;
            }
          });
          setUserThumbnails(thumbnailMap);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('加载可用用户失败:', err);
      }
    };

    fetchUsers();

    return () => {
      cancelled = true;
    };
  }, [shouldAskUsername]);

  useEffect(() => {
    if (!shouldAskUsername) return;
    if (availableUsers.length === 0) return;
    if (username && username.trim().length > 0) return;
    setUsername(availableUsers[0]);
  }, [availableUsers, shouldAskUsername, username]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!password || (shouldAskUsername && !username)) return;

    try {
      setLoading(true);
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          ...(shouldAskUsername ? { username } : {}),
        }),
      });

      if (res.ok) {
        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
      } else if (res.status === 401) {
        setError('密碼錯誤');
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '伺服器錯誤');
      }
    } catch (error) {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  // 处理注册逻辑
  const handleRegister = async () => {
    setError(null);
    if (!password || !username) return;

    try {
      setLoading(true);
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '伺服器錯誤');
      }
    } catch (error) {
      setError('網路錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'>
      <div className='absolute top-4 right-4'>
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-white/90 via-white/70 to-white/40 dark:from-zinc-900/90 dark:via-zinc-900/70 dark:to-zinc-900/40 backdrop-blur-xl shadow-2xl p-10 dark:border dark:border-zinc-800'>
        <h1 className='text-green-600 tracking-tight text-center text-3xl font-extrabold mb-8 bg-clip-text drop-shadow-sm'>
          {siteName}
        </h1>
        <form onSubmit={handleSubmit} className='space-y-8'>
          {shouldAskUsername && (
            <div>
              <label htmlFor='username' className='sr-only'>
                使用者名稱
              </label>
              <input
                id='username'
                type='text'
                list={
                  availableUsers.length > 0 ? 'login-user-options' : undefined
                }
                autoComplete='username'
                className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
                placeholder='輸入使用者名稱'
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              {availableUsers.length > 0 && (
                <>
                  <datalist id='login-user-options'>
                    {availableUsers.map((user) => (
                      <option key={user} value={user} />
                    ))}
                  </datalist>
                  <div className='mt-3 flex flex-wrap gap-3'>
                    {availableUsers.map((user) => {
                      const isActive =
                        user.toLowerCase() === username.toLowerCase();
                      const thumbnail = userThumbnails[user];
                      return (
                        <button
                          type='button'
                          key={user}
                          onClick={() => setUsername(user)}
                          className={`relative flex items-center gap-3 px-3 py-2 rounded-2xl text-xs sm:text-sm transition-colors border ${
                            isActive
                              ? 'border-green-500 bg-green-500/10 text-green-600'
                              : 'border-transparent bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700'
                          }`}
                          aria-pressed={isActive}
                        >
                          <span className='block w-10 h-10 rounded-full bg-gradient-to-br from-green-500/20 to-green-400/10 overflow-hidden flex items-center justify-center text-sm font-semibold text-green-600 dark:text-green-400 border border-green-500/30 shadow-inner'>
                            {thumbnail ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={thumbnail}
                                alt={user}
                                className='w-full h-full object-cover'
                              />
                            ) : (
                              user.charAt(0).toUpperCase()
                            )}
                          </span>
                          {user}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          <div>
            <label htmlFor='password' className='sr-only'>
              密碼
            </label>
            <input
              id='password'
              type='password'
              autoComplete='current-password'
              className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur'
              placeholder='輸入密碼...'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
          )}

          {/* 登录 / 注册按钮 */}
          {shouldAskUsername && enableRegister ? (
            <div className='flex gap-4'>
              <button
                type='button'
                onClick={handleRegister}
                disabled={!password || !username || loading}
                className='flex-1 inline-flex justify-center rounded-lg bg-blue-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {loading ? '註冊中...' : '註冊'}
              </button>
              <button
                type='submit'
                disabled={
                  !password || loading || (shouldAskUsername && !username)
                }
                className='flex-1 inline-flex justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:from-green-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50'
              >
                {loading ? '登入中...' : '登入'}
              </button>
            </div>
          ) : (
            <button
              type='submit'
              disabled={
                !password || loading || (shouldAskUsername && !username)
              }
              className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:from-green-600 hover:to-blue-600 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {loading ? '登入中...' : '登入'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div>載入中...</div>}>
      <LoginPageClient />
    </Suspense>
  );
}
