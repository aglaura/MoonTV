 'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker to enable offline shell + assets.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const registerSW = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        });
        if (reg?.update) {
          reg.update();
        }
      } catch (err) {
        console.warn('Service worker registration failed', err);
      }
    };

    registerSW();
  }, []);

  return null;
}
