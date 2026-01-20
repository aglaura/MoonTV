/* eslint-disable react-hooks/exhaustive-deps, simple-import-sort/imports */
'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { useKidsMode } from '@/lib/kidsMode.client';
import { useUserLanguage } from '@/lib/userLanguage.client';

const t = (key: 'loggedInAs', locale: string) => {
  switch (locale) {
    case 'zh-Hans':
      return '当前用户';
    case 'zh-Hant':
      return '目前使用者';
    default:
      return 'Logged in as';
  }
};

const logoutLabel = (locale: string) => {
  switch (locale) {
    case 'zh-Hans':
      return '退出登录';
    case 'zh-Hant':
      return '登出';
    default:
      return 'Log out';
  }
};

const switchUserLabel = (locale: string) => {
  switch (locale) {
    case 'zh-Hans':
      return '切换账号';
    case 'zh-Hant':
      return '切換帳號';
    default:
      return 'Switch user';
  }
};

const profileLabel = (locale: string) => {
  switch (locale) {
    case 'zh-Hans':
      return '账号';
    case 'zh-Hant':
      return '帳號';
    default:
      return 'Profile';
  }
};

const tt = (en: string, zhHans: string, zhHant: string, locale: string) => {
  if (locale === 'zh-Hans') return zhHans;
  if (locale === 'zh-Hant') return zhHant;
  return en;
};

type SimpleUser = {
  username: string;
  avatar?: string | null;
  group?: string | null;
};

type UserBadgeProps = {
  variant?: 'default' | 'tv';
  showLabel?: boolean;
  className?: string;
};

