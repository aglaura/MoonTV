import { ArrowLeft } from 'lucide-react';

import { useUserLanguage } from '@/lib/userLanguage.client';

const labelForLocale = (locale: string) => {
  switch (locale) {
    case 'zh-Hans':
      return '返回';
    case 'zh-Hant':
      return '返回';
    default:
      return 'Back';
  }
};

export function BackButton() {
  const { userLocale } = useUserLanguage();
  const ariaLabel = labelForLocale(userLocale || 'en');

  return (
    <button
      onClick={() => window.history.back()}
      className='w-10 h-10 p-2 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200/50 dark:text-gray-300 dark:hover:bg-gray-700/50 transition-colors'
      aria-label={ariaLabel}
    >
      <ArrowLeft className='w-full h-full' />
    </button>
  );
}
