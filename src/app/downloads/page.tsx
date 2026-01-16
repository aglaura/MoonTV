'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import PageLayout from '@/components/PageLayout';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import {
  buildDownloadStorageKey,
  DOWNLOAD_RECORDS_EVENT,
  readDownloadRecords,
  writeDownloadRecords,
  type DownloadRecord,
} from '@/lib/downloadRecords.client';

const formatTime = (ts: number) => {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
};

const DownloadsPage = () => {
  const username = useMemo(() => {
    try {
      return getAuthInfoFromBrowserCookie()?.username || null;
    } catch {
      return null;
    }
  }, []);
  const configJsonBase = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const runtimeConfig = (window as any).RUNTIME_CONFIG || {};
    return (runtimeConfig.CONFIGJSON || '').toString().replace(/\/+$/, '');
  }, []);
  const downloadStorageKey = useMemo(
    () => buildDownloadStorageKey(username),
    [username]
  );
  const [downloadRecords, setDownloadRecords] = useState<DownloadRecord[]>([]);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const loadDownloads = useCallback(() => {
    setDownloadRecords(readDownloadRecords(downloadStorageKey));
  }, [downloadStorageKey]);
  const normalizeDownloadUrl = useCallback(
    (url: string) => {
      if (!url) return '';
      if (/^https?:\/\//i.test(url)) return url;
      if (!configJsonBase) return url;
      return `${configJsonBase.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
    },
    [configJsonBase]
  );
  const updateRecordByJobId = useCallback(
    (jobId: string, updates: Partial<DownloadRecord>) => {
      if (!jobId) return;
      const existing = readDownloadRecords(downloadStorageKey);
      const list = Array.isArray(existing) ? existing : [];
      const idx = list.findIndex((rec) => rec.jobId === jobId);
      if (idx < 0) return;
      list[idx] = { ...list[idx], ...updates };
      writeDownloadRecords(downloadStorageKey, list);
    },
    [downloadStorageKey]
  );
  const pollJobs = useCallback(async () => {
    if (!configJsonBase) return;
    const pending = downloadRecords.filter(
      (rec) =>
        rec.jobId &&
        ['queued', 'preparing', 'downloading'].includes(
          rec.status || 'queued'
        )
    );
    if (!pending.length) return;
    await Promise.all(
      pending.map(async (rec) => {
        try {
          const statusUrl = `${configJsonBase}/posters/yt-dlp.php?action=status&id=${encodeURIComponent(
            rec.jobId as string
          )}`;
          const resp = await fetch(statusUrl, { cache: 'no-store' });
          const data = await resp.json().catch(() => ({}));
          if (!resp.ok || data?.ok === false) return;
          const status = data?.status || 'queued';
          const progress =
            typeof data?.progress === 'number' ? data.progress : 0;
          const urlCandidate = data?.url || data?.file || '';
          const resolvedUrl = urlCandidate
            ? normalizeDownloadUrl(String(urlCandidate))
            : '';
          const updates: Partial<DownloadRecord> = {
            status,
            progress,
          };
          if (resolvedUrl) {
            updates.url = resolvedUrl;
          }
          updateRecordByJobId(rec.jobId as string, updates);
        } catch {
          // ignore polling errors
        }
      })
    );
  }, [configJsonBase, downloadRecords, normalizeDownloadUrl, updateRecordByJobId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    loadDownloads();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === downloadStorageKey) {
        loadDownloads();
      }
    };
    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      if (
        detail?.key === downloadStorageKey &&
        Array.isArray(detail?.records)
      ) {
        setDownloadRecords(detail.records as DownloadRecord[]);
      }
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(
      DOWNLOAD_RECORDS_EVENT,
      handleCustom as EventListener
    );
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(
        DOWNLOAD_RECORDS_EVENT,
        handleCustom as EventListener
      );
    };
  }, [downloadStorageKey, loadDownloads]);
  useEffect(() => {
    if (!configJsonBase) return;
    const hasPending = downloadRecords.some(
      (rec) =>
        rec.jobId &&
        ['queued', 'preparing', 'downloading'].includes(
          rec.status || 'queued'
        )
    );
    if (!hasPending) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    pollJobs();
    if (pollRef.current) {
      clearInterval(pollRef.current);
    }
    pollRef.current = setInterval(() => {
      pollJobs();
    }, 3000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [configJsonBase, downloadRecords, pollJobs]);

  const handleOpenDownload = (url: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleRemoveDownload = (idx: number) => {
    const next = downloadRecords.filter((_, i) => i !== idx);
    setDownloadRecords(next);
    writeDownloadRecords(downloadStorageKey, next);
  };

  const handleClearDownloads = () => {
    setDownloadRecords([]);
    writeDownloadRecords(downloadStorageKey, []);
  };

  const sortedRecords = useMemo(
    () => downloadRecords.slice().sort((a, b) => b.ts - a.ts),
    [downloadRecords]
  );

  return (
    <PageLayout activePath='/downloads'>
      <div className='mx-auto w-full max-w-3xl px-4 py-8'>
        <div className='flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between'>
          <div>
            <h1 className='text-2xl font-semibold text-gray-900 dark:text-gray-100'>
              Download manager
            </h1>
            <p className='mt-2 text-sm text-gray-600 dark:text-gray-400'>
              Downloads saved locally on this device.
            </p>
            {username && (
              <p className='mt-1 text-xs text-gray-500 dark:text-gray-500'>
                Account: {username}
              </p>
            )}
          </div>
          {sortedRecords.length > 0 && (
            <button
              type='button'
              onClick={handleClearDownloads}
              className='inline-flex items-center justify-center rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-100 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800'
            >
              Clear all
            </button>
          )}
        </div>

        <div className='mt-6 space-y-3'>
          {sortedRecords.length === 0 ? (
            <div className='rounded-lg border border-dashed border-gray-200 bg-white/80 px-4 py-6 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-900/60 dark:text-gray-400'>
              No downloads yet.
            </div>
          ) : (
            sortedRecords.map((rec, idx) => {
              const status = rec.status || 'downloaded';
              const canOpen = status === 'downloaded' && !!rec.url;
              const progressLabel =
                status === 'downloading' && typeof rec.progress === 'number'
                  ? ` ${Math.max(0, Math.min(100, Math.round(rec.progress)))}%`
                  : '';
              return (
                <div
                  key={`${rec.title}-${rec.ts}-${idx}`}
                  className='rounded-lg border border-gray-200 bg-white/90 p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/70'
                >
                  <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <div className='text-sm font-semibold text-gray-900 dark:text-gray-100'>
                          {rec.title || rec.url}
                        </div>
                        {rec.offline && (
                          <span className='rounded-full bg-emerald-500/15 px-2 py-[2px] text-[11px] font-semibold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-100'>
                            Offline
                          </span>
                        )}
                        <span
                          className={`rounded-full px-2 py-[2px] text-[11px] font-semibold ${
                            status === 'error'
                              ? 'bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-100'
                              : status === 'downloaded'
                              ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-100'
                              : 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-100'
                          }`}
                        >
                          {status === 'preparing' && 'Preparing'}
                          {status === 'queued' && 'Queued'}
                          {status === 'downloading' && 'Downloading'}
                          {status === 'error' && 'Failed'}
                          {status === 'downloaded' && 'Downloaded'}
                          {progressLabel}
                        </span>
                      </div>
                      <div className='mt-1 text-xs text-gray-500 break-all dark:text-gray-400'>
                        {rec.url || 'Preparing download link...'}
                      </div>
                      <div className='mt-1 text-xs text-gray-400 dark:text-gray-500'>
                        {formatTime(rec.ts)}
                      </div>
                    </div>
                    <div className='flex items-center gap-2'>
                      <button
                        type='button'
                        onClick={() => handleOpenDownload(rec.url)}
                        className='rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60'
                        disabled={!canOpen}
                      >
                        Open
                      </button>
                      <button
                        type='button'
                        onClick={() => handleRemoveDownload(idx)}
                        className='rounded-full bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-600'
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </PageLayout>
  );
};

export default DownloadsPage;
