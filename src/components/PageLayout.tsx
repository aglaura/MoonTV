'use client';

import { useEffect } from 'react';
import { useDeviceInfo } from '@/lib/screenMode';
import { useTvFullscreen } from '@/lib/tvFullscreen';
import { BackButton } from './BackButton';
import LanguageSelector from './LanguageSelector';
import MobileBottomNav from './MobileBottomNav';
import MobileHeader from './MobileHeader';
import { SettingsButton } from './SettingsButton';
import Sidebar from './Sidebar';
import SidebarTV from './SidebarTV';
import TvInputProvider from './TvInputProvider';
import { ThemeToggle } from './ThemeToggle';
import UserBadge from './UserBadge';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  hideTopBar?: boolean;
  topBarModeLabel?: React.ReactNode;
  onTopBarModeClick?: () => void;
}

const PageLayout = ({
  children,
  activePath = '/',
  hideTopBar = false,
  topBarModeLabel,
  onTopBarModeClick,
}: PageLayoutProps) => {
  const { screenMode } = useDeviceInfo();
  const isTV = screenMode === 'tv';
  const showSidebar = !hideTopBar && isTV;

  useTvFullscreen(isTV);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (isTV) {
      root.classList.add('tv-mode', 'tv-cursor-hidden');
    } else {
      root.classList.remove('tv-mode', 'tv-cursor-hidden');
    }
    return () => {
      root.classList.remove('tv-mode', 'tv-cursor-hidden');
    };
  }, [isTV]);

  return (
    <TvInputProvider enabled={isTV}>
      <div className='w-full min-h-screen'>
        {/* 移动端头部 */}
        {!hideTopBar && (
          <MobileHeader showBackButton={['/play'].includes(activePath)} />
        )}

        {/* 主要布局容器 */}
        <div
          className={`flex w-full min-h-screen md:min-h-auto ${
            showSidebar ? 'md:grid md:grid-cols-[auto_1fr]' : 'md:block'
          }`}
        >
          {/* 侧边栏 - 桌面端显示，移动端隐藏 */}
          {showSidebar && (
            <div className='hidden md:block'>
              {isTV ? (
                <SidebarTV
                  activePath={activePath}
                  modeLabel={topBarModeLabel}
                  onModeClick={onTopBarModeClick}
                />
              ) : (
                <Sidebar activePath={activePath} />
              )}
            </div>
          )}

          {/* 主内容区域 */}
          <div
            className={`relative min-w-0 flex-1 transition-all duration-300 ${
              showSidebar ? 'md:pl-16' : ''
            }`}
          >
            {/* 桌面端左上角返回按钮 */}
            {['/play'].includes(activePath) && !hideTopBar && (
              <div className='absolute top-3 left-3 z-20 hidden md:flex items-center gap-3'>
                <div className='bg-white/85 dark:bg-gray-900/75 backdrop-blur-md rounded-full shadow-sm border border-gray-200/70 dark:border-gray-700/70 p-1 scale-90'>
                  <BackButton />
                </div>
                <div className='w-12' aria-hidden='true' />
              </div>
            )}

            {/* 桌面端顶部按钮 */}
            {!hideTopBar && !isTV && (
              <div className='absolute top-2 right-4 z-20 hidden md:flex items-center gap-2'>
                {topBarModeLabel && (
                  <>
                    {onTopBarModeClick ? (
                      <button
                        type='button'
                        onClick={onTopBarModeClick}
                        className='rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide border border-emerald-500/30 hover:bg-emerald-500/25 transition'
                      >
                        {topBarModeLabel}
                      </button>
                    ) : (
                      <span className='rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide border border-emerald-500/30'>
                        {topBarModeLabel}
                      </span>
                    )}
                  </>
                )}
                <SettingsButton />
                <LanguageSelector variant='compact' />
                <UserBadge />
                <ThemeToggle />
              </div>
            )}

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
        {!hideTopBar && (
          <div className='md:hidden'>
            <MobileBottomNav activePath={activePath} />
          </div>
        )}
      </div>
    </TvInputProvider>
  );
};

export default PageLayout;
