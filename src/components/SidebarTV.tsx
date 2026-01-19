'use client';

import { Download, Film, Home, Menu, Search, Tv } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { useUserLanguage } from '@/lib/userLanguage.client';
import { useSite } from './SiteProvider';

interface SidebarContextType {
  isCollapsed: boolean;
}

const SidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
});

export const useSidebar = () => useContext(SidebarContext);

interface SidebarProps {
  onToggle?: (collapsed: boolean) => void;
  activePath?: string;
}

// 在浏览器环境下通过全局变量缓存折叠状态，避免组件重新挂载时出现初始值闪烁
declare global {
  interface Window {
    __sidebarCollapsedTv?: boolean;
  }
}

type NavItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
};

const SidebarTV = ({ onToggle, activePath = '/' }: SidebarProps) => {
  const { userLocale } = useUserLanguage();
  const locale =
    userLocale === 'zh-Hans' || userLocale === 'zh-Hant' ? userLocale : 'en';
  const t = useCallback(
    (en: string, zhHans: string, zhHant: string) => {
      if (locale === 'zh-Hans') return zhHans;
      if (locale === 'zh-Hant') return zhHant;
      return en;
    },
    [locale]
  );
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { siteName } = useSite();
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    if (
      typeof window !== 'undefined' &&
      typeof window.__sidebarCollapsedTv === 'boolean'
    ) {
      return window.__sidebarCollapsedTv;
    }
    return true;
  });
  const sidebarRef = useRef<HTMLDivElement | null>(null);
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const getCurrentFullPath = useCallback(() => {
    const queryString = searchParams.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }, [pathname, searchParams]);

  // 首次挂载时读取 localStorage，以便刷新后仍保持上次的折叠状态
  useLayoutEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsedTv');
    if (saved !== null) {
      const val = JSON.parse(saved);
      setIsCollapsed(val);
      window.__sidebarCollapsedTv = val;
    }
  }, []);

  // 当折叠状态变化时，同步到 <html> data 属性，供首屏 CSS 使用
  useLayoutEffect(() => {
    if (typeof document !== 'undefined') {
      if (isCollapsed) {
        document.documentElement.dataset.sidebarCollapsed = 'true';
      } else {
        delete document.documentElement.dataset.sidebarCollapsed;
      }
    }
  }, [isCollapsed]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('tv-mode', 'tv-cursor-hidden');
    return () => {
      root.classList.remove('tv-mode', 'tv-cursor-hidden');
    };
  }, []);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;

    const handleFocusIn = () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }
      setIsCollapsed(false);
    };

    const handleFocusOut = () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
      blurTimeoutRef.current = setTimeout(() => {
        const active = document.activeElement;
        if (active && el.contains(active)) return;
        setIsCollapsed(true);
      }, 80);
    };

    el.addEventListener('focusin', handleFocusIn);
    el.addEventListener('focusout', handleFocusOut);
    return () => {
      el.removeEventListener('focusin', handleFocusIn);
      el.removeEventListener('focusout', handleFocusOut);
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const [active, setActive] = useState(activePath);

  useEffect(() => {
    if (activePath && activePath !== '/') {
      setActive(activePath);
      return;
    }
    const fullPath = getCurrentFullPath();
    setActive(fullPath);
  }, [activePath, getCurrentFullPath]);

  const handleToggle = useCallback(() => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem('sidebarCollapsedTv', JSON.stringify(newState));
    if (typeof window !== 'undefined') {
      window.__sidebarCollapsedTv = newState;
    }
    onToggle?.(newState);
  }, [isCollapsed, onToggle]);

  const handleSearchClick = useCallback(() => {
    router.push('/search');
  }, [router]);

  const handleFocusNavigate = useCallback(
    (href: string) => {
      if (!href || href === '#') return;
      const current = getCurrentFullPath();
      if (current === href) {
        setActive(href);
        return;
      }
      router.push(href);
      setActive(href);
    },
    [getCurrentFullPath, router]
  );

  const menuItems: NavItem[] = [
    {
      icon: Film,
      label: t('Movies', '电影', '電影'),
      href: '/douban?type=movie',
    },
    {
      icon: Tv,
      label: t('Series', '剧集', '劇集'),
      href: '/douban?type=tv',
    },
    {
      icon: Film,
      label: t('Variety', '综艺', '綜藝'),
      href: '/douban?type=show',
    },
    {
      icon: Film,
      label: t('Anime', '动画', '動畫'),
      href: '/douban?type=anime',
    },
  ];

  return (
    <SidebarContext.Provider value={{ isCollapsed }}>
      {/* 在移动端隐藏侧边栏 */}
      <div className='hidden md:flex'>
        <aside
          data-sidebar
          data-tv-group='sidebar'
          data-tv-direction='vertical'
          className={`fixed top-0 left-0 h-screen bg-white/40 backdrop-blur-xl transition-all duration-300 border-r border-gray-200/50 z-10 shadow-lg dark:bg-gray-900/70 dark:border-gray-700/50 ${
            isCollapsed ? 'w-16' : 'w-64'
          }`}
          ref={sidebarRef}
          style={{
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <div className='flex h-full flex-col'>
            {/* 顶部 Logo 区域 */}
            <div className='relative h-16'>
              <div
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                  isCollapsed ? 'opacity-0' : 'opacity-100'
                }`}
              >
                <Link
                  href='/?tab=home'
                  onFocus={() => handleFocusNavigate('/?tab=home')}
                  className='flex items-center justify-center h-16 select-none hover:opacity-80 transition-opacity duration-200 gap-2'
                >
                  <div className='w-10 h-10 rounded-lg overflow-hidden shadow-sm border border-white/60 dark:border-white/10 bg-white dark:bg-black flex items-center justify-center p-1.5'>
                    <picture>
                      <source
                        srcSet='/logo-dark.png'
                        media='(prefers-color-scheme: dark)'
                      />
                      <img
                        src='/logo.png'
                        alt={siteName}
                        className='w-full h-full object-contain'
                      />
                    </picture>
                  </div>
                  <span className='text-2xl font-bold text-green-600 tracking-tight'>
                    {siteName}
                  </span>
                </Link>
              </div>
              <button
                onClick={handleToggle}
                className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100/50 transition-colors duration-200 z-10 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700/50 ${
                  isCollapsed ? 'left-1/2 -translate-x-1/2' : 'right-2'
                }`}
              >
                <Menu className='h-4 w-4' />
              </button>
            </div>

            {/* 首页导航 */}
            <nav className='px-2 mt-4 space-y-1'>
              <Link
                href='/?tab=home'
                onClick={() => setActive('/?tab=home')}
                onFocus={() => handleFocusNavigate('/?tab=home')}
                data-active={active === '/?tab=home'}
                className={`group flex items-center rounded-lg px-2 py-2 pl-4 text-gray-700 hover:bg-gray-100/30 hover:text-green-600 data-[active=true]:bg-green-500/20 data-[active=true]:text-green-700 font-medium transition-colors duration-200 min-h-[40px] dark:text-gray-300 dark:hover:text-green-400 dark:data-[active=true]:bg-green-500/10 dark:data-[active=true]:text-green-400 ${
                  isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                } gap-3 justify-start`}
              >
                <div className='w-4 h-4 flex items-center justify-center'>
                  <Home className='h-4 w-4 text-gray-500 group-hover:text-green-600 data-[active=true]:text-green-700 dark:text-gray-400 dark:group-hover:text-green-400 dark:data-[active=true]:text-green-400' />
                </div>
                {!isCollapsed && (
                  <span className='whitespace-nowrap transition-opacity duration-200 opacity-100'>
                    {t('Home', '首页', '首頁')}
                  </span>
                )}
              </Link>
              <Link
                href='/search'
                onClick={(e) => {
                  e.preventDefault();
                  handleSearchClick();
                  setActive('/search');
                }}
                onFocus={() => handleFocusNavigate('/search')}
                data-active={active === '/search'}
                className={`group flex items-center rounded-lg px-2 py-2 pl-4 text-gray-700 hover:bg-gray-100/30 hover:text-green-600 data-[active=true]:bg-green-500/20 data-[active=true]:text-green-700 font-medium transition-colors duration-200 min-h-[40px] dark:text-gray-300 dark:hover:text-green-400 dark:data-[active=true]:bg-green-500/10 dark:data-[active=true]:text-green-400 ${
                  isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                } gap-3 justify-start`}
              >
                <div className='w-4 h-4 flex items-center justify-center'>
                  <Search className='h-4 w-4 text-gray-500 group-hover:text-green-600 data-[active=true]:text-green-700 dark:text-gray-400 dark:group-hover:text-green-400 dark:data-[active=true]:text-green-400' />
                </div>
                {!isCollapsed && (
                  <span className='whitespace-nowrap transition-opacity duration-200 opacity-100'>
                    {t('Search', '搜索', '搜尋')}
                  </span>
                )}
              </Link>
            </nav>

            {/* 菜单项 */}
            <div className='flex-1 overflow-y-auto px-2 pt-4'>
              <div className='space-y-1'>
                {menuItems.map((item) => {
                  const decodedActive = decodeURIComponent(active);
                  const decodedItemHref = decodeURIComponent(item.href);
                  const activeType = decodedActive.match(/type=([^&]+)/)?.[1];

                  const isActive =
                    decodedActive === decodedItemHref ||
                    (!!activeType && decodedItemHref.includes(`type=${activeType}`));

                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.label}
                      href={item.href}
                      onClick={(e) => {
                        if (item.label === t('Refresh', '刷新', '重新整理')) {
                          e.preventDefault();
                          window.location.reload();
                          return;
                        }
                        setActive(item.href);
                      }}
                      onFocus={() => handleFocusNavigate(item.href)}
                      data-active={isActive}
                      className={`group flex items-center rounded-lg px-2 py-2 pl-4 text-sm text-gray-700 hover:bg-gray-100/30 hover:text-green-600 data-[active=true]:bg-green-500/20 data-[active=true]:text-green-700 transition-colors duration-200 min-h-[40px] dark:text-gray-300 dark:hover:text-green-400 dark:data-[active=true]:bg-green-500/10 dark:data-[active=true]:text-green-400 ${
                        isCollapsed ? 'w-full max-w-none mx-0' : 'mx-0'
                      } gap-3 justify-start`}
                    >
                      <div className='w-4 h-4 flex items-center justify-center'>
                        <Icon className='h-4 w-4 text-gray-500 group-hover:text-green-600 data-[active=true]:text-green-700 dark:text-gray-400 dark:group-hover:text-green-400 dark:data-[active=true]:text-green-400' />
                      </div>
                      {!isCollapsed && (
                        <span className='whitespace-nowrap transition-opacity duration-200 opacity-100'>
                          {item.label}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
            <div className='px-2 pb-4'>
              <button
                type='button'
                onClick={() => {
                  setActive('/downloads');
                  router.push('/downloads');
                }}
                onFocus={() => handleFocusNavigate('/downloads')}
                data-tv-focusable='true'
                className={`group flex items-center rounded-xl px-3 py-3 text-sm font-semibold text-gray-700 bg-white/70 hover:bg-white hover:text-green-700 transition-colors duration-200 w-full dark:text-gray-200 dark:bg-gray-800/80 dark:hover:bg-gray-700 ${
                  isCollapsed ? 'justify-center' : 'justify-start gap-3'
                }`}
              >
                <div className='w-5 h-5 flex items-center justify-center'>
                  <Download className='h-5 w-5 text-green-600 dark:text-green-400' />
                </div>
                {!isCollapsed && (
                  <span className='whitespace-nowrap transition-opacity duration-200 opacity-100'>
                    {t('Downloads', '下载', '下載')}
                  </span>
                )}
              </button>
            </div>
          </div>
        </aside>
        <div
          className={`transition-all duration-300 sidebar-offset ${
            isCollapsed ? 'w-16' : 'w-64'
          }`}
        ></div>
      </div>
    </SidebarContext.Provider>
  );
};

export default SidebarTV;
