import { useEffect } from 'react';

type Direction = 'up' | 'down' | 'left' | 'right';

const focusableSelector = '[data-tv-focusable="true"]';

const isEditable = (el: HTMLElement) => {
  const tagName = el.tagName;
  return (
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT' ||
    el.isContentEditable
  );
};

const isWithinManualNav = (el: HTMLElement | null) =>
  Boolean(el?.closest('[data-tv-nav="manual"]'));

const findNext = (
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

export const useTvSpatialNavigation = (enabled: boolean) => {
  useEffect(() => {
    if (!enabled) return;

    const onKey = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (!active) return;
      if (isEditable(active)) return;
      if (isWithinManualNav(active)) return;

      if (event.key === 'Enter') {
        active.click();
        event.preventDefault();
        return;
      }

      const map: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      };
      const dir = map[event.key];
      if (!dir) return;

      const focusables = Array.from(
        document.querySelectorAll<HTMLElement>(focusableSelector)
      )
        .filter((el) => !el.hasAttribute('disabled'))
        .filter((el) => el.getAttribute('aria-disabled') !== 'true')
        .filter((el) => el.getClientRects().length > 0);

      if (!focusables.length) return;

      event.preventDefault();
      if (!focusables.includes(active)) {
        focusables[0]?.focus({ preventScroll: true });
        return;
      }
      const next = findNext(active, dir, focusables);
      if (next) {
        next.focus({ preventScroll: true });
      }
    };

    window.addEventListener('keydown', onKey, { passive: false });
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
};
