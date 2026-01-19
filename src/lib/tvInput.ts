import { useEffect, useRef } from 'react';

export type TvKey = 'up' | 'down' | 'left' | 'right' | 'select' | 'back';

const KEY_MAP: Record<number, TvKey | undefined> = {
  19: 'up',
  20: 'down',
  21: 'left',
  22: 'right',
  23: 'select',
  4: 'back',
};

const REPEAT_DELAY = 120;
const focusableSelector = '[data-tv-focusable="true"]';

export const isEditable = (el: HTMLElement) => {
  const tagName = el.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    el.isContentEditable
  );
};

export const isWithinManualNav = (el: HTMLElement | null) =>
  Boolean(el?.closest('[data-tv-nav="manual"]'));

const isVisibleFocusable = (el: HTMLElement) => {
  if (el.hasAttribute('disabled')) return false;
  if (el.getAttribute('aria-disabled') === 'true') return false;
  return el.getClientRects().length > 0;
};

const getFocusable = (root: ParentNode | null) => {
  if (!root) return [];
  const list = Array.from(root.querySelectorAll<HTMLElement>(focusableSelector));
  return list.filter(isVisibleFocusable);
};

const getRowKey = (row: HTMLElement) =>
  row.getAttribute('data-tv-row') || row.id || '';

const escapeSelector = (value: string) => {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
    return CSS.escape(value);
  }
  return value.replace(/["\\]/g, '\\$&');
};

type RowMemory = {
  index?: string;
  el?: HTMLElement;
};

export class FocusRegistry {
  private lastByRow = new Map<string, RowMemory>();

  rememberElement(el: HTMLElement) {
    const row = el.closest<HTMLElement>('[data-tv-row]');
    if (!row) return;
    const rowKey = getRowKey(row);
    if (!rowKey) return;
    const index = el.getAttribute('data-tv-index') || undefined;
    this.lastByRow.set(rowKey, { index, el });
  }

  restore(row: HTMLElement): HTMLElement | null {
    const rowKey = getRowKey(row);
    if (!rowKey) return null;
    const entry = this.lastByRow.get(rowKey);
    if (!entry) return null;
    if (entry.index) {
      const selector = `[data-tv-index="${escapeSelector(entry.index)}"]`;
      const match = row.querySelector<HTMLElement>(selector);
      if (match && isVisibleFocusable(match)) return match;
    }
    if (entry.el && document.contains(entry.el)) return entry.el;
    return null;
  }
}

export const focusRegistry = new FocusRegistry();

export const useTvRemote = (
  onKey: (key: TvKey, event: KeyboardEvent) => void,
  enabled = true
) => {
  const lastTimeRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const handler = (event: KeyboardEvent) => {
      const now = performance.now();
      if (now - lastTimeRef.current < REPEAT_DELAY) return;

      const key =
        KEY_MAP[event.keyCode] ??
        (event.key === 'Enter' || event.code === 'Enter'
          ? 'select'
          : event.key === ' ' || event.code === 'Space'
          ? 'select'
          : event.key === 'Escape' || event.key === 'Backspace'
          ? 'back'
          : undefined);

      if (!key) return;

      lastTimeRef.current = now;
      event.preventDefault();
      onKey(key, event);
    };

    window.addEventListener('keydown', handler, { passive: false });
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, onKey]);
};

export const activateFocused = (target?: HTMLElement | null) => {
  const el =
    target || (document.activeElement as HTMLElement | null) || undefined;
  if (!el) return;
  const dispatch = () => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    el.click();
  };
  if (typeof window === 'undefined') return;
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(dispatch);
    return;
  }
  setTimeout(dispatch, 0);
};

type Direction = 'up' | 'down' | 'left' | 'right';

type MoveFocusOptions = {
  active?: HTMLElement | null;
  registry?: FocusRegistry;
  onEdge?: (direction: Direction) => void;
};

const focusAndScroll = (el: HTMLElement, direction: Direction) => {
  el.focus({ preventScroll: true });
  el.scrollIntoView({
    block: 'nearest',
    inline: 'nearest',
    behavior: 'smooth',
  });
  const scrollContainer = el.closest<HTMLElement>('[data-tv-scroll]');
  if (!scrollContainer) return;
  if (direction === 'right') scrollContainer.scrollLeft += 80;
  if (direction === 'left') scrollContainer.scrollLeft -= 80;
};

const findNextByGeometry = (
  current: HTMLElement,
  direction: Direction,
  candidates: HTMLElement[]
) => {
  const currentRect = current.getBoundingClientRect();
  const currentCenterX = currentRect.left + currentRect.width / 2;
  const currentCenterY = currentRect.top + currentRect.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  candidates.forEach((el) => {
    if (el === current) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = centerX - currentCenterX;
    const dy = centerY - currentCenterY;

    if (direction === 'left' && dx >= 0) return;
    if (direction === 'right' && dx <= 0) return;
    if (direction === 'up' && dy >= 0) return;
    if (direction === 'down' && dy <= 0) return;

    const primary =
      direction === 'left' || direction === 'right' ? Math.abs(dx) : Math.abs(dy);
    const secondary =
      direction === 'left' || direction === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = primary * 1000 + secondary;

    if (score < bestScore) {
      best = el;
      bestScore = score;
    }
  });

  return best;
};

export const moveFocus = (direction: Direction, options: MoveFocusOptions = {}) => {
  const active =
    options.active || (document.activeElement as HTMLElement | null);
  if (!active) return;

  const inSidebar = Boolean(active.closest('[data-sidebar]'));
  const allFocusable = getFocusable(document);
  const focusables = inSidebar
    ? allFocusable
    : allFocusable.filter((el) => !el.closest('[data-sidebar]'));

  if (!focusables.length) return;

  const row = active.closest<HTMLElement>('[data-tv-row]');
  if (row) {
    if (direction === 'up' || direction === 'down') {
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>('[data-tv-row]')
      );
      const currentIdx = rows.indexOf(row);
      const targetIdx = direction === 'down' ? currentIdx + 1 : currentIdx - 1;
      const targetRow = rows[targetIdx];
      if (!targetRow) {
        options.onEdge?.(direction);
        return;
      }
      const restored = options.registry?.restore(targetRow) || null;
      const fallback = getFocusable(targetRow)[0] || null;
      const next = restored ?? fallback;
      if (next) {
        focusAndScroll(next, direction);
        return;
      }
      options.onEdge?.(direction);
      return;
    }

    const items = getFocusable(row);
    if (!items.length) {
      options.onEdge?.(direction);
      return;
    }
    const idx = items.indexOf(active);
    const next =
      direction === 'right' ? items[idx + 1] : items[idx - 1] || null;
    if (next) {
      focusAndScroll(next, direction);
      return;
    }
    options.onEdge?.(direction);
    return;
  }

  const next = findNextByGeometry(active, direction, focusables);
  if (next) {
    focusAndScroll(next, direction);
    return;
  }
  options.onEdge?.(direction);
};
