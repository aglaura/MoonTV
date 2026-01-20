'use client';

import { useEffect } from 'react';

type UseTvSectionNavigationParams = {
  enabled: boolean;
  sections: string[];
  currentSection: string | null;
  setSectionIndex: React.Dispatch<React.SetStateAction<number>>;
};

export const useTvSectionNavigation = ({
  enabled,
  sections,
  currentSection,
  setSectionIndex,
}: UseTvSectionNavigationParams) => {
  useEffect(() => {
    if (!enabled) return;

    const normalizeKey = (event: KeyboardEvent) => {
      const raw = event.key;
      if (raw.startsWith('Arrow')) return raw;
      switch (raw) {
        case 'Left':
          return 'ArrowLeft';
        case 'Right':
          return 'ArrowRight';
        case 'Up':
          return 'ArrowUp';
        case 'Down':
          return 'ArrowDown';
        case 'OK':
        case 'Select':
          return 'Enter';
        default:
          break;
      }
      switch (event.keyCode) {
        case 37:
          return 'ArrowLeft';
        case 38:
          return 'ArrowUp';
        case 39:
          return 'ArrowRight';
        case 40:
          return 'ArrowDown';
        case 13:
          return 'Enter';
        default:
          break;
      }
      return raw;
    };

    const getFocusables = (root: HTMLElement | Document = document) =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          '[data-tv-focusable="true"], button, [role="button"], a, [tabindex="0"]'
        )
      ).filter((el) => !el.hasAttribute('disabled'));

    const focusFirstInSection = (id: string | null) => {
      if (!id) return false;
      const sectionEl = document.querySelector<HTMLElement>(
        `[data-tv-section="${id}"]`
      );
      if (!sectionEl) return false;
      const focusable = getFocusables(sectionEl)[0];
      if (focusable) {
        focusable.focus({ preventScroll: true });
        return true;
      }
      return false;
    };

    const moveInGroup = (
      group: HTMLElement,
      activeEl: HTMLElement,
      key: string
    ) => {
      const direction = group.getAttribute('data-tv-direction') || 'grid';
      const focusables = getFocusables(group);
      const currentIndex = focusables.indexOf(activeEl);
      if (currentIndex < 0) return false;
      const forwardKeys =
        direction === 'horizontal'
          ? ['ArrowRight']
          : direction === 'vertical'
            ? ['ArrowDown']
            : ['ArrowRight', 'ArrowDown'];
      const backKeys =
        direction === 'horizontal'
          ? ['ArrowLeft']
          : direction === 'vertical'
            ? ['ArrowUp']
            : ['ArrowLeft', 'ArrowUp'];

      if (forwardKeys.includes(key)) {
        const next = focusables[currentIndex + 1];
        if (next) {
          next.focus({ preventScroll: true });
          return true;
        }
      }
      if (backKeys.includes(key)) {
        const prev = focusables[currentIndex - 1];
        if (prev) {
          prev.focus({ preventScroll: true });
          return true;
        }
      }
      return false;
    };

    const moveInSectionLinear = (direction: 'next' | 'prev') => {
      if (!currentSection) return false;
      const sectionEl = document.querySelector<HTMLElement>(
        `[data-tv-section="${currentSection}"]`
      );
      if (!sectionEl) return false;
      const focusables = getFocusables(sectionEl);
      if (focusables.length === 0) return false;
      const activeEl = document.activeElement as HTMLElement | null;
      const idx = activeEl ? focusables.indexOf(activeEl) : -1;
      const next =
        direction === 'next'
          ? focusables[Math.min(idx + 1, focusables.length - 1)]
          : focusables[Math.max(idx - 1, 0)];
      if (next) {
        next.focus({ preventScroll: true });
        return true;
      }
      return false;
    };

    const handleKey = (e: KeyboardEvent) => {
      const key = normalizeKey(e);
      const isArrow =
        key === 'ArrowLeft' ||
        key === 'ArrowRight' ||
        key === 'ArrowUp' ||
        key === 'ArrowDown';

      if (isArrow) {
        e.preventDefault();
      }

      const activeEl = document.activeElement as HTMLElement | null;
      if (isArrow && (!activeEl || activeEl === document.body)) {
        focusFirstInSection(currentSection || sections[0] || null);
      }
      const group = activeEl?.closest<HTMLElement>('[data-tv-group]');

      if (group && activeEl) {
        const moved = moveInGroup(group, activeEl, key);
        if (moved) {
          return;
        }
      }

      if (key === 'ArrowRight') {
        const moved = moveInSectionLinear('next');
        if (moved) {
          return;
        }
      }
      if (key === 'ArrowLeft') {
        const moved = moveInSectionLinear('prev');
        if (moved) {
          return;
        }
        const sidebar = document.querySelector<HTMLElement>('[data-sidebar]');
        if (sidebar) {
          const focusables = getFocusables(sidebar);
          if (focusables.length > 0) {
            focusables[0].focus({ preventScroll: true });
            return;
          }
        }
      }
      if (key === 'ArrowDown') {
        setSectionIndex((prev) => {
          const next = prev < sections.length - 1 ? prev + 1 : prev;
          setTimeout(() => focusFirstInSection(sections[next]), 0);
          return next;
        });
      } else if (key === 'ArrowUp') {
        setSectionIndex((prev) => {
          const next = prev > 0 ? prev - 1 : prev;
          setTimeout(() => focusFirstInSection(sections[next]), 0);
          return next;
        });
      } else if (key === 'Enter') {
        const target = document.activeElement as HTMLElement | null;
        if (target) {
          const evt = new MouseEvent('click', { bubbles: true });
          target.dispatchEvent(evt);
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKey, { capture: true });
    return () => window.removeEventListener('keydown', handleKey, { capture: true });
  }, [enabled, currentSection, sections, setSectionIndex]);

  useEffect(() => {
    if (!enabled || !currentSection) return;

    const el = document.querySelector<HTMLElement>(
      `[data-tv-section="${currentSection}"]`
    );
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const offset = rect.top + window.scrollY - 100;

    window.scrollTo({ top: offset, behavior: 'smooth' });
  }, [enabled, currentSection]);

  useEffect(() => {
    if (!enabled || !currentSection) return;

    const sectionEl = document.querySelector<HTMLElement>(
      `[data-tv-section="${currentSection}"]`
    );
    if (!sectionEl) return;
    const focusable =
      sectionEl.querySelector<HTMLElement>('[data-tv-focusable="true"]') ||
      sectionEl.querySelector<HTMLElement>('button, [tabindex="0"]') ||
      document.querySelector<HTMLElement>(
        '[data-tv-focusable="true"], button, [role="button"], a, [tabindex="0"]'
      );
    focusable?.focus({ preventScroll: true });
  }, [enabled, currentSection]);
};
