/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useEffect, useState } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

export default function UserBadge() {
  const [username, setUsername] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);

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

  if (!username) return null;

  return (
    <div
      className='max-w-[12rem] truncate px-3 py-1 rounded-full bg-white/80 dark:bg-gray-800/70 border border-gray-200/70 dark:border-gray-700/60 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-sm backdrop-blur flex items-center gap-2'
      title={`Logged in as ${username}`}
    >
      <span className='block w-6 h-6 rounded-full bg-gradient-to-br from-green-500/25 to-green-400/10 overflow-hidden flex items-center justify-center text-[10px] font-bold text-green-700 dark:text-green-300 border border-green-500/20'>
        {avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatar} alt={username} className='w-full h-full object-cover' />
        ) : (
          username.charAt(0).toUpperCase()
        )}
      </span>
      {username}
    </div>
  );
}
