/* eslint-disable react-hooks/exhaustive-deps */
'use client';

import { BackButton } from './BackButton';
import LanguageSelector from './LanguageSelector';
import MobileBottomNav from './MobileBottomNav';
import MobileHeader from './MobileHeader';
import { SettingsButton } from './SettingsButton';
import Sidebar from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import UserBadge from './UserBadge';
import { useEffect, useRef } from 'react';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
}

const PageLayout = ({ children, activePath = '/' }: PageLayoutProps) => {
  const startYRef = useRef<number | null>(null);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 1024) return; // only mobile/tablet
      if (window.scrollY > 0) return;
      const touch = e.touches[0];
      startYRef.current = touch.clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (startYRef.current === null) return;
      if (window.scrollY > 0) return;
      const currentY = e.touches[0].clientY;
      const delta = currentY - startYRef.current;
      if (delta > 90) {
        refreshingRef.current = true;
        window.location.reload();
      }
    };

    const handleTouchEnd = () => {
      startYRef.current = null;
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <div className='w-full min-h-screen'>
      {/* 移动端头部 */}
      <MobileHeader showBackButton={['/play'].includes(activePath)} />

      {/* 主要布局容器 */}
      <div className='flex md:grid md:grid-cols-[auto_1fr] w-full min-h-screen md:min-h-auto'>
        {/* 侧边栏 - 桌面端显示，移动端隐藏 */}
        <div className='hidden md:block'>
          <Sidebar activePath={activePath} />
        </div>

        {/* 主内容区域 */}
        <div className='relative min-w-0 flex-1 transition-all duration-300'>
          {/* 桌面端左上角返回按钮 */}
          {['/play'].includes(activePath) && (
            <div className='absolute top-3 left-1 z-20 hidden md:flex'>
              <BackButton />
            </div>
          )}

          {/* 桌面端顶部按钮 */}
          <div className='absolute top-2 right-4 z-20 hidden md:flex items-center gap-2'>
            <SettingsButton />
            <LanguageSelector variant='compact' />
            <UserBadge />
            <ThemeToggle />
          </div>

          {/* 主内容 */}
          <main
            className='flex-1 md:min-h-0 mb-14 md:mb-0'
            style={{
              paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom))',
            }}
          >
            {children}
          </main>
        </div>
      </div>

      {/* 移动端底部导航 */}
      <div className='md:hidden'>
        <MobileBottomNav activePath={activePath} />
      </div>
    </div>
  );
};

export default PageLayout;
