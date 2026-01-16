'use client';

import { BackButton } from './BackButton';
import LanguageSelector from './LanguageSelector';
import MobileBottomNav from './MobileBottomNav';
import MobileHeader from './MobileHeader';
import { SettingsButton } from './SettingsButton';
import Sidebar from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import UserBadge from './UserBadge';

interface PageLayoutProps {
  children: React.ReactNode;
  activePath?: string;
  hideTopBar?: boolean;
  topBarModeLabel?: string;
}

const PageLayout = ({
  children,
  activePath = '/',
  hideTopBar = false,
  topBarModeLabel,
}: PageLayoutProps) => {
  return (
    <div className='w-full min-h-screen'>
      {/* 移动端头部 */}
      {!hideTopBar && (
        <MobileHeader showBackButton={['/play'].includes(activePath)} />
      )}

      {/* 主要布局容器 */}
      <div className='flex md:grid md:grid-cols-[auto_1fr] w-full min-h-screen md:min-h-auto'>
        {/* 侧边栏 - 桌面端显示，移动端隐藏 */}
        {!hideTopBar && (
          <div className='hidden md:block'>
            <Sidebar activePath={activePath} />
          </div>
        )}

        {/* 主内容区域 */}
        <div className='relative min-w-0 flex-1 transition-all duration-300'>
          {/* 桌面端左上角返回按钮 */}
          {['/play'].includes(activePath) && !hideTopBar && (
            <div className='absolute top-3 left-1 z-20 hidden md:flex'>
              <BackButton />
            </div>
          )}

          {/* 桌面端顶部按钮 */}
          {!hideTopBar && (
            <div className='absolute top-2 right-4 z-20 hidden md:flex items-center gap-2'>
              {topBarModeLabel && (
                <span className='rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide border border-emerald-500/30'>
                  {topBarModeLabel}
                </span>
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
  );
};

export default PageLayout;
