'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import PageLayout from '@/components/PageLayout';
import { normalizeConfigJsonBase } from '@/lib/configjson';

const YtdlpPage = () => {
  const [inputUrl, setInputUrl] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const configJsonBase = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const runtimeConfig = (window as any).RUNTIME_CONFIG || {};
    return normalizeConfigJsonBase(runtimeConfig.CONFIGJSON || '') || '';
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = inputUrl.trim();
    if (!trimmed) {
      setError('Please enter a URL.');
      setResultUrl(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    setResultUrl(null);
    setJobId(null);
    setJobStatus(null);
    setJobProgress(null);
    try {
      const endpoints: string[] = [];
      if (configJsonBase) {
        endpoints.push(`${configJsonBase}/posters/yt-dlp`);
        endpoints.push(`${configJsonBase}/posters/yt-dlp.php`);
      }
      endpoints.push('/api/yt-dlp');

      let resolvedUrl: string | null = null;
      let queuedId: string | null = null;
      let lastError = 'Failed to generate download link.';
      for (const endpoint of endpoints) {
        // eslint-disable-next-line no-await-in-loop
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: trimmed }),
        });
        const data = await resp.json().catch(() => ({}));
        const candidate = data?.url || (data?.ok ? data?.url : null);
        if (resp.ok && candidate) {
          resolvedUrl = candidate as string;
          break;
        }
        if (resp.ok && data?.ok && data?.id) {
          queuedId = String(data.id);
          setJobId(queuedId);
          setJobStatus(data.status || 'queued');
          setJobProgress(
            typeof data.progress === 'number' ? data.progress : 0
          );
          break;
        }
        lastError = data?.error || lastError;
      }
      if (!resolvedUrl && !queuedId) {
        throw new Error(lastError);
      }
      setResultUrl(resolvedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!jobId || !configJsonBase) return;
    const poll = async () => {
      try {
        const statusUrl = `${configJsonBase}/posters/yt-dlp.php?action=status&id=${encodeURIComponent(
          jobId
        )}`;
        const resp = await fetch(statusUrl, { cache: 'no-store' });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok || data?.ok === false) return;
        const status = data?.status || 'queued';
        setJobStatus(status);
        setJobProgress(
          typeof data?.progress === 'number' ? data.progress : 0
        );
        if (data?.url) {
          const url = /^https?:\/\//i.test(data.url)
            ? data.url
            : `${configJsonBase.replace(/\/+$/, '')}/${String(data.url).replace(
                /^\/+/,
                ''
              )}`;
          setResultUrl(url);
        }
        if (status === 'downloaded' || status === 'error') {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      } catch {
        // ignore polling errors
      }
    };
    poll();
    if (pollRef.current) {
      clearInterval(pollRef.current);
    }
    pollRef.current = setInterval(poll, 2000);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [configJsonBase, jobId]);

  return (
    <PageLayout activePath='/yt-dlp'>
      <div className='mx-auto w-full max-w-2xl px-4 py-8'>
        <h1 className='text-2xl font-semibold text-gray-900 dark:text-gray-100'>
          yt-dlp Download Link
        </h1>
        <p className='mt-2 text-sm text-gray-600 dark:text-gray-400'>
          Paste a video URL to generate a direct download link.
        </p>

        <form onSubmit={handleSubmit} className='mt-6 space-y-4'>
          <div className='flex flex-col gap-2'>
            <label className='text-sm font-medium text-gray-700 dark:text-gray-300'>
              Video URL
            </label>
            <input
              type='url'
              required
              value={inputUrl}
              onChange={(event) => setInputUrl(event.target.value)}
              placeholder='https://example.com/video'
              className='w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500'
            />
          </div>

          <button
            type='submit'
            disabled={isLoading}
            className='inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60'
          >
            {isLoading ? 'Generating…' : 'Generate link'}
          </button>
        </form>

        {error && (
          <div className='mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200'>
            {error}
          </div>
        )}

        {jobId && (
          <div className='mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200'>
            <div className='font-semibold'>Queue status</div>
            <div className='mt-1'>
              {jobStatus || 'queued'}
              {typeof jobProgress === 'number' ? ` · ${jobProgress}%` : ''}
            </div>
          </div>
        )}

        {resultUrl && (
          <div className='mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200'>
            <div className='font-semibold'>Download link</div>
            <a
              href={resultUrl}
              target='_blank'
              rel='noreferrer'
              className='mt-2 block break-all text-emerald-700 underline-offset-2 hover:underline dark:text-emerald-300'
            >
              {resultUrl}
            </a>
          </div>
        )}
      </div>
    </PageLayout>
  );
};

export default YtdlpPage;
