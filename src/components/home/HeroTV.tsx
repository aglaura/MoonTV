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

export function HeroTV({
  currentHero,
  currentCategoryLabel,
  heroItems,
  heroIndex,
  onSelect,
  tt,
}: HeroProps) {
  return (
    <section className='rounded-2xl border border-gray-200/40 dark:border-gray-800 shadow-lg bg-gradient-to-br from-black via-gray-900 to-emerald-900/50 overflow-hidden'>
      <div className='grid grid-cols-1 lg:grid-cols-[minmax(0,2.5fr)_minmax(260px,1fr)] gap-0'>
        <div className='p-6 lg:p-10 flex flex-col gap-5'>
          <div className='flex items-center gap-2 text-sm uppercase tracking-[0.25em] text-green-200'>
            <span>{currentCategoryLabel}</span>
            <span className='w-1.5 h-1.5 rounded-full bg-green-400'></span>
            <span>{tt('TV wall', '电视瀑布流', '電視瀑布流')}</span>
          </div>
          <div className='flex flex-row gap-6 items-start'>
            <div className='relative w-52 flex-shrink-0 rounded-2xl overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.45)] border border-white/10'>
              {currentHero?.poster ? (
                <img
                  src={currentHero.poster}
                  alt={currentHero.title}
                  className='w-full h-full object-cover'
                />
              ) : (
                <div className='aspect-[2/3] bg-gray-700'></div>
              )}
              <div className='absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent'></div>
            </div>
            <div className='flex-1 flex flex-col gap-3 max-w-4xl'>
              <h2 className='font-extrabold text-white leading-tight text-4xl lg:text-5xl line-clamp-2'>
                {currentHero?.title || tt('Discover now', '发现好片', '發現好片')}
              </h2>
              <p className='text-gray-200/85 text-lg line-clamp-3'>
                {tt(
                  'Tap play to start with the first provider, or open details to explore more sources.',
                  '直接播放将从第一个来源开始，详情可查看更多来源。',
                  '直接播放將從第一個來源開始，詳情可查看更多來源。'
                )}
              </p>
              <div className='text-gray-300 text-base'>
                {currentHero?.year || ''}
                {currentHero?.rate ? ` · ${currentHero.rate}` : ''}
              </div>
              <div className='flex flex-wrap gap-4 mt-2'>
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

        <div className='bg-black/25 border-l border-white/10 p-4 h-full'>
          <div className='flex items-center justify-between mb-4 text-sm text-gray-100'>
            <span>{tt('Top picks', '精选', '精選')}</span>
            <span className='text-gray-400'>
              {tt('Tap to preview', '点击切换预览', '點擊切換預覽')}
            </span>
          </div>
          <div className='flex gap-3 overflow-x-auto pb-2 [-ms-overflow-style:"none"] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
            {heroItems.slice(0, 12).map((item, idx) => {
              const active = heroIndex % heroItems.length === idx;
              return (
                <button
                  key={`${item.title}-${idx}`}
                  onClick={() => onSelect(idx)}
                  className={`relative flex-shrink-0 w-32 rounded-2xl overflow-hidden transition ${
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
                  <div className='p-2 text-[11px] text-gray-100 line-clamp-2 text-left bg-black/50'>
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
