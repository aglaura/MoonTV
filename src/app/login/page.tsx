/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';

import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { siteName } = useSite();

  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<string[]>([]);
  const [userThumbnails, setUserThumbnails] = useState<Record<string, string>>({});
  const [requiresSelection, setRequiresSelection] = useState(false);
  const [storageRequiresSelection, setStorageRequiresSelection] =
    useState(false);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [autoSelectPending, setAutoSelectPending] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const type = (window as any).RUNTIME_CONFIG?.STORAGE_TYPE;
    setStorageRequiresSelection(Boolean(type && type !== 'localstorage'));
  }, []);

  useEffect(() => {
    if (!storageRequiresSelection) return;

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

          setAvailableUsers(
            normalizedUsers.map((entry: { username: string }) => entry.username)
          );
          const thumbnailMap: Record<string, string> = {};
          normalizedUsers.forEach(
            (entry: { username: string; avatar?: string }) => {
              if (entry.avatar) {
                thumbnailMap[entry.username] = entry.avatar;
              }
            }
          );
          setUserThumbnails(thumbnailMap);
        }
      } catch (err) {
        console.warn('加载可用用户失败:', err);
      }
    };

    fetchUsers();
    return () => {
      cancelled = true;
    };
  }, [storageRequiresSelection]);

  useEffect(() => {
    if (!requiresSelection) return;
    if (availableUsers.length === 0) return;
    if (username && username.trim().length > 0) return;
    setUsername(availableUsers[0]);
  }, [availableUsers, requiresSelection, username]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!password) {
        setError('請輸入共享密碼');
        return;
      }

      setError(null);
      setLoading(true);
      setPendingUser(null);

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password }),
        });

        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          requiresSelection?: boolean;
        };

        if (!res.ok) {
          if (res.status === 401) {
            setError('共享密碼錯誤');
          } else {
            setError(data.error ?? '登入失敗');
          }
          setRequiresSelection(false);
          setAutoSelectPending(false);
          return;
        }

        const redirectTarget = searchParams.get('redirect') || '/';
        const requiresUserSelection = Boolean(data?.requiresSelection);

        if (requiresUserSelection) {
          setRequiresSelection(true);
          if (!storageRequiresSelection) {
            setStorageRequiresSelection(true);
          }
          setAutoSelectPending(redirectTarget.startsWith('/admin'));
          return;
        }

        setRequiresSelection(false);
        setAutoSelectPending(false);
        router.replace(redirectTarget);
      } catch (err) {
        setError('網路錯誤，請稍後再試');
        setRequiresSelection(false);
        setAutoSelectPending(false);
      } finally {
        setLoading(false);
      }
    },
    [password, router, searchParams, storageRequiresSelection]
  );

  const handleUserSelect = useCallback(
    async (user: string) => {
      setError(null);
      setPendingUser(user);
      try {
        setLoading(true);
        const res = await fetch('/api/login/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: user }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(data.error ?? '選擇使用者失敗');
          return;
        }

        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
      } catch (err) {
        setError('網路錯誤，請稍後再試');
      } finally {
        setLoading(false);
        setPendingUser(null);
      }
    },
    [router, searchParams]
  );

  useEffect(() => {
    if (
      requiresSelection &&
      autoSelectPending &&
      availableUsers.length > 0 &&
      !loading
    ) {
      const user = availableUsers[0];
      setUsername(user);
      void handleUserSelect(user);
      setAutoSelectPending(false);
    }
  }, [
    requiresSelection,
    autoSelectPending,
    availableUsers,
    loading,
    handleUserSelect,
  ]);

  return (
    <div className='relative min-h-screen flex items-center justify-center px-4 overflow-hidden'>
      <div className='absolute top-4 right-4'>
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md rounded-3xl bg-gradient-to-b from-white/90 via-white/70 to-white/40 dark:from-zinc-900/90 dark:via-zinc-900/70 dark:to-zinc-900/40 backdrop-blur-xl shadow-2xl p-10 dark:border dark:border-zinc-800'>
        <h1 className='text-green-600 tracking-tight text-center text-3xl font-extrabold mb-8 bg-clip-text drop-shadow-sm'>
          {siteName}
        </h1>
        <form onSubmit={handleSubmit} className='space-y-6'>
          <div>
            <label htmlFor='password' className='sr-only'>
              密碼
            </label>
            <input
              id='password'
              type='password'
              autoComplete='current-password'
              disabled={requiresSelection}
              className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur disabled:opacity-70'
              placeholder='輸入共享密碼...'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <p className='text-sm text-red-600 dark:text-red-400'>{error}</p>
          )}

          {!requiresSelection && (
            <button
              type='submit'
              disabled={!password || loading}
              className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {loading ? '登入中...' : '登入'}
            </button>
          )}
        </form>

        {requiresSelection && (
          <div className='mt-6 space-y-4'>
            <p className='text-sm text-gray-600 dark:text-gray-300'>
              選擇要登入的使用者
            </p>
            <div
              className='flex flex-col gap-3'
              role='radiogroup'
              aria-label='可登入的使用者'
            >
              {availableUsers.length === 0 && (
                <p className='text-xs text-gray-500 dark:text-gray-400'>
                  尚未設定其他使用者
                </p>
              )}
              {availableUsers.map((user) => {
                const thumbnail = userThumbnails[user];
                const isPending = pendingUser === user && loading;
                return (
                  <button
                    key={user}
                    type='button'
                    onClick={() => handleUserSelect(user)}
                    disabled={loading}
                    role='radio'
                    aria-checked={pendingUser ? pendingUser === user : false}
                    className='relative flex items-center justify-between gap-4 rounded-3xl border-2 border-transparent bg-gray-100 text-gray-700 px-5 py-4 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed hover:border-green-400 hover:bg-green-50 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700'
                    >
                    <div className='flex items-center gap-4'>
                      <span className='block w-14 h-14 rounded-full bg-gradient-to-br from-green-500/20 to-green-400/10 overflow-hidden flex items-center justify-center text-lg font-semibold text-green-600 dark:text-green-400 border border-green-500/30 shadow-inner'>
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
                      <span className='text-base font-semibold'>{user}</span>
                    </div>
                    <span
                      className={`ml-auto flex h-6 w-6 items-center justify-center rounded-full border-2 ${
                        pendingUser === user
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-gray-400 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    {isPending && (
                      <span className='absolute inset-0 flex items-center justify-center rounded-3xl bg-black/10 dark:bg-black/20 text-xs text-white'>
                        登入中...
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
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
