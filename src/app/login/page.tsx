/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { FormEvent } from 'react';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';

import LanguageSelector from '@/components/LanguageSelector';
import { useSite } from '@/components/SiteProvider';
import { ThemeToggle } from '@/components/ThemeToggle';

type UiLocale = 'en' | 'zh-Hans' | 'zh-Hant';

function resolveUiLocale(): UiLocale {
  try {
    const saved =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('userLocale')
        : null;
    if (saved === 'en' || saved === 'zh-Hans' || saved === 'zh-Hant') {
      return saved;
    }
  } catch {
    // ignore
  }

  const nav =
    typeof navigator !== 'undefined' ? (navigator.language || '') : '';
  const lower = nav.toLowerCase();
  if (lower.startsWith('zh-cn') || lower.startsWith('zh-hans')) return 'zh-Hans';
  if (
    lower.startsWith('zh-tw') ||
    lower.startsWith('zh-hant') ||
    lower.startsWith('zh-hk')
  ) {
    return 'zh-Hant';
  }
  return 'en';
}

function tt(en: string, zhHans: string, zhHant: string): string {
  const locale = resolveUiLocale();
  if (locale === 'zh-Hans') return zhHans;
  if (locale === 'zh-Hant') return zhHant;
  return en;
}

function LoginPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { siteName } = useSite();

  const [group, setGroup] = useState<string>('family');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [availableUsers, setAvailableUsers] = useState<string[]>([]);
  const [userThumbnails, setUserThumbnails] = useState<Record<string, string>>(
    {}
  );
  const [requiresSelection, setRequiresSelection] = useState(false);
  const [storageRequiresSelection, setStorageRequiresSelection] =
    useState(false);
  const [pendingUser, setPendingUser] = useState<string | null>(null);
  const [autoSelectPending, setAutoSelectPending] = useState(false);
  const [stage, setStage] = useState<'group' | 'password'>('group');
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const [groupOptions, setGroupOptions] = useState<string[]>(['family', 'guest']);

  useEffect(() => {
    // Changing group resets selection flow
    setError(null);
    setRequiresSelection(false);
    setAvailableUsers([]);
    setUserThumbnails({});
    setPendingUser(null);
    setAutoSelectPending(false);
    if (group === 'guest') {
      setUsername('guest');
    } else {
      setUsername('');
    }
  }, [group]);

  useEffect(() => {
    let cancelled = false;
    const loadGroups = async () => {
      try {
        const resp = await fetch('/api/users', { cache: 'no-store' });
        if (!resp.ok) return;
        const data = await resp.json();
        const groups =
          Array.isArray(data?.users) && data.users.length > 0
            ? data.users
                .map(
                  (u: { group?: string }) =>
                    (typeof u?.group === 'string' && u.group.trim()) || ''
                )
                .filter(Boolean)
            : [];
        const merged = Array.from(
          new Set(['family', 'guest', ...groups].filter(Boolean))
        );
        if (!cancelled) setGroupOptions(merged);
      } catch {
        // ignore
      }
    };
    loadGroups();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!requiresSelection) return;

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
            (user: {
              username?: string;
              avatar?: string;
              group?: 'family' | 'guest';
            }) => ({
              username: user.username?.trim(),
              avatar: user.avatar?.trim(),
              group: user.group === 'guest' ? 'guest' : 'family',
            })
          );
          const normalizedUsers = normalizedUsersRaw.filter(
            (
              entry: {
                username?: string;
                avatar?: string;
                group?: 'family' | 'guest';
              }
            ): entry is {
              username: string;
              avatar?: string;
              group: 'family' | 'guest';
            } => Boolean(entry.username)
          );
          const filtered = normalizedUsers.filter(
            (entry: { group: 'family' | 'guest' }) => entry.group === group
          );

          const finalList =
            filtered.length > 0
              ? filtered
              : group === 'guest'
              ? [{ username: 'guest', avatar: '', group: 'guest' as const }]
              : filtered;

          setAvailableUsers(
            finalList.map((entry: { username: string }) => entry.username)
          );
          const thumbnailMap: Record<string, string> = {};
          finalList.forEach(
            (entry: { username: string; avatar?: string }) => {
            if (entry.avatar) {
              thumbnailMap[entry.username] = entry.avatar;
            }
            }
          );
          setUserThumbnails(thumbnailMap);
        }
      } catch (err) {
        // console.warn('加载可用用户失败:', err);
      }
    };

    fetchUsers();
    return () => {
      cancelled = true;
    };
  }, [requiresSelection, group]);

  useEffect(() => {
    if (!requiresSelection) return;
    if (availableUsers.length === 0) return;
    if (username && username.trim().length > 0) return;
    setUsername(availableUsers[0]);
    setStage('password');
  }, [availableUsers, requiresSelection, username, group]);

  useEffect(() => {
    if (stage === 'password' && passwordRef.current) {
      passwordRef.current.focus();
    }
  }, [stage]);

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (stage === 'group') {
        setStage('password');
        return;
      }

      if (!password) {
        setError(
          tt(
            'Please enter the shared password',
            '请输入共享密码',
            '請輸入共享密碼'
          )
        );
        return;
      }

      setError(null);
      setLoading(true);
      setPendingUser(null);

      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            password,
            group,
          }),
        });

        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          requiresSelection?: boolean;
        };

        if (!res.ok) {
          if (res.status === 401) {
            setError(
              tt(
                'Incorrect shared password',
                '共享密码错误',
                '共享密碼錯誤'
              )
            );
          } else {
            setError(
              data.error ??
                tt('Login failed', '登录失败', '登入失敗')
            );
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
        setError(
          tt(
            'Network error. Please try again later.',
            '网络错误，请稍后再试。',
            '網路錯誤，請稍後再試'
          )
        );
        setRequiresSelection(false);
        setAutoSelectPending(false);
      } finally {
        setLoading(false);
      }
    },
    [password, group, router, searchParams, storageRequiresSelection, stage]
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
          setError(
            data.error ??
              tt(
                'Failed to select user',
                '选择用户失败',
                '選擇使用者失敗'
              )
          );
          return;
        }

        const redirect = searchParams.get('redirect') || '/';
        router.replace(redirect);
      } catch (err) {
        setError(
          tt(
            'Network error. Please try again later.',
            '网络错误，请稍后再试。',
            '網路錯誤，請稍後再試'
          )
        );
      } finally {
        setLoading(false);
        setPendingUser(null);
      }
    },
    [router, searchParams]
  );

  useEffect(() => {
    if (!requiresSelection) return;
    if (loading) return;
    if (pendingUser) return;
    if (availableUsers.length === 1) {
      const target = availableUsers[0];
      setUsername(target);
      void handleUserSelect(target);
    }
  }, [
    requiresSelection,
    availableUsers,
    loading,
    pendingUser,
    handleUserSelect,
  ]);

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
      <div className='absolute top-4 right-4 flex items-center gap-2'>
        <LanguageSelector variant='compact' />
        <ThemeToggle />
      </div>
      <div className='relative z-10 w-full max-w-md px-6 sm:px-8 py-10 space-y-6'>
        <h1 className='text-green-600 tracking-tight text-center text-3xl font-extrabold mb-8 bg-clip-text drop-shadow-sm'>
          {siteName}
        </h1>
        {stage === 'group' && (
          <div
            className='grid grid-cols-2 gap-6 mb-6'
            role='radiogroup'
            aria-label={tt('Choose group', '选择组别', '選擇組別')}
          >
            {groupOptions.map((key) => {
              const active = group === key;
              const label =
                key === 'guest'
                  ? tt('Guest group', '访客组', '訪客組')
                  : key === 'family'
                  ? tt('Family group', '家庭组', '家庭組')
                  : key;
              const desc =
                key === 'guest'
                  ? tt('PASSWORD2', '使用 PASSWORD2', '使用 PASSWORD2')
                  : tt('PASSWORD', '使用 PASSWORD', '使用 PASSWORD');
              return (
                <button
                  key={key}
                  type='button'
                  role='radio'
                  aria-checked={active}
                  tabIndex={0}
                  onClick={() => {
                    setGroup(key);
                    setError(null);
                    setRequiresSelection(false);
                    setStage('password');
                  }}
                  className={`flex flex-col items-center gap-3 text-sm font-semibold transition focus:outline-none ${
                    active
                      ? 'text-green-700 dark:text-green-200'
                      : 'text-gray-800 hover:text-green-600 dark:text-gray-100 dark:hover:text-green-300'
                  }`}
                >
                  <span
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-lg font-bold shadow-inner transition-transform ${
                      active
                        ? 'bg-green-500 text-white scale-105'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                    }`}
                  >
                    {(key || '?').charAt(0).toUpperCase()}
                  </span>
                  <span className='text-base leading-tight text-center'>
                    {label}
                  </span>
                  <span className='text-[11px] text-gray-500 dark:text-gray-400'>
                    {desc}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {stage === 'group' && (
          <div className='text-sm text-gray-600 dark:text-gray-300 mb-3'>
            {tt(
              'Select a group to continue.',
              '请选择组别后再继续。',
              '請先選擇組別後再繼續。'
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className='space-y-6'>
          {stage === 'password' && (
            <>
              <div>
                <label htmlFor='password' className='sr-only'>
                  {tt('Password', '密码', '密碼')}
                </label>
                <input
                  id='password'
                  type='password'
                  autoComplete='current-password'
                  disabled={requiresSelection}
                  ref={passwordRef}
                  className='block w-full rounded-lg border-0 py-3 px-4 text-gray-900 dark:text-gray-100 shadow-sm ring-1 ring-white/60 dark:ring-white/20 placeholder:text-gray-500 dark:placeholder:text-gray-400 focus:ring-2 focus:ring-green-500 focus:outline-none sm:text-base bg-white/60 dark:bg-zinc-800/60 backdrop-blur disabled:opacity-70'
                  placeholder={
                    group === 'guest'
                      ? tt(
                          'Enter guest password (PASSWORD2)…',
                          '输入访客密码（PASSWORD2）…',
                          '輸入訪客密碼（PASSWORD2）…'
                        )
                      : tt(
                          'Enter family password…',
                          '输入家庭共享密码…',
                          '輸入家庭共享密碼...'
                        )
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
                  {tt(
                    'Family uses PASSWORD; Guest uses PASSWORD2.',
                    '家庭使用 PASSWORD；访客使用 PASSWORD2。',
                    '家庭使用 PASSWORD；訪客使用 PASSWORD2。'
                  )}
                </p>
              </div>

              {error && (
                <p className='text-sm text-red-600 dark:text-red-400'>
                  {error}
                </p>
              )}

              {!requiresSelection && (
                <button
                  type='submit'
                  disabled={!password || loading}
                  className='inline-flex w-full justify-center rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-lg transition-all duration-200 hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50'
                >
                  {loading
                    ? tt('Logging in…', '登录中…', '登入中...')
                    : tt('Log in', '登录', '登入')}
                </button>
              )}
            </>
          )}
        </form>

        {requiresSelection && (
          <div className='mt-6 space-y-4'>
            <p className='text-sm text-gray-600 dark:text-gray-300'>
              {tt(
                'Select a user to log in',
                '选择要登录的用户',
                '選擇要登入的使用者'
              )}
            </p>
            <div
              className='flex flex-col gap-3'
              role='radiogroup'
              aria-label={tt(
                'Available users',
                '可登录的用户',
                '可登入的使用者'
              )}
            >
              {availableUsers.length === 0 && (
                <p className='text-xs text-gray-500 dark:text-gray-400'>
                  {tt(
                    'No other users are set up yet',
                    '尚未设置其他用户',
                    '尚未設定其他使用者'
                  )}
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
                        {tt('Logging in…', '登录中…', '登入中...')}
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
    <Suspense
      fallback={
        <div>{tt('Loading…', '加载中…', '載入中...')}</div>
      }
    >
      <LoginPageClient />
    </Suspense>
  );
}
