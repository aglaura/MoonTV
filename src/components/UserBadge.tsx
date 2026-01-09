/* eslint-disable react-hooks/exhaustive-deps, simple-import-sort/imports */
'use client';

import { Menu, Transition } from '@headlessui/react';
import { Fragment, useEffect, useState } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { useUserLanguage } from '@/lib/userLanguage.client';

const t = (key: 'loggedInAs', locale: string) => {
  switch (locale) {
    case 'zh-Hans':
      return '当前用户';
    case 'zh-Hant':
      return '目前使用者';
    default:
      return 'Logged in as';
  }
};

const logoutLabel = (locale: string) => {
  switch (locale) {
    case 'zh-Hans':
      return '退出登录';
    case 'zh-Hant':
      return '登出';
    default:
      return 'Log out';
  }
};

const switchUserLabel = (locale: string) => {
  switch (locale) {
    case 'zh-Hans':
      return '切换账号';
    case 'zh-Hant':
      return '切換帳號';
    default:
      return 'Switch user';
  }
};

export default function UserBadge() {
  const [username, setUsername] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const { userLocale } = useUserLanguage();

  useEffect(() => {
    const read = () => {
      const auth = getAuthInfoFromBrowserCookie();
      const uname = auth?.username?.trim();
      setUsername(uname && uname.length > 0 ? uname : null);
    };
    read();
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, []);

  useEffect(() => {
    if (!username) {
      setAvatar(null);
      return;
    }

    let cancelled = false;
    const loadAvatar = async () => {
      try {
        const resp = await fetch('/api/users', { cache: 'no-store' });
        if (!resp.ok) return;
        const data = await resp.json().catch(() => ({}));
        const users = Array.isArray(data?.users) ? data.users : [];
        const match = users.find(
          (u: { username?: string; avatar?: string }) =>
            (u.username || '').trim() === username
        );
        const next = match?.avatar?.trim();
        if (!cancelled) {
          setAvatar(next && next.length > 0 ? next : null);
        }
      } catch {
        if (!cancelled) setAvatar(null);
      }
    };

    loadAvatar();
    return () => {
      cancelled = true;
    };
  }, [username]);

  const performLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // ignore
    }
  };

  const handleLogout = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await performLogout();
    window.location.reload();
  };

  const handleSwitchUser = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await performLogout();
    const redirect = typeof window !== 'undefined' ? window.location.href : '/';
    window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
  };

  if (!username) return null;

  return (
    <Menu as='div' className='relative'>
      <Menu.Button
        title={`${t('loggedInAs', userLocale || 'en')} ${username}`}
        className='max-w-[14rem] truncate pl-2 pr-1 py-1 rounded-full bg-white/80 dark:bg-gray-800/70 border border-gray-200/70 dark:border-gray-700/60 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-sm backdrop-blur flex items-center gap-2 cursor-pointer select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-1'
      >
        <span className='block w-6 h-6 rounded-full bg-gradient-to-br from-green-500/25 to-green-400/10 overflow-hidden flex items-center justify-center text-[10px] font-bold text-green-700 dark:text-green-300 border border-green-500/20'>
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt={username} className='w-full h-full object-cover' />
          ) : (
            username.charAt(0).toUpperCase()
          )}
        </span>
        <span className='truncate hidden sm:inline'>{username}</span>
      </Menu.Button>

      <Transition
        as={Fragment}
        enter='transition ease-out duration-150'
        enterFrom='opacity-0 translate-y-1'
        enterTo='opacity-100 translate-y-0'
        leave='transition ease-in duration-100'
        leaveFrom='opacity-100 translate-y-0'
        leaveTo='opacity-0 translate-y-1'
      >
        <Menu.Items className='absolute top-full right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-2 py-2 z-50 min-w-[9rem] space-y-2 focus:outline-none'>
          <Menu.Item>
            {({ active }) => (
              <button
                onClick={handleSwitchUser}
                className={`w-full text-left text-xs ${
                  active
                    ? 'text-green-700 dark:text-green-300'
                    : 'text-gray-700 dark:text-gray-200'
                }`}
              >
                {switchUserLabel(userLocale || 'en')}
              </button>
            )}
          </Menu.Item>
          <Menu.Item>
            {({ active }) => (
              <button
                onClick={handleLogout}
                className={`w-full text-left text-xs ${
                  active
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {logoutLabel(userLocale || 'en')}
              </button>
            )}
          </Menu.Item>
        </Menu.Items>
      </Transition>
    </Menu>
  );
}
