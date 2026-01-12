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

export function HeroMobile({
  currentHero,
  currentCategoryLabel,
  heroItems,
  heroIndex,
  onSelect,
  tt,
}: HeroProps) {
  return (
    <section className='rounded-2xl border border-gray-200/60 dark:border-gray-800 bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 shadow-lg overflow-hidden'>
      <div className='p-4 flex flex-col gap-4'>
        <div className='flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-green-300'>
          <span>{currentCategoryLabel}</span>
          <span className='w-1 h-1 rounded-full bg-green-700 dark:bg-green-500'></span>
          <span>{tt('Mobile stack', '手机竖屏', '手機豎屏')}</span>
        </div>

        <div className='relative w-full rounded-xl overflow-hidden shadow-2xl border border-white/10'>
          {currentHero?.poster ? (
            <img
              src={currentHero.poster}
              alt={currentHero.title}
              className='w-full h-full object-cover'
            />
          ) : (
            <div className='aspect-[2/3] bg-gray-700'></div>
          )}
          <div className='absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent'></div>
          <div className='absolute bottom-0 left-0 right-0 p-4 space-y-1'>
            <h2 className='text-white font-bold text-xl line-clamp-2'>
              {currentHero?.title || tt('Discover now', '发现好片', '發現好片')}
            </h2>
            <p className='text-gray-200/80 text-sm line-clamp-2'>
              {tt(
                'Tap play to start with the first provider, or open details to explore more sources.',
                '直接播放将从第一个来源开始，详情可查看更多来源。',
                '直接播放將從第一個來源開始，詳情可查看更多來源。'
              )}
            </p>
            <div className='text-gray-300 text-xs'>
              {currentHero?.year || ''}
              {currentHero?.rate ? ` · ${currentHero.rate}` : ''}
            </div>
          </div>
        </div>

        <div className='flex flex-wrap gap-3'>
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

        <div className='bg-black/20 border border-white/5 rounded-xl p-3'>
          <div className='flex items-center justify-between mb-2 text-sm text-gray-200'>
            <span>{tt('Top picks', '精选', '精選')}</span>
            <span className='text-gray-400'>
              {tt('Swipe to preview', '左右滑动预览', '左右滑動預覽')}
            </span>
          </div>
          <div className='flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:"none"] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
            {heroItems.slice(0, 10).map((item, idx) => {
              const active = heroIndex % heroItems.length === idx;
              return (
                <button
                  key={`${item.title}-${idx}`}
                  onClick={() => onSelect(idx)}
                  className={`relative flex-shrink-0 w-24 rounded-xl overflow-hidden transition ${
                    active
                      ? 'ring-2 ring-green-300/70 border border-green-400/70'
                      : 'border border-white/10 hover:border-green-300/50'
                  }`}
                  style={{ scrollSnapAlign: 'start' }}
                >
                  <div className='aspect-[2/3] bg-gray-700'>
                    {item.poster && (
                      <img
                        src={item.poster}
                        alt={item.title}
                        className='w-full h-full object-cover'
                      />
                    )}
                  </div>
                  <div className='p-2 text-[11px] text-gray-100 line-clamp-2 text-left bg-black/60'>
                    {item.title}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
