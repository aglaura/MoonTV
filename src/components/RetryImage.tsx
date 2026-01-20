/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ImgHTMLAttributes } from 'react';

type RetryImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src: string;
  retrySrcs?: string[];
  retryDelayMs?: number;
};

const DEFAULT_RETRY_DELAY = 1200;

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
  onError,
  onLoad,
  ...rest
}: RetryImageProps) => {
  const candidates = useMemo(() => buildCandidates(src, retrySrcs), [src, retrySrcs]);
  const [currentSrc, setCurrentSrc] = useState(candidates[0] || src);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const delayedRetryUsedRef = useRef(false);

  useEffect(() => {
    attemptRef.current = 0;
    delayedRetryUsedRef.current = false;
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
    delayedRetryUsedRef.current = true;
    attemptRef.current = candidates.length;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      setCurrentSrc(addBust(base));
    }, retryDelayMs);
  }, [candidates.length, retryDelayMs]);

  const handleError = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
      const nextIndex = attemptRef.current + 1;
      if (nextIndex < candidates.length) {
        attemptRef.current = nextIndex;
        setCurrentSrc(candidates[nextIndex]);
        return;
      }
      if (candidates[0] && !delayedRetryUsedRef.current) {
        scheduleRetry(candidates[0]);
        return;
      }
      onError?.(event);
    },
    [candidates, onError, scheduleRetry]
  );

  const handleLoad = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement, Event>) => {
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
      onError={handleError}
      onLoad={handleLoad}
    />
  );
};

export default RetryImage;
