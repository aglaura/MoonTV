'use client';

import { useState } from 'react';

import PageLayout from '@/components/PageLayout';

const YtdlpPage = () => {
  const [inputUrl, setInputUrl] = useState('');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
    try {
      const resp = await fetch('/api/yt-dlp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data?.url) {
        throw new Error(data?.error || 'Failed to generate download link.');
      }
      setResultUrl(data.url as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    } finally {
      setIsLoading(false);
    }
  };

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
