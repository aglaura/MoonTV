/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps, no-console */

'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { resolveUiLocale, tt } from '@/lib/i18n.client';
import { convertToTraditional } from '@/lib/locale';
import { SearchResult } from '@/lib/types';
import { isKidSafeContent, useKidsMode } from '@/lib/kidsMode.client';

import PageLayout from '@/components/PageLayout';
import { useSite } from '@/components/SiteProvider';
import VideoCard from '@/components/VideoCard';

function HomeClient() {
  const { announcement } = useSite();
  const uiLocale = resolveUiLocale();
  const announcementText = useMemo(() => {
    if (!announcement) return '';
    if (typeof window !== 'undefined') {
      const saved = window.localStorage.getItem('userLocale');
      const nav = navigator?.language?.toLowerCase() || '';
      if (
        saved === 'zh-Hant' ||
        nav.includes('zh-hant') ||
        nav.includes('zh-tw') ||
        nav.includes('zh-hk')
      ) {
        return convertToTraditional(announcement);
      }
    }
    return announcement;
  }, [announcement]);

  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);

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
  const [wikiResults, setWikiResults] = useState<
    Array<{
      title: string;
      snippet: string;
      pageid: number;
      url?: string;
      thumbnail?: string;
    }>
  >([]);
  const [wikiLoading, setWikiLoading] = useState(false);
  const [wikiError, setWikiError] = useState<string | null>(null);
  const initializedHistoryRef = useRef(false);
  const { isKidsMode } = useKidsMode();

  useEffect(() => {
    if (typeof window === 'undefined' || initializedHistoryRef.current) return;
    initializedHistoryRef.current = true;
    try {
      const stored = localStorage.getItem('searchHistory');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setSearchHistory(parsed.filter((v) => typeof v === 'string'));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const saveHistory = useCallback((terms: string[]) => {
    setSearchHistory(terms);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('searchHistory', JSON.stringify(terms));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const addToHistory = useCallback(
    (term: string) => {
      const cleaned = term.trim();
      if (!cleaned) return;
      setSearchHistory((prev) => {
        const next = [cleaned, ...prev.filter((item) => item !== cleaned)].slice(
          0,
          10
        );
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('searchHistory', JSON.stringify(next));
          } catch {
            /* ignore */
          }
        }
        return next;
      });
    },
    []
  );

  const resolveWikiLang = useCallback(
    (query: string) => {
      if (/[\u4e00-\u9fff]/.test(query)) return 'zh';
      return uiLocale === 'zh-Hans' || uiLocale === 'zh-Hant' ? 'zh' : 'en';
    },
    [uiLocale]
  );

  const toPlainSnippet = useCallback((snippet: string) => {
    if (!snippet) return '';
    if (typeof document === 'undefined') {
      return snippet.replace(/<[^>]+>/g, '').trim();
    }
    const node = document.createElement('div');
    node.innerHTML = snippet;
    return (node.textContent || '').trim();
  }, []);

  const runSearch = useCallback(
    async (input: string) => {
      const trimmed = input.trim();
      const originalQuery = trimmed;
      if (!trimmed) {
        setSearchResults([]);
        setHasSearched(false);
        setSearchError(null);
        setWikiResults([]);
        setWikiError(null);
        setWikiLoading(false);
        return;
      }

      const isLikelyEnglish = Array.from(trimmed).every((ch) => {
        const code = ch.charCodeAt(0);
        return (
          (code >= 32 && code <= 127) ||
          ch === '\n' ||
          ch === '\r' ||
          ch === '\t'
        );
      });

      const performSearch = async () => {
        let wikiQuery = trimmed;
        const wikiLang = resolveWikiLang(trimmed);

        const searchOnce = async (query: string) => {
          const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
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
          setWikiError(null);
          setWikiLoading(true);
          setWikiResults([]);
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
              console.warn('Failed to convert English title to Chinese:', error);
            }

            if (converted !== trimmed) {
              const translatedResults = await searchOnce(converted);
              combinedResults = dedupe([...primaryResults, ...translatedResults]);
              wikiQuery = converted;
            }
          }

          const filtered = isKidsMode
            ? combinedResults.filter((item) =>
                isKidSafeContent({
                  title: item.title,
                  desc: item.original_title || item.type_name || '',
                  type: item.type_name || '',
                })
              )
            : combinedResults;

          setSearchResults(filtered);
          setHasSearched(true);
          addToHistory(originalQuery);

          try {
            const response = await fetch(
              `/api/wiki/search?query=${encodeURIComponent(
                wikiQuery
              )}&lang=${encodeURIComponent(wikiLang)}`
            );
            if (!response.ok) {
              throw new Error(`Wiki ${response.status}`);
            }
            const data = (await response.json()) as {
              results?: Array<{
                title: string;
                snippet: string;
                pageid: number;
                url?: string;
                thumbnail?: string;
              }>;
            };
            setWikiResults(Array.isArray(data.results) ? data.results : []);
          } catch (err) {
            setWikiError(
              err instanceof Error
                ? err.message
                : tt('Wiki lookup failed', '百科检索失败', '百科檢索失敗')
            );
            setWikiResults([]);
          } finally {
            setWikiLoading(false);
          }
        } catch (err) {
          setSearchError(
            err instanceof Error
              ? err.message
              : tt('Search failed', '搜索失败', '搜尋失敗')
          );
          setSearchResults([]);
          setHasSearched(true);
          setWikiResults([]);
          setWikiLoading(false);
        } finally {
          setSearching(false);
        }
      };

      void performSearch();
    },
    [addToHistory, tt, isKidsMode, resolveWikiLang]
  );

  const handleCloseAnnouncement = (announcement: string) => {
    setShowAnnouncement(false);
    localStorage.setItem('hasSeenAnnouncement', announcement); // 记录已查看弹窗
  };

  const aggregatedResults = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        id: string;
        title: string;
        original_title?: string;
        poster: string;
        rate?: string;
        year: string;
        douban_id?: number;
        imdbId?: string;
        episodesCount: number;
      }
    >();

    const buildKey = (item: SearchResult) => {
      const imdbId = (item as unknown as { imdbId?: string; imdb_id?: string })
        ?.imdbId
        ?.toString()
        .toLowerCase() ||
        (item as unknown as { imdb_id?: string })?.imdb_id?.toString().toLowerCase();
      if (imdbId) return `imdb:${imdbId}`;
      if (item.douban_id) return `douban:${item.douban_id}`;
      const baseTitle = (item.title || '').trim().toLowerCase();
      const originalTitle = (item.original_title || '').trim().toLowerCase();
      const titleKey = baseTitle || originalTitle || (item.id || '').toString();
      const yearKey = (item.year || '').trim();
      return `${titleKey}#${yearKey}`;
    };

    searchResults.forEach((item) => {
      const key = buildKey(item);
      const existing = map.get(key);
      const episodesCount = Array.isArray(item.episodes)
        ? item.episodes.length
        : 0;

      if (!existing) {
        map.set(key, {
          key,
          id: item.id,
          title: item.title,
          original_title: item.original_title,
          poster: item.poster,
          rate: item.rate,
          year: item.year,
          douban_id: item.douban_id,
          imdbId: (item as unknown as { imdbId?: string })?.imdbId,
          episodesCount,
        });
        return;
      }

      const mergedEpisodes = Math.max(existing.episodesCount, episodesCount);
      const mergedPoster = existing.poster || item.poster;
      const mergedRate = existing.rate || item.rate;
      const mergedYear = existing.year || item.year;
      const mergedTitle = existing.title || item.title;
      const mergedOriginal = existing.original_title || item.original_title;
      const mergedDouban = existing.douban_id || item.douban_id;

      map.set(key, {
        ...existing,
        poster: mergedPoster,
        rate: mergedRate,
        year: mergedYear,
        title: mergedTitle,
        original_title: mergedOriginal,
        douban_id: mergedDouban,
        episodesCount: mergedEpisodes,
      });
    });

    return Array.from(map.values());
  }, [searchResults]);

  return (
    <PageLayout activePath='/search'>
      <div className='px-2 sm:px-10 pt-16 sm:pt-12 pb-4 sm:pb-8 overflow-visible'>
        {isKidsMode && (
          <div className='mb-3 flex justify-center'>
            <span className='px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold dark:bg-amber-900/60 dark:text-amber-50 border border-amber-200 dark:border-amber-700'>
              {tt('Kids mode is on', '少儿模式已开启', '少兒模式已開啟')}
            </span>
          </div>
        )}
        <section className='mb-10'>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              void runSearch(searchQuery);
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

          {searchHistory.length > 0 && (
            <div className='mt-3 max-w-3xl mx-auto flex items-center flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300'>
              <span className='text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400'>
                {tt('Recent', '最近', '最近')}
              </span>
              {searchHistory.map((term) => (
                <button
                  key={term}
                  className='px-2.5 py-1 rounded-full bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 transition-colors'
                  onClick={() => {
                    setSearchQuery(term);
                    void runSearch(term);
                  }}
                >
                  {term}
                </button>
              ))}
              <button
                className='ml-auto text-[11px] text-gray-500 hover:text-red-500 dark:text-gray-400 dark:hover:text-red-400'
                onClick={() => saveHistory([])}
              >
                {tt('Clear', '清空', '清空')}
              </button>
            </div>
          )}

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

            {aggregatedResults.length > 0 && (
              <div className='mt-8'>
                <div className='flex items-center justify-between mb-4'>
                  <h2 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
                    {tt('Search results', '搜索结果', '搜尋結果')}
                  </h2>
                  <span className='text-sm text-gray-500 dark:text-gray-400'>
                    {tt(
                      `Total ${aggregatedResults.length}`,
                      `共 ${aggregatedResults.length} 条`,
                      `共 ${aggregatedResults.length} 筆`
                    )}
                  </span>
                </div>
                <div className='grid gap-6 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'>
                  {aggregatedResults.map((item) => (
                    <VideoCard
                      key={item.key}
                      id={item.id}
                      source={undefined}
                      title={item.title}
                      poster={item.poster}
                      douban_id={item.douban_id}
                      rate={item.rate}
                      year={item.year}
                      episodes={item.episodesCount}
                      source_name={undefined}
                      query={item.title}
                      isAggregate
                      from='search'
                    />
                  ))}
                </div>
              </div>
            )}

            {(wikiLoading ||
              wikiError ||
              (hasSearched && wikiResults.length > 0)) && (
              <div className='mt-8'>
                <div className='flex items-center justify-between mb-3'>
                  <h2 className='text-lg font-semibold text-gray-800 dark:text-gray-200'>
                    {tt('Wikipedia', '维基百科', '維基百科')}
                  </h2>
                  <span className='text-xs text-gray-500 dark:text-gray-400'>
                    {tt('Knowledge quick look', '知识速览', '知識速覽')}
                  </span>
                </div>
                {wikiLoading && (
                  <div className='grid gap-3 sm:grid-cols-2'>
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <div
                        key={idx}
                        className='h-24 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse'
                      />
                    ))}
                  </div>
                )}
                {wikiError && (
                  <p className='text-sm text-red-500 dark:text-red-400'>
                    {wikiError}
                  </p>
                )}
                {!wikiLoading && !wikiError && wikiResults.length === 0 && (
                  <p className='text-sm text-gray-500 dark:text-gray-400'>
                    {tt(
                      'No Wikipedia matches.',
                      '没有百科匹配结果。',
                      '沒有百科匹配結果。'
                    )}
                  </p>
                )}
                {!wikiLoading && wikiResults.length > 0 && (
                  <div className='grid gap-3 sm:grid-cols-2'>
                    {wikiResults.map((item) => (
                      <a
                        key={item.pageid}
                        href={item.url || '#'}
                        target='_blank'
                        rel='noreferrer'
                        className='group flex gap-3 rounded-xl border border-gray-200/70 dark:border-gray-800 bg-white/80 dark:bg-gray-900/60 p-3 hover:border-emerald-300 dark:hover:border-emerald-600 transition-colors'
                      >
                        <div className='h-16 w-12 rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800 flex-shrink-0'>
                          {item.thumbnail ? (
                            <img
                              src={item.thumbnail}
                              alt={item.title}
                              className='h-full w-full object-cover'
                            />
                          ) : (
                            <div className='h-full w-full flex items-center justify-center text-[10px] text-gray-400'>
                              {tt('No image', '无图片', '無圖片')}
                            </div>
                          )}
                        </div>
                        <div className='min-w-0'>
                          <div className='text-sm font-semibold text-gray-900 dark:text-gray-100 truncate'>
                            {item.title}
                          </div>
                          <div className='text-xs text-gray-600 dark:text-gray-300 line-clamp-3'>
                            {toPlainSnippet(item.snippet)}
                          </div>
                          <div className='mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity'>
                            {tt('Open in Wikipedia', '打开维基百科', '打開維基百科')}
                          </div>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
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
      {announcementText && showAnnouncement && (
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
                onClick={() => handleCloseAnnouncement(announcement || '')}
                className='text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-white transition-colors'
                aria-label={tt('Close', '关闭', '關閉')}
              ></button>
            </div>
            <div className='mb-6'>
              <div className='relative overflow-hidden rounded-lg mb-4 bg-green-50 dark:bg-green-900/20'>
                <div className='absolute inset-y-0 left-0 w-1.5 bg-green-500 dark:bg-green-400'></div>
                <p className='ml-4 text-gray-600 dark:text-gray-300 leading-relaxed'>
                  {announcementText}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleCloseAnnouncement(announcement || '')}
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