export default function UserBadge({
  variant = 'default',
  showLabel = true,
  className,
}: UserBadgeProps) {
  const [username, setUsername] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const { userLocale } = useUserLanguage();
  const locale = userLocale || 'en';
  const isTvVariant = variant === 'tv';
  const displayLabel = showLabel;
  const {
    isKidsMode,
    ready: kidsReady,
    disableKidsMode,
    enableKidsMode,
  } = useKidsMode();
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<{
    top: number;
    left: number;
    minWidth?: number;
  }>({ top: 0, left: 0 });
  const [portalReady, setPortalReady] = useState(false);
  const [groupMembers, setGroupMembers] = useState<SimpleUser[]>([]);

  useEffect(() => {
    const read = () => {
      const auth = getAuthInfoFromBrowserCookie();
      const uname = auth?.username?.trim();
      setUsername(uname && uname.length > 0 ? uname : null);
    };
    read();
    window.addEventListener('focus', read);
    document.addEventListener('visibilitychange', read);
    return () => {
      window.removeEventListener('focus', read);
      document.removeEventListener('visibilitychange', read);
    };
  }, []);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    const loadUsers = async () => {
      try {
        const resp = await fetch('/api/users', { cache: 'no-store' });
        if (!resp.ok) return;
        const data = await resp.json().catch(() => ({}));
        const users = Array.isArray(data?.users) ? data.users : [];
        const normalized: SimpleUser[] = users
          .map((u: SimpleUser) => {
            const avatarValue =
              typeof u?.avatar === 'string' ? u.avatar.trim() : u?.avatar || null;
            return {
              username: (u?.username || '').trim(),
              avatar: avatarValue,
              group:
                typeof (u as any)?.group === 'string' &&
                (u as any)?.group?.trim()?.length > 0
                  ? (u as any).group.trim()
                  : 'family',
            };
          })
          .filter((u: SimpleUser) => u.username.length > 0);
        const current = normalized.find((u) => u.username === username);
        const group = current?.group || 'family';
        const members = normalized.filter((u) => u.group === group);
        if (!cancelled) {
          setGroupMembers(members);
        }
      } catch {
        if (!cancelled) {
          setGroupMembers([]);
        }
      }
    };
    void loadUsers();
    return () => {
      cancelled = true;
    };
  }, [username]);

  useEffect(() => {
    if (!username) {
      setAvatar(null);
      return;
    }

    let cancelled = false;
    const loadAvatar = async () => {
      try {
        const resp = await fetch('/api/users', { cache: 'no-store' });
        if (!resp.ok) return;
        const data = await resp.json().catch(() => ({}));
        const users = Array.isArray(data?.users) ? data.users : [];
        const match = users.find(
          (u: { username?: string; avatar?: string }) =>
            (u.username || '').trim() === username
        );
        const next = match?.avatar?.trim();
        if (!cancelled) {
          setAvatar(next && next.length > 0 ? next : null);
        }
      } catch {
        if (!cancelled) setAvatar(null);
      }
    };

    loadAvatar();
    return () => {
      cancelled = true;
    };
  }, [username]);

  const performLogout = async () => {
    try {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      // ignore
    }
  };

  const handleLogout = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await performLogout();
    window.location.reload();
  };

  const handleSelectUser = async (targetUser: string) => {
    try {
      await fetch('/api/login/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: targetUser }),
      });
      window.location.reload();
    } catch {
      window.location.href = '/login';
    }
  };

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return;
    const updatePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const minWidth = Math.max(rect.width + 16, 144);
      setMenuStyle({
        top: rect.bottom + window.scrollY + 6,
        left: rect.right + window.scrollX - minWidth,
        minWidth,
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        (dropdownRef.current && dropdownRef.current.contains(target)) ||
        (buttonRef.current && buttonRef.current.contains(target))
      ) {
        return;
      }
      setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  useEffect(() => {
    setPortalReady(typeof window !== 'undefined' && typeof document !== 'undefined');
  }, []);

  return username ? (
    <div className='relative z-[1200000]'>
      <button
        ref={buttonRef}
        title={`${t('loggedInAs', locale)} ${username}`}
        data-tv-focusable="true"
        className={`${
          isTvVariant
            ? `w-full rounded-xl px-3 py-2 bg-white/5 border border-white/10 text-sm font-semibold text-white/90 hover:bg-white/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-black/60 ${
                isKidsMode ? 'border-amber-400/50' : 'border-white/10'
              }`
            : `max-w-[14rem] truncate pl-2 pr-1 py-1 rounded-full bg-white/80 dark:bg-gray-800/70 border text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-sm backdrop-blur ${
                isKidsMode
                  ? 'border-amber-300 dark:border-amber-400/70 ring-amber-200/60'
                  : 'border-gray-200/70 dark:border-gray-700/60'
              }`
        } ${className || ''} flex items-center gap-2 cursor-pointer select-none relative z-[1200000]`.trim()}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup='menu'
      >
        <span
          className={`block ${
            isTvVariant ? 'w-9 h-9 text-sm' : 'w-6 h-6 text-[10px]'
          } rounded-full bg-white/10 overflow-hidden flex items-center justify-center font-bold text-white/70 border border-white/20`}
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt={username} className='w-full h-full object-cover' />
          ) : (
            username.charAt(0).toUpperCase()
          )}
        </span>
        {displayLabel && (
          <span className={`truncate ${isTvVariant ? 'flex-1' : 'hidden sm:inline'}`}>
            {isTvVariant ? (
              <span className='flex flex-col leading-tight'>
                <span className='text-sm font-semibold text-white/90'>
                  {username}
                </span>
                <span className='text-[10px] uppercase tracking-[0.2em] text-white/50'>
                  {profileLabel(locale)}
                </span>
              </span>
            ) : (
              username
            )}
          </span>
        )}
        {isKidsMode && displayLabel && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full ${
              isTvVariant
                ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-100'
            }`}
          >
            {tt('Kids', '少儿', '少兒', locale)}
          </span>
        )}
      </button>

      {isOpen &&
        (portalReady
          ? createPortal(
              <>
                <div
                  className='fixed inset-0 z-[1199999]'
                  onClick={() => setIsOpen(false)}
                  onTouchStart={() => setIsOpen(false)}
                />
                <div
                  ref={dropdownRef}
                  className='fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-3 z-[1200000] space-y-3 focus:outline-none min-w-[160px]'
                  style={{
                    top: menuStyle.top,
                    left: menuStyle.left,
                    minWidth: menuStyle.minWidth ?? 160,
                  }}
                  role='menu'
                >
                  <div className='text-[11px] text-gray-500 dark:text-gray-400 font-semibold uppercase tracking-wide'>
                    {switchUserLabel(locale)}
                  </div>
                  <div className='space-y-2 max-h-64 overflow-y-auto'>
                    {groupMembers.length === 0 && (
                      <div className='text-xs text-gray-500 dark:text-gray-400'>
                        {tt('No members', '没有成员', '沒有成員', locale)}
                      </div>
                    )}
                    {groupMembers.map((member) => {
                      const active = member.username === username;
                      return (
                        <button
                          key={member.username}
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsOpen(false);
                            if (!active) {
                              void handleSelectUser(member.username);
                            }
                          }}
                          className={`w-full flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${
                            active
                              ? 'bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-100'
                              : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200'
                          }`}
                        >
                          <span className='w-6 h-6 rounded-full bg-gradient-to-br from-green-500/20 to-green-400/10 overflow-hidden flex items-center justify-center text-[10px] font-bold text-green-700 dark:text-green-300 border border-green-500/20'>
                            {member.avatar ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={member.avatar}
                                alt={member.username}
                                className='w-full h-full object-cover'
                              />
                            ) : (
                              member.username.charAt(0).toUpperCase()
                            )}
                          </span>
                          <span className='truncate'>{member.username}</span>
                          {active && (
                            <span className='ml-auto text-[10px] text-green-600 dark:text-green-300'>
                              {tt('Current', '当前', '當前', locale)}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  <div className='pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2'>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(false);
                        if (isKidsMode) {
                          disableKidsMode();
                        } else {
                          enableKidsMode();
                        }
                      }}
                      disabled={!kidsReady}
                      className={`w-full flex items-center justify-between rounded-lg px-2 py-2 text-xs transition ${
                        isKidsMode
                          ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-100 border border-amber-200 dark:border-amber-700'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600 hover:border-green-400'
                      } ${!kidsReady ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      <span className='flex items-center gap-2'>
                        <span
                          className={`inline-flex h-2.5 w-2.5 rounded-full ${
                            isKidsMode ? 'bg-amber-500' : 'bg-gray-400'
                          }`}
                        />
                        {isKidsMode
                          ? tt('Exit Kids mode', '退出少儿模式', '退出少兒模式', locale)
                          : tt('Enter Kids mode', '进入少儿模式', '進入少兒模式', locale)}
                      </span>
                      {isKidsMode && (
                        <span className='text-[10px] text-amber-600 dark:text-amber-200'>
                          {tt('On', '开启', '開啟', locale)}
                        </span>
                      )}
                    </button>
                  </div>
                  <div className='pt-1 border-t border-gray-200 dark:border-gray-700'>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(false);
                        void handleLogout(e);
                      }}
                      className='w-full text-left text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300'
                    >
                      {logoutLabel(locale)}
                    </button>
                  </div>
                </div>
              </>,
              document.body
            )
          : null)}
    </div>
  ) : null;
}
