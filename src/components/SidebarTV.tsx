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
  useMemo,
  useRef,
  useState,
} from 'react';

import { useUserLanguage } from '@/lib/userLanguage.client';
import { useSite } from './SiteProvider';

interface SidebarContextType {
  isCollapsed: boolean;
  isPeek: boolean;
}

const SidebarContext = createContext<SidebarContextType>({
  isCollapsed: false,
  isPeek: false,
});

export const useSidebar = () => useContext(SidebarContext);

interface SidebarProps {
  onToggle?: (collapsed: boolean) => void;
  activePath?: string;
}

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

function isTvMode() {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('tv-mode');
}

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

  const [isPeek, setIsPeek] = useState(false);

  const sidebarRef = useRef<HTMLDivElement | null>(null);

  const getCurrentFullPath = useCallback(() => {
    const queryString = searchParams.toString();
    return queryString ? `${pathname}?${queryString}` : pathname;
  }, [pathname, searchParams]);

  useLayoutEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsedTv');
    if (saved !== null) {
      const val = JSON.parse(saved);
      setIsCollapsed(val);
      window.__sidebarCollapsedTv = val;
    }
  }, []);

  useLayoutEffect(() => {
    if (typeof document === 'undefined') return;
    if (isCollapsed) {
      document.documentElement.dataset.sidebarCollapsed = 'true';
    } else {
      delete document.documentElement.dataset.sidebarCollapsed;
    }
  }, [isCollapsed]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('tv-mode', 'tv-cursor-hidden');
    return () => {
      root.classList.remove('tv-mode', 'tv-cursor-hidden');
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
    setIsPeek(false);
    localStorage.setItem('sidebarCollapsedTv', JSON.stringify(newState));
    if (typeof window !== 'undefined') window.__sidebarCollapsedTv = newState;
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

  const menuItems: NavItem[] = useMemo(
    () => [
      { icon: Film, label: t('Movies', '电影', '電影'), href: '/douban?type=movie' },
      { icon: Tv, label: t('Series', '剧集', '劇集'), href: '/douban?type=tv' },
      { icon: Film, label: t('Variety', '综艺', '綜藝'), href: '/douban?type=show' },
      { icon: Film, label: t('Anime', '动画', '動畫'), href: '/douban?type=anime' },
    ],
    [t]
  );

  useEffect(() => {
    const onPeek = () => {
      if (isCollapsed) setIsPeek(true);
    };
    window.addEventListener('tv:sidebar-peek', onPeek as EventListener);
    return () => window.removeEventListener('tv:sidebar-peek', onPeek as EventListener);
  }, [isCollapsed]);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;

    const handleFocusIn = () => {
      setIsPeek(false);
      setIsCollapsed(false);
    };

    el.addEventListener('focusin', handleFocusIn);
    return () => el.removeEventListener('focusin', handleFocusIn);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isTvMode()) return;

      const sidebar = sidebarRef.current;
      if (!sidebar) return;

      const activeEl = document.activeElement as HTMLElement | null;
      const inSidebar = !!(activeEl && sidebar.contains(activeEl));
      if (!inSidebar) return;

      const focusables = Array.from(
        sidebar.querySelectorAll<HTMLElement>('[data-tv-focusable="true"]')
      ).filter((x) => !x.hasAttribute('disabled'));

      const idx = activeEl ? focusables.indexOf(activeEl) : -1;

      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
      }

      if (e.key === 'ArrowDown') {
        const next = focusables[Math.min(idx + 1, focusables.length - 1)];
        next?.focus({ preventScroll: true });
        return;
      }

      if (e.key === 'ArrowUp') {
        const prev = focusables[Math.max(idx - 1, 0)];
        prev?.focus({ preventScroll: true });
        return;
      }

      if (e.key === 'ArrowRight') {
        const userPrefCollapsed =
          typeof window !== 'undefined' &&
          typeof window.__sidebarCollapsedTv === 'boolean'
            ? window.__sidebarCollapsedTv
            : true;

        if (userPrefCollapsed) {
          setIsPeek(false);
          setIsCollapsed(true);
        } else {
          setIsPeek(true);
          setIsCollapsed(false);
        }

        (document.activeElement as HTMLElement | null)?.blur();
        return;
      }

      if (e.key === 'Enter') {
        activeEl?.click();
        e.preventDefault();
        return;
      }

      if (e.key === 'Backspace' || e.key === 'Escape') {
        setIsPeek(false);
        setIsCollapsed(true);
        (document.activeElement as HTMLElement | null)?.blur();
      }
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    return () => window.removeEventListener('keydown', onKeyDown as EventListener);
  }, []);

  const widthClass = useMemo(() => {
    if (isCollapsed && !isPeek) return 'w-16';
    if (isPeek) return 'w-28';
    return 'w-64';
  }, [isCollapsed, isPeek]);

  const decodedActive = useMemo(() => decodeURIComponent(active), [active]);

  return (
    <SidebarContext.Provider value={{ isCollapsed: isCollapsed && !isPeek, isPeek }}>
      <div className="hidden md:flex">
        <aside
          data-sidebar
          data-tv-group="sidebar"
          data-tv-direction="vertical"
          className={`fixed top-0 left-0 h-screen bg-white/40 backdrop-blur-xl transition-all duration-300 border-r border-gray-200/50 z-10 shadow-lg dark:bg-gray-900/70 dark:border-gray-700/50 ${widthClass}`}
          ref={sidebarRef}
          style={{
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <div className="flex h-full flex-col">
            <div className="relative h-16">
              <div
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                  isCollapsed && !isPeek ? 'opacity-0' : 'opacity-100'
                }`}
              >
                <Link
                  href="/?tab=home"
                  tabIndex={-1}
                  data-tv-focusable="true"
                  onFocus={() => handleFocusNavigate('/?tab=home')}
                  className="flex items-center justify-center h-16 select-none transition-opacity duration-200 gap-2"
                >
                  <div className="w-10 h-10 rounded-lg overflow-hidden shadow-sm border border-white/60 dark:border-white/10 bg-white dark:bg-black flex items-center justify-center p-1.5">
                    <picture>
                      <source srcSet="/logo-dark.png" media="(prefers-color-scheme: dark)" />
                      <img src="/logo.png" alt={siteName} className="w-full h-full object-contain" />
                    </picture>
                  </div>

                  {!isPeek && (
                    <span className="text-2xl font-bold text-green-600 tracking-tight">
                      {siteName}
                    </span>
                  )}
                </Link>
              </div>
              <button
                onClick={handleToggle}
                tabIndex={-1}
                aria-hidden="true"
                className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100/50 transition-colors duration-200 z-10 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700/50 ${
                  isCollapsed && !isPeek ? 'left-1/2 -translate-x-1/2' : 'right-2'
                }`}
              >
                <Menu className="h-4 w-4" />
              </button>
            </div>

            <nav className="px-2 mt-4 space-y-1">
              <Link
                href="/?tab=home"
                tabIndex={-1}
                data-tv-focusable="true"
                onClick={() => setActive('/?tab=home')}
                onFocus={() => handleFocusNavigate('/?tab=home')}
                data-active={decodedActive === '/?tab=home'}
                data-tv-index={0}
                className="group flex items-center rounded-lg px-2 py-2 pl-4 text-gray-700 hover:bg-gray-100/30 hover:text-green-600 data-[active=true]:bg-green-500/20 data-[active=true]:text-green-700 font-medium transition-colors duration-200 min-h-[40px] dark:text-gray-300 dark:hover:text-green-400 dark:data-[active=true]:bg-green-500/10 dark:data-[active=true]:text-green-400 gap-3 justify-start"
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <Home className="h-4 w-4 text-gray-500 group-hover:text-green-600 data-[active=true]:text-green-700 dark:text-gray-400 dark:group-hover:text-green-400 dark:data-[active=true]:text-green-400" />
                </div>
                {!(isCollapsed && !isPeek) && !isPeek && (
                  <span className="whitespace-nowrap transition-opacity duration-200 opacity-100">
                    {t('Home', '首页', '首頁')}
                  </span>
                )}
              </Link>

              <Link
                href="/search"
                tabIndex={-1}
                data-tv-focusable="true"
                onClick={(e) => {
                  e.preventDefault();
                  handleSearchClick();
                  setActive('/search');
                }}
                onFocus={() => handleFocusNavigate('/search')}
                data-active={decodedActive === '/search'}
                data-tv-index={1}
                className="group flex items-center rounded-lg px-2 py-2 pl-4 text-gray-700 hover:bg-gray-100/30 hover:text-green-600 data-[active=true]:bg-green-500/20 data-[active=true]:text-green-700 font-medium transition-colors duration-200 min-h-[40px] dark:text-gray-300 dark:hover:text-green-400 dark:data-[active=true]:bg-green-500/10 dark:data-[active=true]:text-green-400 gap-3 justify-start"
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <Search className="h-4 w-4 text-gray-500 group-hover:text-green-600 data-[active=true]:text-green-700 dark:text-gray-400 dark:group-hover:text-green-400 dark:data-[active=true]:text-green-400" />
                </div>
                {!(isCollapsed && !isPeek) && !isPeek && (
                  <span className="whitespace-nowrap transition-opacity duration-200 opacity-100">
                    {t('Search', '搜索', '搜尋')}
                  </span>
                )}
              </Link>
            </nav>

            <div className="flex-1 overflow-y-auto px-2 pt-4">
              <div className="space-y-1">
                {menuItems.map((item, index) => {
                  const decodedItemHref = decodeURIComponent(item.href);
                  const activeType = decodedActive.match(/type=([^&]+)/)?.[1];
                  const isActive =
                    decodedActive === decodedItemHref ||
                    (!!activeType && decodedItemHref.includes(`type=${activeType}`));

                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      tabIndex={-1}
                      data-tv-focusable="true"
                      data-tv-index={index + 2}
                      onClick={() => setActive(item.href)}
                      onFocus={() => handleFocusNavigate(item.href)}
                      data-active={isActive}
                      className="group flex items-center rounded-lg px-2 py-2 pl-4 text-sm text-gray-700 hover:bg-gray-100/30 hover:text-green-600 data-[active=true]:bg-green-500/20 data-[active=true]:text-green-700 transition-colors duration-200 min-h-[40px] dark:text-gray-300 dark:hover:text-green-400 dark:data-[active=true]:bg-green-500/10 dark:data-[active=true]:text-green-400 gap-3 justify-start"
                    >
                      <div className="w-4 h-4 flex items-center justify-center">
                        <Icon className="h-4 w-4 text-gray-500 group-hover:text-green-600 data-[active=true]:text-green-700 dark:text-gray-400 dark:group-hover:text-green-400 dark:data-[active=true]:text-green-400" />
                      </div>

                      {!(isCollapsed && !isPeek) && !isPeek && (
                        <span className="whitespace-nowrap transition-opacity duration-200 opacity-100">
                          {item.label}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="px-2 pb-4">
              <button
                type="button"
                tabIndex={-1}
                data-tv-focusable="true"
                data-tv-index={999}
                onClick={() => {
                  setActive('/downloads');
                  router.push('/downloads');
                }}
                onFocus={() => handleFocusNavigate('/downloads')}
                className={`group flex items-center rounded-xl px-3 py-3 text-sm font-semibold text-gray-700 bg-white/70 hover:bg-white hover:text-green-700 transition-colors duration-200 w-full dark:text-gray-200 dark:bg-gray-800/80 dark:hover:bg-gray-700 ${
                  isCollapsed && !isPeek ? 'justify-center' : 'justify-start gap-3'
                }`}
              >
                <div className="w-5 h-5 flex items-center justify-center">
                  <Download className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                {!(isCollapsed && !isPeek) && !isPeek && (
                  <span className="whitespace-nowrap transition-opacity duration-200 opacity-100">
                    {t('Downloads', '下载', '下載')}
                  </span>
                )}
              </button>
            </div>
          </div>
        </aside>

        <div
          className={`transition-all duration-300 sidebar-offset ${
            isCollapsed && !isPeek ? 'w-16' : isPeek ? 'w-28' : 'w-64'
          }`}
        />
      </div>
    </SidebarContext.Provider>
  );
};

export default SidebarTV;
