/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from 'react';

type RetryImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  retrySrcs?: string[];
  retryDelayMs?: number;
  maxRetryWindowMs?: number;
  maxRetries?: number;
};

const DEFAULT_RETRY_DELAY = 1200;
const DEFAULT_RETRY_WINDOW = 8000;
const DEFAULT_MAX_RETRIES = 3;

const shouldBust = (url: string) =>
  url.startsWith('http') || url.startsWith('/') || url.startsWith('//');

const addBust = (url: string) => {
  const joiner = url.includes('?') ? '&' : '?';
  return `${url}${joiner}retry=${Date.now()}`;
};

const buildCandidates = (src: string, retrySrcs?: string[]) => {
  const list = [src, ...(retrySrcs || [])]
    .map((url) => (url || '').trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const candidates: string[] = [];
  list.forEach((url, idx) => {
    if (!seen.has(url)) {
      candidates.push(url);
      seen.add(url);
    }
    if (idx === 0 && shouldBust(url)) {
      const busted = addBust(url);
      if (!seen.has(busted)) {
        candidates.push(busted);
        seen.add(busted);
      }
    }
  });
  return candidates;
};

const RetryImage = ({
  src,
  retrySrcs,
  retryDelayMs = DEFAULT_RETRY_DELAY,
  maxRetryWindowMs = DEFAULT_RETRY_WINDOW,
  maxRetries = DEFAULT_MAX_RETRIES,
  onError,
  onLoad,
  decoding = 'async',
  ...rest
}: RetryImageProps) => {
  const candidates = useMemo(() => buildCandidates(src, retrySrcs), [src, retrySrcs]);
  const [currentSrc, setCurrentSrc] = useState(candidates[0] || src);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const delayedRetryUsedRef = useRef(false);
  const baseSrcRef = useRef(src);
  const loadedRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const retryCountRef = useRef(0);

  useEffect(() => {
    baseSrcRef.current = src;
    startTimeRef.current = Date.now();
    loadedRef.current = false;
    attemptRef.current = 0;
    delayedRetryUsedRef.current = false;
    retryCountRef.current = 0;
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setCurrentSrc(candidates[0] || src);
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [candidates, src]);

  const scheduleRetry = useCallback((base: string) => {
    if (!retryDelayMs) return;
    if (retryTimerRef.current) return;
    if (baseSrcRef.current !== base) return;
    if (
      maxRetryWindowMs > 0 &&
      Date.now() - startTimeRef.current > maxRetryWindowMs
    ) {
      return;
    }
    delayedRetryUsedRef.current = true;
    attemptRef.current = Math.max(candidates.length - 1, 0);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (baseSrcRef.current !== base) return;
      if (
        maxRetryWindowMs > 0 &&
        Date.now() - startTimeRef.current > maxRetryWindowMs
      ) {
        return;
      }
      setCurrentSrc(addBust(base));
    }, retryDelayMs);
    return true;
  }, [candidates.length, maxRetryWindowMs, retryDelayMs]);

  const handleError = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      if (loadedRef.current) return;
      if (
        maxRetryWindowMs > 0 &&
        Date.now() - startTimeRef.current > maxRetryWindowMs
      ) {
        onError?.(event);
        return;
      }
      if (maxRetries <= 0 || retryCountRef.current >= maxRetries) {
        onError?.(event);
        return;
      }
      const nextIndex = attemptRef.current + 1;
      if (nextIndex < candidates.length) {
        retryCountRef.current += 1;
        attemptRef.current = nextIndex;
        setCurrentSrc(candidates[nextIndex]);
        return;
      }
      if (candidates[0] && !delayedRetryUsedRef.current) {
        if (scheduleRetry(candidates[0])) {
          retryCountRef.current += 1;
          return;
        }
      }
      onError?.(event);
    },
    [candidates, maxRetries, maxRetryWindowMs, onError, scheduleRetry]
  );

  const handleLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      loadedRef.current = true;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      onLoad?.(event);
    },
    [onLoad]
  );

  if (!currentSrc) return null;

  return (
    <img
      {...rest}
      src={currentSrc}
      decoding={decoding}
      onError={handleError}
      onLoad={handleLoad}
    />
  );
};

export default RetryImage;
