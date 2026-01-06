/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { useEffect, useState } from 'react';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';

export default function UserBadge() {
  const [username, setUsername] = useState<string | null>(null);

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

  if (!username) return null;

  return (
    <div
      className='max-w-[12rem] truncate px-3 py-1 rounded-full bg-white/80 dark:bg-gray-800/70 border border-gray-200/70 dark:border-gray-700/60 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-sm backdrop-blur'
      title={`Logged in as ${username}`}
    >
      {username}
    </div>
  );
}

