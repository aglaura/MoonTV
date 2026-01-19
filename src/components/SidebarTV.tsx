'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { Clapperboard, Download, Film, Home, Menu, Search, Sparkles, Tv } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useUserLanguage } from '@/lib/userLanguage.client';
import LanguageSelector from './LanguageSelector';
import { LogoutButton } from './LogoutButton';
import { SettingsButton } from './SettingsButton';
import { ThemeToggle } from './ThemeToggle';
import UserBadge from './UserBadge';
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
  modeLabel?: ReactNode;
  onModeClick?: () => void;
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

const SidebarTV = ({
  onToggle,
  activePath = '/',
  modeLabel,
  onModeClick,
}: SidebarProps) => {
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
  const peekedOnceRef = useRef(false);
  const collapsedRef = useRef(isCollapsed);
  const peekRef = useRef(isPeek);

  useEffect(() => {
    collapsedRef.current = isCollapsed;
    peekRef.current = isPeek;
  }, [isCollapsed, isPeek]);

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
      {
        icon: Clapperboard,
        label: t('Variety', '综艺', '綜藝'),
        href: '/douban?type=show',
      },
      { icon: Sparkles, label: t('Anime', '动画', '動畫'), href: '/douban?type=anime' },
    ],
    [t]
  );

  useEffect(() => {
    const onPeek = () => {
      const collapsed = collapsedRef.current;
      const peek = peekRef.current;

      if (collapsed && !peek) {
        setIsPeek(true);
        peekedOnceRef.current = true;
        return;
      }

      if (peek && peekedOnceRef.current) {
        setIsPeek(false);
        setIsCollapsed(false);
        peekedOnceRef.current = false;

        requestAnimationFrame(() => {
          const el = sidebarRef.current;
          const first = el?.querySelector<HTMLElement>(
            '[data-tv-focusable="true"]'
          );
          first?.focus({ preventScroll: true });
        });
      }
    };

    window.addEventListener('tv:sidebar-peek', onPeek as EventListener);
    return () => window.removeEventListener('tv:sidebar-peek', onPeek as EventListener);
  }, []);

  useEffect(() => {
    const el = sidebarRef.current;
    if (!el) return;

    const handleFocusIn = () => {
      setIsPeek(false);
      setIsCollapsed(false);
      peekedOnceRef.current = false;
    };

    const handleFocusOut = () => {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active && el.contains(active)) return;
        setIsPeek(false);
        setIsCollapsed(true);
        peekedOnceRef.current = false;
      });
    };

    el.addEventListener('focusin', handleFocusIn);
    el.addEventListener('focusout', handleFocusOut);
    return () => {
      el.removeEventListener('focusin', handleFocusIn);
      el.removeEventListener('focusout', handleFocusOut);
    };
  }, []);

  const widthClass = useMemo(() => {
    if (isCollapsed && !isPeek) return 'w-16';
    if (isPeek) return 'w-28';
    return 'w-64';
  }, [isCollapsed, isPeek]);

  const showLabels = !isPeek && !isCollapsed;
  const decodedActive = useMemo(() => decodeURIComponent(active), [active]);
  const navItemClass =
    'group flex items-center gap-3 justify-start rounded-xl px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors duration-150 min-h-[44px] hover:bg-white/40 dark:hover:bg-white/10 data-[active=true]:bg-white/70 dark:data-[active=true]:bg-white/15 data-[active=true]:text-gray-900 dark:data-[active=true]:text-white';
  const navIconClass = 'h-4 w-4 text-gray-500 dark:text-gray-400';
  const utilityRowClass = 'flex items-center justify-center rounded-xl px-2 py-2';
  const utilityButtonClass = `group flex items-center rounded-xl px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors duration-150 min-h-[44px] hover:bg-white/40 dark:hover:bg-white/10 w-full ${
    isCollapsed && !isPeek ? 'justify-center' : 'justify-start gap-3'
  }`;

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
                className={navItemClass}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <Home className={navIconClass} />
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
                className={navItemClass}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <Search className={navIconClass} />
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
                      className={navItemClass}
                    >
                      <div className="w-4 h-4 flex items-center justify-center">
                        <Icon className={navIconClass} />
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

            <div className="px-2 pb-4 space-y-3">
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
                className={utilityButtonClass}
              >
                <div className="w-4 h-4 flex items-center justify-center">
                  <Download className={navIconClass} />
                </div>
                {!(isCollapsed && !isPeek) && !isPeek && (
                  <span className="whitespace-nowrap transition-opacity duration-200 opacity-100">
                    {t('Downloads', '下载', '下載')}
                  </span>
                )}
              </button>

              <div className="space-y-2 pt-3 border-t border-gray-200/60 dark:border-gray-700/60">
                {modeLabel &&
                  (onModeClick ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      data-tv-focusable="true"
                      onClick={onModeClick}
                      className={`flex items-center gap-2 rounded-full bg-white/60 dark:bg-white/10 text-gray-700 dark:text-gray-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide border border-white/40 dark:border-white/10 hover:bg-white/80 dark:hover:bg-white/20 transition ${
                        showLabels ? 'w-full justify-start' : 'justify-center'
                      }`}
                      aria-label={t('TV mode', '电视模式', '電視模式')}
                    >
                      <Tv className="h-3.5 w-3.5" />
                      {showLabels && <span>{modeLabel}</span>}
                    </button>
                  ) : (
                    <div
                      className={`flex items-center gap-2 rounded-full bg-white/60 dark:bg-white/10 text-gray-700 dark:text-gray-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide border border-white/40 dark:border-white/10 ${
                        showLabels ? 'w-full justify-start' : 'justify-center'
                      }`}
                      aria-label={t('TV mode', '电视模式', '電視模式')}
                    >
                      <Tv className="h-3.5 w-3.5" />
                      {showLabels && <span>{modeLabel}</span>}
                    </div>
                  ))}

                <div className={utilityRowClass}>
                  <UserBadge />
                </div>

                <div className={utilityRowClass}>
                  <SettingsButton />
                </div>

                <div className={utilityRowClass}>
                  <LanguageSelector variant="compact" />
                </div>

                <div className={utilityRowClass}>
                  <ThemeToggle />
                </div>

                <div className={utilityRowClass}>
                  <LogoutButton />
                </div>
              </div>
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
