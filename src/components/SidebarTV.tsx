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
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useUserLanguage } from '@/lib/userLanguage.client';
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
    if (typeof window === 'undefined') return;
    window.__sidebarCollapsedTv = isCollapsed;
    localStorage.setItem('sidebarCollapsedTv', JSON.stringify(isCollapsed));
  }, [isCollapsed]);

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
    'group flex items-center gap-2 justify-start rounded-lg px-1.5 py-1.5 text-sm font-semibold text-white/70 transition-colors duration-150 min-h-[40px] hover:bg-white/10 data-[active=true]:text-white data-[active=true]:bg-white/10';
  const navIconClass = 'h-4 w-4 text-white/55';
  const utilityRowClass =
    'flex items-center justify-center rounded-lg px-1.5 py-1.5 bg-white/5 hover:bg-white/10 transition-colors';

  return (
    <SidebarContext.Provider value={{ isCollapsed: isCollapsed && !isPeek, isPeek }}>
      <div className="hidden md:flex">
        <aside
          data-sidebar
          data-tv-group="sidebar"
          data-tv-direction="vertical"
          className={`fixed top-0 left-0 h-screen bg-[#090909] backdrop-blur-md transition-all duration-300 z-10 shadow-[0_20px_60px_rgba(0,0,0,0.45)] ${widthClass}`}
          ref={sidebarRef}
          style={{
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <div className="flex h-full flex-col">
            <div className="relative h-12">
              <div
                className={`absolute inset-0 flex items-center justify-center transition-opacity duration-200 ${
                  isCollapsed && !isPeek ? 'opacity-0' : 'opacity-100'
                }`}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  data-tv-focusable="true"
                  onClick={() => handleFocusNavigate('/?tab=home')}
                  onFocus={() => handleFocusNavigate('/?tab=home')}
                  className="flex items-center justify-center h-12 select-none transition-opacity duration-200 gap-2"
                >
                  <div className="w-8 h-8 rounded-md overflow-hidden bg-white/10 flex items-center justify-center p-1">
                    <picture>
                      <source srcSet="/logo-dark.png" media="(prefers-color-scheme: dark)" />
                      <img src="/logo.png" alt={siteName} className="w-full h-full object-contain" />
                    </picture>
                  </div>
                </button>
              </div>
              <button
                onClick={handleToggle}
                tabIndex={-1}
                aria-hidden="true"
                className={`absolute top-1/2 -translate-y-1/2 flex items-center justify-center w-7 h-7 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors duration-200 z-10 ${
                  isCollapsed && !isPeek ? 'left-1/2 -translate-x-1/2' : 'right-2'
                }`}
              >
                <Menu className="h-4 w-4" />
              </button>
            </div>

            <div className="px-1 pb-2">
              <div
                className={`flex items-center rounded-lg px-1.5 py-1.5 bg-white/5 ${
                  showLabels ? 'justify-between' : 'justify-center'
                }`}
              >
                <UserBadge
                  variant="tv"
                  showLabel={showLabels}
                  className={showLabels ? 'flex-1' : ''}
                />
                {showLabels && <LogoutButton variant="tv" />}
              </div>
            </div>

            <nav className="px-1 mt-2 space-y-0.5">
              <button
                type="button"
                tabIndex={-1}
                data-tv-focusable="true"
                onClick={() => handleFocusNavigate('/?tab=home')}
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
              </button>

              <button
                type="button"
                tabIndex={-1}
                data-tv-focusable="true"
                onClick={() => handleFocusNavigate('/search')}
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
              </button>
            </nav>

            <div className="flex-1 overflow-y-auto px-1 pt-2">
              <div className="space-y-0.5">
                {menuItems.map((item, index) => {
                  const decodedItemHref = decodeURIComponent(item.href);
                  const activeType = decodedActive.match(/type=([^&]+)/)?.[1];
                  const isActive =
                    decodedActive === decodedItemHref ||
                    (!!activeType && decodedItemHref.includes(`type=${activeType}`));

                  const Icon = item.icon;

                  return (
                    <button
                      type="button"
                      key={item.href}
                      tabIndex={-1}
                      data-tv-focusable="true"
                      data-tv-index={index + 2}
                      onClick={() => handleFocusNavigate(item.href)}
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
                    </button>
                  );
                })}

                <button
                  type="button"
                  tabIndex={-1}
                  data-tv-focusable="true"
                  data-tv-index={menuItems.length + 2}
                  onClick={() => handleFocusNavigate('/downloads')}
                  onFocus={() => handleFocusNavigate('/downloads')}
                  className={`${navItemClass} w-full`}
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
              </div>
            </div>

            <div className="px-1 pb-3 space-y-2 mt-auto">
              <div className="space-y-2 pt-2">
                {modeLabel &&
                  (onModeClick ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      data-tv-focusable="true"
                      onClick={onModeClick}
                      className={`flex items-center gap-2 rounded-lg bg-white/5 text-white/70 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] hover:bg-white/10 transition ${
                        showLabels ? 'w-full justify-start' : 'justify-center'
                      }`}
                      aria-label={t('TV mode', '电视模式', '電視模式')}
                    >
                      <Tv className="h-3.5 w-3.5" />
                      {showLabels && <span>{modeLabel}</span>}
                    </button>
                  ) : (
                    <div
                      className={`flex items-center gap-2 rounded-lg bg-white/5 text-white/70 px-2 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                        showLabels ? 'w-full justify-start' : 'justify-center'
                      }`}
                      aria-label={t('TV mode', '电视模式', '電視模式')}
                    >
                      <Tv className="h-3.5 w-3.5" />
                      {showLabels && <span>{modeLabel}</span>}
                    </div>
                  ))}

                <div className={utilityRowClass}>
                  <SettingsButton />
                </div>

                <div className={utilityRowClass}>
                  <ThemeToggle />
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
