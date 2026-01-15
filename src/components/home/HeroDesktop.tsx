import Image from 'next/image';

import VideoCard from '@/components/VideoCard';

type Card = {
  title: string;
  poster?: string;
  rate?: string;
  year?: string;
  douban_id?: number;
  type?: string;
  query?: string;
  source_name?: string;
};

interface HeroProps {
  currentHero?: Card;
  currentCategoryLabel: string;
  heroItems: Card[];
  heroIndex: number;
  onSelect: (idx: number) => void;
  tt: (en: string, zhHans: string, zhHant: string) => string;
}

export function HeroDesktop({
  currentHero,
  currentCategoryLabel,
  heroItems,
  heroIndex,
  onSelect,
  tt,
}: HeroProps) {
  return (
    <section className='rounded-2xl border border-gray-200/60 dark:border-gray-800 bg-gradient-to-r from-gray-900 via-gray-900 to-gray-800 dark:from-black dark:via-gray-900 dark:to-gray-800 shadow-lg overflow-hidden'>
      <div className='grid lg:grid-cols-[minmax(0,2fr)_minmax(240px,1fr)] gap-0'>
        <div className='p-4 sm:p-6 lg:p-8 flex flex-col gap-4 sm:gap-5'>
          <div className='flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-green-300'>
            <span>{currentCategoryLabel}</span>
            <span className='w-1 h-1 rounded-full bg-green-700 dark:bg-green-500'></span>
            <span>{tt('Desktop grid', '桌面网格', '桌面網格')}</span>
          </div>
          <div className='flex flex-col lg:flex-row gap-4 items-start lg:items-center'>
            <div className='relative w-40 sm:w-48 flex-shrink-0 rounded-xl overflow-hidden shadow-2xl border border-white/10'>
              {currentHero?.poster ? (
                <Image
                  src={currentHero.poster}
                  alt={currentHero.title}
                  fill
                  sizes='(max-width: 1024px) 40vw, 240px'
                  className='object-cover'
                  priority
                />
              ) : (
                <div className='aspect-[2/3] bg-gray-700'></div>
              )}
              <div className='absolute inset-0 bg-gradient-to-t from-black/50 via-black/10 to-transparent'></div>
            </div>
            <div className='flex-1 flex flex-col gap-2 max-w-3xl'>
              <h2 className='font-bold text-white leading-tight line-clamp-2 text-2xl sm:text-3xl lg:text-4xl'>
                {currentHero?.title || tt('Discover now', '发现好片', '發現好片')}
              </h2>
              <p className='text-gray-200/80 line-clamp-3 text-sm sm:text-base'>
                {tt(
                  'Tap play to start with the first provider, or open details to explore more sources.',
                  '直接播放将从第一个来源开始，详情可查看更多来源。',
                  '直接播放將從第一個來源開始，詳情可查看更多來源。'
                )}
              </p>
              <div className='text-gray-300 text-sm'>
                {currentHero?.year || ''}
                {currentHero?.rate ? ` · ${currentHero.rate}` : ''}
              </div>
              <div className='flex flex-wrap gap-3 mt-2'>
                {currentHero && (
                  <VideoCard
                    from='douban'
                    title={currentHero.title}
                    poster={currentHero.poster}
                    douban_id={currentHero.douban_id}
                    rate={currentHero.rate}
                    year={currentHero.year}
                    type={currentHero.type}
                    query={currentHero.query}
                    source_name={currentHero.source_name}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
        <div className='bg-black/20 border-l border-white/5 p-3 sm:p-4 h-full'>
          <div className='flex items-center justify-between mb-3 text-sm text-gray-200'>
            <span>{tt('Top picks', '精选', '精選')}</span>
            <span className='text-gray-400'>
              {tt('Tap to preview', '点击切换预览', '點擊切換預覽')}
            </span>
          </div>
          <div className='relative'>
            <div className='flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:"none"] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
              {heroItems.slice(0, 10).map((item, idx) => {
                const active = heroIndex % heroItems.length === idx;
                return (
                  <button
                    key={`${item.title}-${idx}`}
                    onClick={() => onSelect(idx)}
                    className={`relative flex-shrink-0 w-28 sm:w-32 rounded-2xl overflow-hidden transition ${
                      active
                        ? 'ring-2 ring-green-300/70 border border-green-400/70'
                        : 'border border-white/10 hover:border-green-300/50'
                    }`}
                    style={{ scrollSnapAlign: 'start' }}
                  >
                    <div className='aspect-[2/3] bg-gray-700'>
                    {item.poster && (
                      <Image
                        src={item.poster}
                        alt={item.title}
                        fill
                        sizes='120px'
                        className='object-cover'
                        priority={idx < 3}
                      />
                    )}
                    </div>
                    <div className='p-2 text-[11px] text-gray-100 line-clamp-2 text-left bg-black/50'>
                      {item.title}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
