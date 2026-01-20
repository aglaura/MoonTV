/* eslint-disable @next/next/no-img-element */

import { Heart } from 'lucide-react';

import type { OMDBEnrichment } from '@/lib/omdb.client';
import type { TvmazeContribution } from '@/lib/tvmaze.client';
import { processImageUrl } from '@/lib/utils';

type Translate = (en: string, zhHans: string, zhHant: string) => string;

type MetadataLists = {
  genres: string[];
  regions: string[];
  languages: string[];
  directors: string[];
  writers: string[];
  actors: string[];
};

type DetailData = {
  year?: string;
  douban_id?: number;
  type_name?: string;
  class?: string;
  source_name?: string;
  episodes?: number | string[];
};

type PlayDetailsProps = {
  displayTitleText: string;
  displayTitleWithEnglish: string;
  englishVideoTitle?: string;
  introTags: string[];
  imdbVideoId?: string;
  imdbLink?: string;
  detail?: DetailData | null;
  videoYear?: string;
  omdbData: OMDBEnrichment | null;
  tvmazeData: TvmazeContribution | null;
  metadataLists: MetadataLists;
  metadataSynopsis?: string;
  mergedReleaseDates: string[];
  mergedDurations: string[];
  showOmdbRuntime: boolean;
  tmdbSeasons: any[];
  tmdbRecommendations: any[];
  tmdbLink?: string;
  tmdbId?: string;
  synopsisText?: string;
  favorited: boolean;
  onToggleFavorite: () => void;
  tt: Translate;
  convertToTraditional: (text?: string) => string | undefined;
  videoCover?: string;
};

