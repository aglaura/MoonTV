'use client';

import Link from 'next/link';

import { BackButton } from './BackButton';
import LanguageSelector from './LanguageSelector';
import { SettingsButton } from './SettingsButton';
import { useSite } from './SiteProvider';
import { ThemeToggle } from './ThemeToggle';
import UserBadge from './UserBadge';

interface MobileHeaderProps {
  showBackButton?: boolean;
}

const MobileHeader = ({ showBackButton = false }: MobileHeaderProps) => {
  const { siteName } = useSite();
  return (
    <header className='md:hidden relative w-full bg-white/70 backdrop-blur-xl border-b border-gray-200/50 shadow-sm dark:bg-gray-900/70 dark:border-gray-700/50'>
      <div className='h-12 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-4'>
        {/* 左侧：返回按钮和设置按钮 */}
        <div className='flex items-center gap-2'>
          {showBackButton && <BackButton />}
          <SettingsButton />
        </div>

        {/* 中间：站点名称（自动截断，避免与右侧重叠） */}
        <Link
          href='/'
          className='min-w-0 justify-self-center max-w-full flex items-center gap-2 truncate text-lg font-bold text-green-600 tracking-tight hover:opacity-80 transition-opacity'
        >
          <div className='w-8 h-8 rounded-lg overflow-hidden shadow-sm border border-white/60 dark:border-white/10 flex-shrink-0'>
            <picture>
              <source srcSet='/logo-dark.png' media='(prefers-color-scheme: dark)' />
              <img
                src='/logo.png'
                alt={siteName}
                className='w-full h-full object-cover'
              />
            </picture>
          </div>
          <span className='truncate'>{siteName}</span>
        </Link>

        {/* 右侧按钮 */}
        <div className='flex items-center gap-2 justify-self-end'>
          <UserBadge />
          <LanguageSelector variant='compact' />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
};

export default MobileHeader;
