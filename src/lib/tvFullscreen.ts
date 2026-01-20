import { useEffect } from 'react';

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  mozFullScreenElement?: Element | null;
  msFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenEnabled?: boolean;
};

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};

function getFullscreenElement(doc: FullscreenDocument): Element | null {
  return (
    doc.fullscreenElement ||
    doc.webkitFullscreenElement ||
    doc.mozFullScreenElement ||
    doc.msFullscreenElement ||
    null
  );
}

function requestFullscreen(el: FullscreenElement) {
  const request =
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.mozRequestFullScreen ||
    el.msRequestFullscreen;
  if (!request) return;
  const result = request.call(el);
  if (result && typeof (result as Promise<void>).catch === 'function') {
    (result as Promise<void>).catch(() => {});
  }
}

function exitFullscreen(doc: FullscreenDocument) {
  const exit =
    doc.exitFullscreen ||
    doc.webkitExitFullscreen ||
    doc.mozCancelFullScreen ||
    doc.msExitFullscreen;
  if (!exit) return;
  const result = exit.call(doc);
  if (result && typeof (result as Promise<void>).catch === 'function') {
    (result as Promise<void>).catch(() => {});
  }
}

export function useTvFullscreen(enabled: boolean) {
  useEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;

    const doc = document as FullscreenDocument;
    const root = document.documentElement as FullscreenElement;

    const canFullscreen =
      doc.fullscreenEnabled !== false && doc.webkitFullscreenEnabled !== false;

    const tryRequest = () => {
      if (!enabled) return;
      if (!canFullscreen) return;
      if (getFullscreenElement(doc)) return;
      requestFullscreen(root);
    };

    const handleInput = () => {
      tryRequest();
    };

    if (enabled) {
      tryRequest();
      window.addEventListener('keydown', handleInput, { passive: true });
      window.addEventListener('pointerdown', handleInput, { passive: true });
      window.addEventListener('touchstart', handleInput, { passive: true });
      return () => {
        window.removeEventListener('keydown', handleInput);
        window.removeEventListener('pointerdown', handleInput);
        window.removeEventListener('touchstart', handleInput);
      };
    }

    if (getFullscreenElement(doc)) {
      exitFullscreen(doc);
    }
  }, [enabled]);
}
