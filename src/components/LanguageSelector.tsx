'use client';

import { Listbox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronsUpDown } from 'lucide-react';
import { Fragment } from 'react';

import { useUserLanguage } from '@/lib/userLanguage.client';

type LanguageSelectorVariant = 'default' | 'compact';

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'zh-Hant', label: '繁體中文' },
];

export default function LanguageSelector({
  variant = 'default',
}: {
  variant?: LanguageSelectorVariant;
}) {
  const { userLocale, changeLanguage, loading, error } = useUserLanguage();

  // Find the current language option
  const currentLanguage =
    languageOptions.find((lang) => lang.value === userLocale) ||
    languageOptions[0]; // Default to English

  if (loading) {
    return (
      <div className='animate-pulse flex items-center text-sm text-gray-500 dark:text-gray-400'>
        <span>...</span>
      </div>
    );
  }

  const wrapperClassName = variant === 'compact' ? 'w-24' : 'w-40';
  const buttonClassName =
    variant === 'compact'
      ? 'relative w-full cursor-default rounded-md bg-white/60 dark:bg-gray-800/60 py-1.5 pl-2.5 pr-9 text-left border border-gray-300/70 dark:border-gray-600/60 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 text-xs backdrop-blur'
      : 'relative w-full cursor-default rounded-md bg-white dark:bg-gray-800 py-2 pl-3 pr-10 text-left shadow-sm border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 sm:text-sm';
  const optionsClassName =
    variant === 'compact'
      ? 'absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white/90 dark:bg-gray-800/90 py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none text-xs backdrop-blur'
      : 'absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm';

  return (
    <div className={wrapperClassName}>
      <Listbox
        value={currentLanguage}
        onChange={(lang) => changeLanguage(lang.value)}
      >
        <div className='relative'>
          <Listbox.Button className={buttonClassName}>
            <span className='block truncate'>{currentLanguage.label}</span>
            <span className='pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2'>
              <ChevronsUpDown
                className='h-4 w-4 text-gray-400'
                aria-hidden='true'
              />
            </span>
          </Listbox.Button>
          <Transition
            as={Fragment}
            leave='transition ease-in duration-100'
            leaveFrom='opacity-100'
            leaveTo='opacity-0'
          >
            <Listbox.Options className={optionsClassName}>
              {languageOptions.map((language, languageIdx) => (
                <Listbox.Option
                  key={languageIdx}
                  className={({ active }) =>
                    `relative cursor-default select-none py-2 pl-3 pr-9 ${
                      active
                        ? 'bg-green-600 text-white'
                        : 'text-gray-900 dark:text-gray-100'
                    }`
                  }
                  value={language}
                >
                  {({ selected, active }) => (
                    <>
                      <span
                        className={`block truncate ${
                          selected ? 'font-semibold' : 'font-normal'
                        }`}
                      >
                        {language.label}
                      </span>
                      {selected ? (
                        <span
                          className={`absolute inset-y-0 right-0 flex items-center pr-4 ${
                            active ? 'text-white' : 'text-green-600'
                          }`}
                        >
                          <CheckIcon
                            className='h-4 w-4'
                            aria-hidden='true'
                          />
                        </span>
                      ) : null}
                    </>
                  )}
                </Listbox.Option>
              ))}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
      {error && variant !== 'compact' && (
        <div className='mt-1 text-xs text-red-500 dark:text-red-400'>
          Error: {error}
        </div>
      )}
    </div>
  );
}
