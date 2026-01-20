'use client';

import { tt } from '../shared/i18n';

const infoSources = [
  {
    key: 'douban',
    name: 'Douban',
    description: tt('Ratings + metadata', '评分与影片信息', '評分與影片資訊'),
  },
  {
    key: 'tmdb',
    name: 'TMDB',
    description: tt('Posters + metadata', '海报与元数据', '海報與中繼資料'),
  },
  {
    key: 'imdb',
    name: 'IMDb',
    description: tt('English title + ratings', '英文标题与评分', '英文標題與評分'),
  },
  {
    key: 'wmdb',
    name: 'WMDB',
    description: tt(
      'Aggregated metadata (Douban/IMDb/RT)',
      '聚合信息（豆瓣/IMDb/烂番茄）',
      '聚合資訊（豆瓣/IMDb/爛番茄）'
    ),
  },
];

export default function InfoSourceConfig() {
  return (
    <div className='space-y-4'>
      <div className='rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/70 p-4'>
        <div className='flex items-center justify-between'>
          <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            {tt('Info sources', '信息来源', '資訊來源')}
          </h4>
          <span className='text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'>
            {tt('Built-in', '内置', '內建')}
          </span>
        </div>
        <p className='mt-2 text-xs text-gray-500 dark:text-gray-400'>
          {tt(
            'Metadata-only sources (no streams). Managed by the app and not part of api_site.',
            '仅提供元数据（无播放源）。由应用内置管理，不在 api_site 列表中。',
            '僅提供中繼資料（無播放來源）。由應用內建管理，不在 api_site 清單中。'
          )}
        </p>
        <div className='mt-3 grid gap-2 sm:grid-cols-2'>
          {infoSources.map((source) => (
            <div
              key={source.key}
              className='rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200/70 dark:border-gray-700/60 px-3 py-2'
            >
              <div className='text-sm font-semibold text-gray-800 dark:text-gray-100'>
                {source.name}
              </div>
              <div className='text-xs text-gray-500 dark:text-gray-400'>
                {source.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
