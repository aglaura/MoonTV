'use client';

import { Download, Film, Home, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useUserLanguage } from '@/lib/userLanguage.client';

interface MobileBottomNavProps {
  /**
   * 主动指定当前激活的路径。当未提供时，自动使用 usePathname() 获取的路径。
   */
  activePath?: string;
}

type NavItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  matchTypes?: string[];
};

const MobileBottomNav = ({ activePath }: MobileBottomNavProps) => {
  const pathname = usePathname();
  const { userLocale } = useUserLanguage();
  const locale =
    userLocale === 'zh-Hans' || userLocale === 'zh-Hant' ? userLocale : 'en';
  const t = (en: string, zhHans: string, zhHant: string) => {
    if (locale === 'zh-Hans') return zhHans;
    if (locale === 'zh-Hant') return zhHant;
    return en;
  };

  // 当前激活路径：优先使用传入的 activePath，否则回退到浏览器地址
  const currentActive = activePath ?? pathname;

  const navItems: NavItem[] = [
    { icon: Home, label: t('Home', '首页', '首頁'), href: '/' },
    { icon: Search, label: t('Search', '搜索', '搜尋'), href: '/search' },
    { icon: Download, label: t('Downloads', '下载', '下載'), href: '/downloads' },
    {
      icon: Film,
      label: t('Category', '分类', '分類'),
      href: '/douban?type=movie',
      matchTypes: ['movie', 'tv', 'show', 'anime'],
    },
  ];

  const isActive = (href: string) => {
    // 解码URL以进行正确的比较
    const decodedActive = decodeURIComponent(currentActive);
    const decodedItemHref = decodeURIComponent(href);
    const activeType = decodedActive.match(/type=([^&]+)/)?.[1];

    if (decodedActive === decodedItemHref) return true;
    if (href.startsWith('/douban') && activeType) {
      return (
        navItems.find((item) => item.href === href)?.matchTypes?.some((t) =>
          decodedActive.includes(`type=${t}`)
        ) || false
      );
    }
    return false;
  };

  return (
    <nav
      className='md:hidden fixed left-0 right-0 z-[600] bg-white/90 backdrop-blur-xl border-t border-gray-200/50 overflow-hidden dark:bg-gray-900/80 dark:border-gray-700/50'
      style={{
        /* 紧贴视口底部，同时在内部留出安全区高度 */
        bottom: 0,
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)',
        paddingTop: '10px',
      }}
    >
      <ul className='flex items-center'>
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href} className='flex-shrink-0 flex-1'>
              <Link
                href={item.href}
                className='flex flex-col items-center justify-center w-full gap-1 text-xs py-2.5'
              >
                <item.icon
                  className={`h-6 w-6 ${
                    active
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                />
                <span
                  className={
                    active
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-600 dark:text-gray-300'
                  }
                >
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default MobileBottomNav;