const PlayDetails = ({
  displayTitleText,
  displayTitleWithEnglish,
  englishVideoTitle,
  introTags,
  imdbVideoId,
  imdbLink,
  detail,
  videoYear,
  omdbData,
  tvmazeData,
  metadataLists,
  metadataSynopsis,
  mergedReleaseDates,
  mergedDurations,
  showOmdbRuntime,
  tmdbSeasons,
  tmdbRecommendations,
  tmdbLink,
  tmdbId,
  synopsisText,
  favorited,
  onToggleFavorite,
  tt,
  convertToTraditional,
  videoCover,
}: PlayDetailsProps) => {
  const tvmazeSeasons = tvmazeData?.seasons ?? [];
  const tvmazeEpisodeCount = tvmazeData?.totalEpisodes;
  const tvmazeStatusLabel = tvmazeData?.status
    ? {
        Running: tt('Running', '连载中', '連載中'),
        Ended: tt('Ended', '已完结', '已完結'),
        'To Be Determined': tt('TBD', '待定', '待定'),
        'In Development': tt('In development', '开发中', '開發中'),
      }[tvmazeData.status] || tvmazeData.status
    : undefined;
  const tvmazeScheduleLabel = tvmazeData?.schedule
    ? [tvmazeData.schedule.days?.join(', '), tvmazeData.schedule.time]
        .filter(Boolean)
        .join(' ')
    : '';
  const tvmazeNextEpisodeLabel = tvmazeData?.nextEpisode
    ? [
        [
          tvmazeData.nextEpisode.season
            ? `S${tvmazeData.nextEpisode.season}`
            : '',
          tvmazeData.nextEpisode.number
            ? `E${tvmazeData.nextEpisode.number}`
            : '',
        ]
          .filter(Boolean)
          .join(''),
        tvmazeData.nextEpisode.airdate,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className='grid grid-cols-1 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] gap-2.5 md:gap-3'>
      {/* 文字区 */}
      <div className='md:col-span-3'>
        <div className='p-4 flex flex-col min-h-0 space-y-3 bg-white/70 dark:bg-gray-900/60 rounded-xl border border-gray-200/60 dark:border-gray-800 shadow-sm'>
          {/* 标题 */}
          <div className='flex items-start justify-between gap-3 flex-wrap sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur px-2 py-2 rounded-lg'>
            <div className='min-w-0'>
              <h1 className='text-3xl font-bold tracking-wide flex items-center flex-shrink-0 text-center md:text-left w-full'>
                <span className='truncate'>
                  {displayTitleText}
                  {englishVideoTitle && (
                    <span className='ml-2 text-xl font-normal text-gray-500 dark:text-gray-400'>
                      ({englishVideoTitle})
                    </span>
                  )}
                </span>
              </h1>
              <div className='mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600 dark:text-gray-300'>
                {(detail?.year || videoYear || omdbData?.year) && (
                  <span className='px-2 py-[2px] rounded-full bg-gray-200/70 dark:bg-white/10'>
                    {detail?.year || videoYear || omdbData?.year}
                  </span>
                )}
                {introTags.map((tag, idx) => (
                  <span
                    key={`${tag}-${idx}`}
                    className='px-2 py-[2px] rounded-full bg-gray-500/10 text-gray-800 dark:text-gray-200 dark:bg-gray-500/20'
                  >
                    {tag}
                  </span>
                ))}
                {imdbVideoId && (
                  <a
                    href={imdbLink || '#'}
                    target='_blank'
                    rel='noreferrer'
                    className='px-2 py-[2px] rounded-full bg-yellow-500/10 text-yellow-700 dark:bg-yellow-500/15 dark:text-yellow-300 hover:underline'
                    title={englishVideoTitle || imdbVideoId}
                  >
                    IMDb {imdbVideoId}
                  </a>
                )}
                {detail?.douban_id && (
                  <span className='px-2 py-[2px] rounded-full bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'>
                    Douban {detail.douban_id}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite();
              }}
              className='ml-auto flex-shrink-0 hover:opacity-80 transition-opacity'
              aria-label={tt('Favorite', '收藏', '收藏')}
            >
              <FavoriteIcon filled={favorited} />
            </button>
          </div>

          {/* 简介 + 重点信息 */}
          <div className='grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-3 min-h-0'>
            <div className='min-h-0'>
              {synopsisText ? (
                <div
                  className='text-base leading-relaxed opacity-90 overflow-y-auto pr-2 flex-1 min-h-0 scrollbar-hide'
                  style={{ whiteSpace: 'pre-line' }}
                >
                  {convertToTraditional(synopsisText) || synopsisText}
                </div>
              ) : (
                <div className='text-sm text-gray-500 dark:text-gray-400'>
                  {tt(
                    'No synopsis available',
                    '暂无剧情简介',
                    '暫無劇情簡介'
                  )}
                </div>
              )}
            </div>
            <div className='bg-gray-100/80 dark:bg-white/5 rounded-lg p-3 border border-gray-200/70 dark:border-gray-800 space-y-2 text-sm text-gray-700 dark:text-gray-200'>
              <div className='font-semibold text-gray-800 dark:text-gray-100'>
                {tt('Metadata', '影片信息', '影片資訊')}
              </div>
              <div className='space-y-2'>
                {englishVideoTitle && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      IMDb Title
                    </span>
                    <span className='font-medium text-right'>
                      {englishVideoTitle}
                    </span>
                  </div>
                )}
                {(imdbVideoId || detail?.douban_id) && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      IDs
                    </span>
                    <span className='font-medium text-right space-x-2'>
                      {imdbVideoId && (
                        <a
                          href={imdbLink || '#'}
                          target='_blank'
                          rel='noreferrer'
                          className='underline decoration-dotted hover:text-yellow-600 dark:hover:text-yellow-400'
                        >
                          IMDb: {imdbVideoId}
                        </a>
                      )}
                      {detail?.douban_id && <span>Douban: {detail.douban_id}</span>}
                    </span>
                  </div>
                )}
                {omdbData &&
                  (omdbData.imdbRating ||
                    omdbData.metascore ||
                    omdbData.rottenTomatoesScore ||
                    omdbData.awards) && (
                    <div className='pt-2 border-t border-gray-200 dark:border-gray-800 space-y-2'>
                      <div className='text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 font-semibold'>
                        {tt('Ratings', '评分', '評分')}
                      </div>
                      {omdbData.imdbRating && (
                        <div className='flex justify-between gap-3'>
                          <span className='text-gray-500 dark:text-gray-400'>
                            IMDb
                          </span>
                          <span className='font-medium text-right text-yellow-600 dark:text-yellow-400'>
                            ⭐ {omdbData.imdbRating}
                            {omdbData.imdbVotes && (
                              <span className='text-xs text-gray-500 dark:text-gray-400 ml-1'>
                                ({parseInt(omdbData.imdbVotes).toLocaleString()})
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                      {omdbData.rottenTomatoesScore && (
                        <div className='flex justify-between gap-3'>
                          <span className='text-gray-500 dark:text-gray-400'>
                            Rotten Tomatoes
                          </span>
                          <span className='font-medium text-right text-red-600 dark:text-red-400'>
                            🍅 {omdbData.rottenTomatoesScore}
                          </span>
                        </div>
                      )}
                      {omdbData.metascore && (
                        <div className='flex justify-between gap-3'>
                          <span className='text-gray-500 dark:text-gray-400'>
                            Metacritic
                          </span>
                          <span className='font-medium text-right text-blue-600 dark:text-blue-400'>
                            {omdbData.metascore}/100
                          </span>
                        </div>
                      )}
                      {omdbData.awards && (
                        <div className='flex justify-between gap-3 items-start'>
                          <span className='text-gray-500 dark:text-gray-400'>
                            Awards
                          </span>
                          <span className='font-medium text-right text-sm text-amber-600 dark:text-amber-400'>
                            {omdbData.awards}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                {(detail?.class || detail?.type_name || omdbData?.type) && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Category', '类型', '類型')}
                    </span>
                    <span className='font-medium text-right'>
                      {convertToTraditional(
                        detail?.type_name ||
                          detail?.class ||
                          omdbData?.type ||
                          ''
                      ) ||
                        detail?.type_name ||
                        detail?.class ||
                        omdbData?.type}
                    </span>
                  </div>
                )}
                {omdbData?.rated && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Rated', '分级', '分級')}
                    </span>
                    <span className='font-medium text-right'>{omdbData.rated}</span>
                  </div>
                )}
                {metadataLists.genres.length > 0 && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Genres', '类型', '類型')}
                    </span>
                    <span className='font-medium text-right'>
                      {metadataLists.genres
                        .map((g: string) => convertToTraditional(g) || g)
                        .join(' / ')}
                    </span>
                  </div>
                )}
                {metadataLists.regions.length > 0 && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Regions', '地区', '地區')}
                    </span>
                    <span className='font-medium text-right'>
                      {metadataLists.regions
                        .map((c: string) => convertToTraditional(c) || c)
                        .join(' / ')}
                    </span>
                  </div>
                )}
                {metadataLists.languages.length > 0 && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Languages', '语言', '語言')}
                    </span>
                    <span className='font-medium text-right'>
                      {metadataLists.languages
                        .map((c: string) => convertToTraditional(c) || c)
                        .join(' / ')}
                      </span>
                    </div>
                  )}
                {(() => {
                  const episodes = detail?.episodes;
                  const fallbackCount = Array.isArray(episodes)
                    ? episodes.length
                    : episodes;
                  const episodeCount = tvmazeEpisodeCount || fallbackCount;
                  if (!episodeCount || episodeCount <= 0) return null;
                  return (
                    <div className='flex justify-between gap-3'>
                      <span className='text-gray-500 dark:text-gray-400'>
                        {tvmazeEpisodeCount
                          ? tt('Episodes (TVmaze)', '集数 (TVmaze)', '集數 (TVmaze)')
                          : tt('Episodes', '集数', '集數')}
                      </span>
                      <span className='font-medium text-right'>
                        {episodeCount}
                      </span>
                    </div>
                  );
                })()}
                {tvmazeStatusLabel && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Status', '状态', '狀態')}
                    </span>
                    <span className='font-medium text-right'>
                      {tvmazeStatusLabel}
                    </span>
                  </div>
                )}
                {tvmazeScheduleLabel && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Schedule', '播出时间', '播出時間')}
                    </span>
                    <span className='font-medium text-right'>
                      {tvmazeScheduleLabel}
                    </span>
                  </div>
                )}
                {tvmazeNextEpisodeLabel && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Next episode', '下一集', '下一集')}
                    </span>
                    <span className='font-medium text-right'>
                      {tvmazeNextEpisodeLabel}
                    </span>
                  </div>
                )}
                {mergedDurations.length > 0 && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Duration', '片长', '片長')}
                    </span>
                    <span className='font-medium text-right'>
                      {mergedDurations.join(' / ')}
                    </span>
                  </div>
                )}
                {showOmdbRuntime && omdbData?.runtime && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Runtime (OMDb)', '片长 (OMDb)', '片長 (OMDb)')}
                    </span>
                    <span className='font-medium text-right'>
                      {omdbData.runtime}
                    </span>
                  </div>
                )}
                {mergedReleaseDates.length > 0 && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Release dates', '上映日期', '上映日期')}
                    </span>
                    <span className='font-medium text-right'>
                      {mergedReleaseDates.join(' / ')}
                    </span>
                  </div>
                )}
                {metadataLists.directors.length > 0 && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Directors', '导演', '導演')}
                    </span>
                    <span className='font-medium text-right'>
                      {metadataLists.directors
                        .map((d: string) => convertToTraditional(d) || d)
                        .join(' / ')}
                    </span>
                  </div>
                )}
                {metadataLists.writers.length > 0 && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Writers', '编剧', '編劇')}
                    </span>
                    <span className='font-medium text-right'>
                      {metadataLists.writers
                        .map((w: string) => convertToTraditional(w) || w)
                        .join(' / ')}
                    </span>
                  </div>
                )}
                {metadataLists.actors.length > 0 && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Actors', '主演', '主演')}
                    </span>
                    <span className='font-medium text-right'>
                      {metadataLists.actors
                        .map((a: string) => convertToTraditional(a) || a)
                        .join(' / ')}
                    </span>
                  </div>
                )}
                {(detail?.year || videoYear || omdbData?.year) && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Year', '年份', '年份')}
                    </span>
                    <span className='font-medium text-right'>
                      {detail?.year || videoYear || omdbData?.year}
                    </span>
                  </div>
                )}
                {omdbData?.boxOffice && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Box office', '票房', '票房')}
                    </span>
                    <span className='font-medium text-right'>
                      {omdbData.boxOffice}
                    </span>
                  </div>
                )}
                {omdbData?.production && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Production', '制片公司', '製片公司')}
                    </span>
                    <span className='font-medium text-right'>
                      {omdbData.production}
                    </span>
                  </div>
                )}
                {omdbData?.website && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Website', '官网', '官網')}
                    </span>
                    <a
                      className='font-medium text-right text-green-600 dark:text-green-400 underline'
                      href={omdbData.website}
                      target='_blank'
                      rel='noreferrer'
                    >
                      {omdbData.website}
                    </a>
                  </div>
                )}
                {detail?.source_name && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Initial source', '初始来源', '初始來源')}
                    </span>
                    <span className='font-medium text-right'>
                      {convertToTraditional(detail.source_name) ||
                        detail.source_name}
                    </span>
                  </div>
                )}
                {metadataSynopsis && (
                  <div className='pt-2 border-t border-gray-200 dark:border-gray-800 text-sm leading-relaxed text-gray-700 dark:text-gray-300'>
                    <div className='text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1'>
                      {tt('Synopsis', '简介', '簡介')}
                    </div>
                    <div>
                      {convertToTraditional(metadataSynopsis) || metadataSynopsis}
                    </div>
                  </div>
                )}
                {tvmazeSeasons.length > 0 ? (
                  <div className='flex justify-between gap-3 items-start'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Seasons (TVmaze)', 'TVmaze 季度', 'TVmaze 季度')}
                    </span>
                    <span className='font-medium text-right text-sm space-y-1'>
                      {tvmazeSeasons.slice(0, 3).map((s) => (
                        <div key={`tvmaze-${s.season}`}>
                          {`S${s.season}`}{' '}
                          {s.episodeCount ? `(${s.episodeCount} ep)` : ''}
                        </div>
                      ))}
                      {tvmazeSeasons.length > 3 && (
                        <div className='text-xs text-gray-500'>
                          {tt(
                            `+${tvmazeSeasons.length - 3} more`,
                            `+${tvmazeSeasons.length - 3} 季`,
                            `+${tvmazeSeasons.length - 3} 季`
                          )}
                        </div>
                      )}
                    </span>
                  </div>
                ) : (
                  tmdbSeasons.length > 0 && (
                    <div className='flex justify-between gap-3 items-start'>
                      <span className='text-gray-500 dark:text-gray-400'>
                        {tt('Seasons (TMDB)', 'TMDB 季度', 'TMDB 季度')}
                      </span>
                      <span className='font-medium text-right text-sm space-y-1'>
                        {tmdbSeasons.slice(0, 3).map((s: any) => (
                          <div key={s.id ?? s.name}>
                            {`${s.name || `S${s.season_number || ''}`}`}{' '}
                            {s.episode_count ? `(${s.episode_count} ep)` : ''}
                          </div>
                        ))}
                        {tmdbSeasons.length > 3 && (
                          <div className='text-xs text-gray-500'>
                            {tt(
                              `+${tmdbSeasons.length - 3} more`,
                              `+${tmdbSeasons.length - 3} 季`,
                              `+${tmdbSeasons.length - 3} 季`
                            )}
                          </div>
                        )}
                      </span>
                    </div>
                  )
                )}
                {tmdbRecommendations.length > 0 && (
                  <div className='flex justify-between gap-3 items-start'>
                    <span className='text-gray-500 dark:text-gray-400'>
                      {tt('Related (TMDB)', 'TMDB 相关推荐', 'TMDB 相關推薦')}
                    </span>
                    <span className='font-medium text-right text-sm space-y-1 max-w-xs'>
                      {tmdbRecommendations.slice(0, 4).map((r: any) => (
                        <div key={r.id}>{r.name || r.title || ''}</div>
                      ))}
                    </span>
                  </div>
                )}
                {tmdbLink && (
                  <div className='flex justify-between gap-3'>
                    <span className='text-gray-500 dark:text-gray-400'>TMDB</span>
                    <a
                      className='text-green-600 dark:text-green-400 underline'
                      href={tmdbLink}
                      target='_blank'
                      rel='noreferrer'
                    >
                      {tmdbId}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 封面展示 */}
      <div className='hidden md:block md:col-span-1 md:order-first'>
        <div className='pl-0 py-4 pr-6'>
          <div className='bg-gray-300 dark:bg-gray-700 aspect-[2/3] flex items-center justify-center rounded-xl overflow-hidden'>
            {videoCover ? (
              <img
                src={processImageUrl(videoCover)}
                alt={displayTitleWithEnglish}
                className='w-full h-full object-cover'
              />
            ) : (
              <span className='text-gray-600 dark:text-gray-400'>
                {tt('Cover image', '封面图片', '封面圖片')}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const FavoriteIcon = ({ filled }: { filled: boolean }) => {
  if (filled) {
    return (
      <svg
        className='h-7 w-7'
        viewBox='0 0 24 24'
        xmlns='http://www.w3.org/2000/svg'
      >
        <path
          d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'
          fill='#ef4444'
          stroke='#ef4444'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
        />
      </svg>
    );
  }
  return (
    <Heart className='h-7 w-7 stroke-[1] text-gray-600 dark:text-gray-300' />
  );
};

export default PlayDetails;
