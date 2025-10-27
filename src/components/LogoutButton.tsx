/* eslint-disable no-console */

'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';

export const LogoutButton: React.FC = () => {
  const [loading, setLoading] = useState(false);

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
      aria-label='登出'
    >
      <LogOut className='w-full h-full' />
    </button>
  );
};
