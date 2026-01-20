'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';

import {
  activateFocused,
  focusRegistry,
  isEditable,
  isWithinManualNav,
  moveFocus,
  useTvRemote,
  type TvKey,
} from '@/lib/tvInput';

interface TvInputProviderProps {
  enabled: boolean;
  children: React.ReactNode;
}

type TvSidebarController = {
  peek: () => void;
};

type TvInputContextValue = {
  registerSidebar: (controller: TvSidebarController | null) => void;
  requestSidebarPeek: () => void;
  requestSidebarFocus: () => boolean;
};

const TvInputContext = createContext<TvInputContextValue | null>(null);

export const useTvInput = () => useContext(TvInputContext);

const TvInputProvider = ({ enabled, children }: TvInputProviderProps) => {
  const lastActivateRef = useRef(0);
  const lastContentFocusRef = useRef<HTMLElement | null>(null);
  const sidebarRef = useRef<TvSidebarController | null>(null);

  const registerSidebar = useCallback((controller: TvSidebarController | null) => {
    sidebarRef.current = controller;
  }, []);

  const requestSidebarPeek = useCallback(() => {
    if (!enabled) return;
    sidebarRef.current?.peek();
  }, [enabled]);

  const focusSidebarFirst = useCallback(() => {
    if (typeof document === 'undefined') return false;
    const sidebar = document.querySelector<HTMLElement>('[data-sidebar]');
    if (!sidebar) return false;
    const first = sidebar.querySelector<HTMLElement>('[data-tv-focusable="true"]');
    if (!first) return false;
    first.focus({ preventScroll: true });
    return true;
  }, []);

  const requestSidebarFocus = useCallback(() => {
    requestSidebarPeek();
    return focusSidebarFirst();
  }, [focusSidebarFirst, requestSidebarPeek]);

  useEffect(() => {
    if (!enabled) return;

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      focusRegistry.rememberElement(target);
      if (!target.closest('[data-sidebar]')) {
        lastContentFocusRef.current = target;
      }
    };

    window.addEventListener('focusin', handleFocusIn);
    return () => window.removeEventListener('focusin', handleFocusIn);
  }, [enabled]);

  const handleKey = useCallback(
    (key: TvKey) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return;
      if (isEditable(active)) return;
      if (isWithinManualNav(active)) return;

      if (key === 'select') {
        const now = Date.now();
        if (now - lastActivateRef.current < 300) return;
        lastActivateRef.current = now;
        activateFocused(active);
        return;
      }

      if (key === 'back') {
        requestSidebarFocus();
        return;
      }

      if (key === 'right' && active.closest('[data-sidebar]')) {
        const last = lastContentFocusRef.current;
        if (last && document.contains(last)) {
          last.focus({ preventScroll: true });
          return;
        }
      }

      moveFocus(key, {
        active,
        registry: focusRegistry,
        onEdge: (direction) => {
          if (direction === 'left') {
            requestSidebarFocus();
          }
        },
      });
    },
    [lastActivateRef, requestSidebarFocus]
  );

  useTvRemote(handleKey, enabled);

  const contextValue = useMemo(
    () => ({ registerSidebar, requestSidebarPeek, requestSidebarFocus }),
    [registerSidebar, requestSidebarFocus, requestSidebarPeek]
  );

  return (
    <TvInputContext.Provider value={contextValue}>{children}</TvInputContext.Provider>
  );
};

export default TvInputProvider;
