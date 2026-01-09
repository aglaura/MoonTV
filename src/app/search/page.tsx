/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { Suspense, useEffect, useState } from 'react';

import { tt } from '@/lib/i18n.client';
import { convertToTraditional } from '@/lib/locale';
import { SearchResult } from '@/lib/types';

import PageLayout from '@/components/PageLayout';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';

function HomeClient() {
  const { announcement } = useSite();

  const [showAnnouncement, setShowAnnouncement] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && announcement) {
      const hasSeenAnnouncement = localStorage.getItem('hasSeenAnnouncement');
      if (hasSeenAnnouncement !== announcement) {
        setShowAnnouncement(true);
      } else {
        setShowAnnouncement(Boolean(!hasSeenAnnouncement && announcement));
      }
    }
  }, [announcement]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleCloseAnnouncement = (announcement: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', announcement); // 记录已查看弹窗
  };

  return (
    <PageLayout>
      <div className='px-2 sm:px-10 pt-16 sm:pt-12 pb-4 sm:pb-8 overflow-visible'>
        <section className='mb-10'>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const trimmed = searchQuery.trim();
              const originalQuery = trimmed;
              if (!trimmed) {
                setSearchResults([]);
                setHasSearched(false);
                setSearchError(null);
                return;
              }

              // Check if the query looks like an English title (mostly ASCII characters)
              // Avoid control characters in regex to satisfy ESLint/no-control-regex.
              const isLikelyEnglish = Array.from(trimmed).every((ch) => {
                const code = ch.charCodeAt(0);
                // treat printable ASCII (space .. DEL) and common whitespace as English
                return (
                  (code >= 32 && code <= 127) ||
                  ch === '\n' ||
                  ch === '\r' ||
                  ch === '\t'
                );
              });

              const performSearch = async () => {
                const searchOnce = async (query: string) => {
                  const response = await fetch(
                    `/api/search?q=${encodeURIComponent(query)}`
                  );
                  if (!response.ok) {
                    throw new Error(
                      tt(
                        `Search failed (${response.status})`,
                        `搜索失败 (${response.status})`,
                        `搜尋失敗 (${response.status})`
                      )
                    );
                  }
                  const data = (await response.json()) as {
                    results?: SearchResult[];
                  };
                  return data.results ?? [];
                };

                const dedupe = (items: SearchResult[]) => {
                  const seen = new Set<string>();
                  return items.filter((item) => {
                    const key = `${item.source}-${item.id}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                  });
                };

                try {
                  setSearching(true);
                  setSearchError(null);
                  const primaryResults = await searchOnce(trimmed);
                  let combinedResults = primaryResults;

                  if (isLikelyEnglish) {
                    let converted = trimmed;
                    try {
                      const response = await fetch(
                        `/api/title-convert?title=${encodeURIComponent(originalQuery)}`
                      );
                      if (response.ok) {
                        const data = await response.json();
                        if (data.title) {
                          converted = data.title;
                        }
                      }
                    } catch (error) {
                      console.warn(
                        'Failed to convert English title to Chinese:',
                        error
                      );
                    }

                    if (converted !== trimmed) {
                      const translatedResults = await searchOnce(converted);
                      combinedResults = dedupe([
                        ...primaryResults,
                        ...translatedResults,
                      ]);
                    }
                  }

                  setSearchResults(combinedResults);
                  setHasSearched(true);
                } catch (err) {
                  setSearchError(
                    err instanceof Error
                      ? err.message
                      : tt('Search failed', '搜索失败', '搜尋失敗')
                  );
                  setSearchResults([]);
                  setHasSearched(true);
                } finally {
                  setSearching(false);
                }
              };

              void performSearch();
            }}
            className='max-w-3xl mx-auto'
          >
            <div className='relative shadow-lg rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/60 backdrop-blur'>
              <input
                type='text'
                className='w-full py-4 px-6 pr-20 text-base sm:text-lg bg-transparent focus:outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-400'
                placeholder={tt(
                  'Search for a title, actor, or keyword',
                  '输入影片、演员或关键字',
                  '輸入想看的影片、演員或關鍵字'
                )}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoComplete='off'
              />
              <div className='absolute inset-y-0 right-0 flex items-center gap-2 pr-4'>
                {searchQuery && (
                  <button
                    type='button'
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                      setHasSearched(false);
                      setSearchError(null);
                    }}
                    className='text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors'
                  >
                    {tt('Clear', '清除', '清除')}
                  </button>
                )}
                <button
                  type='submit'
                  className='px-4 py-2 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition-colors'
                  disabled={searching}
                >
                  {tt('Search', '搜索', '搜尋')}
                </button>
              </div>
            </div>
          </form>

          <div className='mt-6'>
            {searchError && (
              <p className='text-sm text-red-600 dark:text-red-400 text-center'>
                {searchError}
              </p>
            )}

            {searching && (
              <div className='mt-8 grid gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'>
                {Array.from({ length: 8 }).map((_, idx) => (
                  <div
                    key={idx}
                    className='h-56 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse'
                  />
                ))}
              </div>
            )}

            {hasSearched &&
              !searching &&
              searchResults.length === 0 &&
              !searchError && (
                <p className='mt-8 text-center text-gray-500 dark:text-gray-400'>
                  {tt(
                    'No results. Try a different keyword.',
                    '找不到相关内容，试试其他关键字。',
                    '找不到相關內容，試試其他關鍵字。'
                  )}
                </p>
              )}

            {searchResults.length > 0 && (
              <div className='mt-8'>
                <div className='flex items-center justify-between mb-4'>
                  <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                    {tt('Search results', '搜索结果', '搜尋結果')}
                  </h2>
                  <span className='text-sm text-gray-500 dark:text-gray-400'>
                    {tt(
                      `Total ${searchResults.length}`,
                      `共 ${searchResults.length} 条`,
                      `共 ${searchResults.length} 筆`
                    )}
                  </span>
                </div>
                <div className='grid gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'>
                  {searchResults.map((item, index) => (
                    <VideoCard
                      key={`${item.source}-${item.id}-${index}`}
                      id={item.id}
                      source={item.source}
                      title={item.title}
                      poster={item.poster}
                      douban_id={item.douban_id}
                      rate={item.rate}
                      year={item.year}
                      episodes={item.episodes?.length}
                      source_name={item.source_name}
                      query={item.title}
                      from='search'
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {!hasSearched && !searching && !searchError && (
          <div className='mt-12 text-center text-gray-500 dark:text-gray-400 text-sm'>
            {tt(
              'Type a keyword above to start searching.',
              '输入关键字开始搜索。',
              '輸入關鍵字開始搜尋。'
            )}
          </div>
        )}
      </div>
      {announcement && showAnnouncement && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm dark:bg-black/70 p-4 transition-opacity duration-300 ${
            showAnnouncement ? '' : 'opacity-0 pointer-events-none'
          }`}
          onTouchStart={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          onTouchMove={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
          onTouchEnd={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          style={{
            touchAction: 'none', // 禁用所有觸摸操作
          }}
        >
          <div
            className='w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-gray-900 transform transition-all duration-300 hover:shadow-2xl'
            onTouchMove={(e) => {
              e.stopPropagation();
            }}
            style={{
              touchAction: 'auto', // 允許內容區域的正常觸摸操作
            }}
          >
            <div className='flex justify-between items-start mb-4'>
              <h3 className='text-2xl font-bold tracking-tight text-gray-800 dark:text-white border-b border-green-500 pb-1'>
                {tt('Notice', '提示', '提示')}
              </h3>
              <button
                onClick={() => handleCloseAnnouncement(announcement)}
                className='text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-white transition-colors'
                aria-label={tt('Close', '关闭', '關閉')}
              ></button>
            </div>
            <div className='mb-6'>
              <div className='relative overflow-hidden rounded-lg mb-4 bg-green-50 dark:bg-green-900/20'>
                <div className='absolute inset-y-0 left-0 w-1.5 bg-green-500 dark:bg-green-400'></div>
                <p className='ml-4 text-gray-600 dark:text-gray-300 leading-relaxed'>
                  {convertToTraditional(announcement)}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCloseAnnouncement(announcement)}
              className='w-full rounded-lg bg-gradient-to-r from-green-600 to-green-700 px-4 py-3 text-white font-medium shadow-md hover:shadow-lg hover:from-green-700 hover:to-green-800 dark:from-green-600 dark:to-green-700 dark:hover:from-green-700 dark:hover:to-green-800 transition-all duration-300 transform hover:-translate-y-0.5'
            >
              {tt('Got it', '我知道了', '我知道了')}
            </button>
          </div>
        </div>
      )}
    </PageLayout>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeClient />
    </Suspense>
  );
}
