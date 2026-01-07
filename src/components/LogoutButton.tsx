/* eslint-disable no-console */

'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';

import { useUserLanguage } from '@/lib/userLanguage.client';

const t = (locale: string) => {
  switch (locale) {
    case 'zh-Hans':
      return '退出登录';
    case 'zh-Hant':
      return '登出';
    default:
      return 'Log out';
  }
};

export const LogoutButton: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const { userLocale } = useUserLanguage();
  const locale = userLocale || 'en';

  const handleLogout = async () => {
    if (loading) return;

    setLoading(true);

    try {
      // 調用註銷 API 來清除 cookie
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      console.error('登出請求失敗:', error);
    }

    window.location.reload();
  };

  return (
    <button
      onClick={handleLogout}
      className='w-10 h-10 p-2 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200/50 dark:text-gray-300 dark:hover:bg-gray-700/50 transition-colors'
      aria-label={t(locale)}
      title={t(locale)}
    >
      <LogOut className='w-full h-full' />
    </button>
  );
};
