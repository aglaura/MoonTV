/* eslint-disable @typescript-eslint/no-explicit-any */

'use client';

import { Settings, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

const LOCALE_TEXTS: Record<string, Record<string, string>> = {
  en: {
    settingsTitle: 'Settings',
    reset: 'Reset',
    resetTitle: 'Reset to defaults',
    admin: 'Admin',
    adminTitle: 'Admin settings',
    aggregateTitle: 'Aggregate search results',
    aggregateDesc: 'Group results by title and year by default',
    optimizationTitle: 'Enable optimization & speed test',
    optimizationDesc: 'Disable if the player is hijacked by ads',
    doubanProxyTitle: 'Douban data proxy',
    doubanProxyDesc:
      'Set a proxy URL to bypass Douban restrictions (leave empty to use server API)',
    doubanProxyPlaceholder: 'e.g. https://proxy.example.com/fetch?url=',
    imageProxyToggleTitle: 'Enable image proxy',
    imageProxyToggleDesc: 'When enabled, all images load via the proxy',
    imageProxyUrlTitle: 'Image proxy URL',
    imageProxyUrlDesc: 'Only applies when image proxy is enabled',
    imageProxyUrlPlaceholder: 'e.g. https://imageproxy.example.com/?url=',
    footerNote: 'These settings are stored in this browser',
    settingsAria: 'Settings',
    closeAria: 'Close',
  },
  'zh-Hans': {
    settingsTitle: '设置',
    reset: '重置',
    resetTitle: '重置为默认设置',
    admin: '管理',
    adminTitle: '管理设置',
    aggregateTitle: '默认聚合搜索结果',
    aggregateDesc: '搜索时默认按标题与年份聚合显示结果',
    optimizationTitle: '启用优选与测速',
    optimizationDesc: '如出现播放器劫持问题可关闭',
    doubanProxyTitle: '豆瓣数据代理',
    doubanProxyDesc:
      '设置代理 URL 以绕过豆瓣访问限制，留空则使用服务端 API',
    doubanProxyPlaceholder: '例如：https://proxy.example.com/fetch?url=',
    imageProxyToggleTitle: '启用图片代理',
    imageProxyToggleDesc: '启用后，所有图片加载将通过代理服务器',
    imageProxyUrlTitle: '图片代理地址',
    imageProxyUrlDesc: '仅在启用图片代理时生效',
    imageProxyUrlPlaceholder: '例如：https://imageproxy.example.com/?url=',
    footerNote: '这些设置保存在本地浏览器中',
    settingsAria: '设置',
    closeAria: '关闭',
  },
  'zh-Hant': {
    settingsTitle: '設定',
    reset: '重置',
    resetTitle: '重置為預設設定',
    admin: '管理',
    adminTitle: '管理設定',
    aggregateTitle: '預設聚合搜尋結果',
    aggregateDesc: '搜尋時預設按標題與年份聚合顯示結果',
    optimizationTitle: '啟用優選與測速',
    optimizationDesc: '如出現播放器劫持問題可關閉',
    doubanProxyTitle: '豆瓣數據代理',
    doubanProxyDesc:
      '設定代理 URL 以繞過豆瓣訪問限制，留空則使用服務端 API',
    doubanProxyPlaceholder: '例如：https://proxy.example.com/fetch?url=',
    imageProxyToggleTitle: '啟用圖片代理',
    imageProxyToggleDesc: '啟用後，所有圖片載入將透過代理伺服器',
    imageProxyUrlTitle: '圖片代理地址',
    imageProxyUrlDesc: '僅在啟用圖片代理時生效',
    imageProxyUrlPlaceholder: '例如：https://imageproxy.example.com/?url=',
    footerNote: '這些設定保存在本地瀏覽器中',
    settingsAria: '設定',
    closeAria: '關閉',
  },
};

export const SettingsButton: React.FC = () => {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [defaultAggregateSearch, setDefaultAggregateSearch] = useState(true);
  const [doubanProxyUrl, setDoubanProxyUrl] = useState('');
  const [imageProxyUrl, setImageProxyUrl] = useState('');
  const [enableOptimization, setEnableOptimization] = useState(true);
  const [enableImageProxy, setEnableImageProxy] = useState(false);
  const [mounted, setMounted] = useState(false);

  const locale = useMemo(() => {
    if (typeof window === 'undefined') return 'en';
    const saved = localStorage.getItem('userLocale');
    if (saved) return saved;
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('zh-cn') || nav.startsWith('zh-hans')) return 'zh-Hans';
    if (
      nav.startsWith('zh-tw') ||
      nav.startsWith('zh-hant') ||
      nav.startsWith('zh-hk')
    ) {
      return 'zh-Hant';
    }
    return 'en';
  }, []);

  const t = useCallback(
    (key: string) =>
      LOCALE_TEXTS[locale]?.[key] ??
      LOCALE_TEXTS['en']?.[key] ??
      key,
    [locale]
  );

  // 确保组件已挂载
  useEffect(() => {
    setMounted(true);
  }, []);

  // 从 localStorage 读取设置
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedAggregateSearch = localStorage.getItem(
        'defaultAggregateSearch'
      );
      if (savedAggregateSearch !== null) {
        setDefaultAggregateSearch(JSON.parse(savedAggregateSearch));
      }

      const savedDoubanProxyUrl = localStorage.getItem('doubanProxyUrl');
      if (savedDoubanProxyUrl !== null) {
        setDoubanProxyUrl(savedDoubanProxyUrl);
      }

      const savedEnableImageProxy = localStorage.getItem('enableImageProxy');
      const defaultImageProxy =
        (window as any).RUNTIME_CONFIG?.IMAGE_PROXY || '';
      if (savedEnableImageProxy !== null) {
        setEnableImageProxy(JSON.parse(savedEnableImageProxy));
      } else if (defaultImageProxy) {
        // 如果有默认图片代理配置，则默认开启
        setEnableImageProxy(true);
      }

      const savedImageProxyUrl = localStorage.getItem('imageProxyUrl');
      if (savedImageProxyUrl !== null) {
        setImageProxyUrl(savedImageProxyUrl);
      } else if (defaultImageProxy) {
        setImageProxyUrl(defaultImageProxy);
      }

      const savedEnableOptimization =
        localStorage.getItem('enableOptimization');
      if (savedEnableOptimization !== null) {
        setEnableOptimization(JSON.parse(savedEnableOptimization));
      }
    }
  }, []);

  // 保存设置到 localStorage
  const handleAggregateToggle = (value: boolean) => {
    setDefaultAggregateSearch(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('defaultAggregateSearch', JSON.stringify(value));
    }
  };

  const handleDoubanProxyUrlChange = (value: string) => {
    setDoubanProxyUrl(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('doubanProxyUrl', value);
    }
  };

  const handleImageProxyUrlChange = (value: string) => {
    setImageProxyUrl(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('imageProxyUrl', value);
    }
  };

  const handleOptimizationToggle = (value: boolean) => {
    setEnableOptimization(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('enableOptimization', JSON.stringify(value));
    }
  };

  const handleImageProxyToggle = (value: boolean) => {
    setEnableImageProxy(value);
    if (typeof window !== 'undefined') {
      localStorage.setItem('enableImageProxy', JSON.stringify(value));
    }
  };

  const handleSettingsClick = () => {
    setIsOpen(!isOpen);
  };

  const handleClosePanel = () => {
    setIsOpen(false);
  };

  const handleOpenAdmin = () => {
    setIsOpen(false);
    router.push('/admin');
  };

  // 重置所有设置为默认值
  const handleResetSettings = () => {
    const defaultImageProxy = (window as any).RUNTIME_CONFIG?.IMAGE_PROXY || '';

    // 重置所有状态
    setDefaultAggregateSearch(true);
    setEnableOptimization(true);
    setDoubanProxyUrl('');
    setEnableImageProxy(!!defaultImageProxy);
    setImageProxyUrl(defaultImageProxy);

    // 保存到 localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('defaultAggregateSearch', JSON.stringify(true));
      localStorage.setItem('enableOptimization', JSON.stringify(true));
      localStorage.setItem('doubanProxyUrl', '');
      localStorage.setItem(
        'enableImageProxy',
        JSON.stringify(!!defaultImageProxy)
      );
      localStorage.setItem('imageProxyUrl', defaultImageProxy);
    }
  };

  // 设置面板内容
  const settingsPanel = (
    <>
      {/* 背景遮罩 */}
      <div
        className='fixed inset-0 bg-black/50 backdrop-blur-sm z-[1000]'
        onClick={handleClosePanel}
      />

      {/* 设置面板 */}
      <div className='fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl z-[1001] p-6'>
        {/* 标题栏 */}
        <div className='flex items-center justify-between mb-6'>
          <div className='flex items-center gap-3'>
            <h3 className='text-xl font-bold text-gray-800 dark:text-gray-200'>
              {t('settingsTitle')}
            </h3>
            <button
              onClick={handleResetSettings}
              className='px-2 py-1 text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 border border-red-200 hover:border-red-300 dark:border-red-800 dark:hover:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors'
              title={t('resetTitle')}
              type='button'
            >
              {t('reset')}
            </button>
            <button
              onClick={handleOpenAdmin}
              className='px-2 py-1 text-xs text-gray-600 hover:text-gray-800 dark:text-gray-300 dark:hover:text-white border border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/60 rounded transition-colors'
              title={t('adminTitle')}
              type='button'
            >
              {t('admin')}
            </button>
          </div>
          <button
            onClick={handleClosePanel}
            className='w-8 h-8 p-1 rounded-full flex items-center justify-center text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors'
            aria-label={t('closeAria')}
          >
            <X className='w-full h-full' />
          </button>
        </div>

        {/* 设置项 */}
        <div className='space-y-6'>
          {/* 默认聚合搜索结果 */}
          <div className='flex items-center justify-between'>
            <div>
              <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                {t('aggregateTitle')}
              </h4>
              <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                {t('aggregateDesc')}
              </p>
            </div>
            <label className='flex items-center cursor-pointer'>
              <div className='relative'>
                <input
                  type='checkbox'
                  className='sr-only peer'
                  checked={defaultAggregateSearch}
                  onChange={(e) => handleAggregateToggle(e.target.checked)}
                />
                <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
              </div>
            </label>
          </div>

          {/* 优选和测速 */}
          <div className='flex items-center justify-between'>
            <div>
              <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                {t('optimizationTitle')}
              </h4>
              <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                {t('optimizationDesc')}
              </p>
            </div>
            <label className='flex items-center cursor-pointer'>
              <div className='relative'>
                <input
                  type='checkbox'
                  className='sr-only peer'
                  checked={enableOptimization}
                  onChange={(e) => handleOptimizationToggle(e.target.checked)}
                />
                <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
              </div>
            </label>
          </div>

          {/* 豆瓣代理设置 */}
          <div className='space-y-3'>
            <div>
              <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                {t('doubanProxyTitle')}
              </h4>
              <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                {t('doubanProxyDesc')}
              </p>
            </div>
            <input
              type='text'
              className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent'
              placeholder={t('doubanProxyPlaceholder')}
              value={doubanProxyUrl}
              onChange={(e) => handleDoubanProxyUrlChange(e.target.value)}
            />
          </div>

          {/* 图片代理开关 */}
          <div className='flex items-center justify-between'>
            <div>
              <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                {t('imageProxyToggleTitle')}
              </h4>
              <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                {t('imageProxyToggleDesc')}
              </p>
            </div>
            <label className='flex items-center cursor-pointer'>
              <div className='relative'>
                <input
                  type='checkbox'
                  className='sr-only peer'
                  checked={enableImageProxy}
                  onChange={(e) => handleImageProxyToggle(e.target.checked)}
                />
                <div className='w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-green-500 transition-colors dark:bg-gray-600'></div>
                <div className='absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform peer-checked:translate-x-5'></div>
              </div>
            </label>
          </div>

          {/* 图片代理地址设置 */}
          <div className='space-y-3'>
            <div>
              <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
                {t('imageProxyUrlTitle')}
              </h4>
              <p className='text-xs text-gray-500 dark:text-gray-400 mt-1'>
                {t('imageProxyUrlDesc')}
              </p>
            </div>
            <input
              type='text'
              className={`w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors ${
                enableImageProxy
                  ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400'
                  : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 placeholder-gray-400 dark:placeholder-gray-600 cursor-not-allowed'
              }`}
              placeholder={t('imageProxyUrlPlaceholder')}
              value={imageProxyUrl}
              onChange={(e) => handleImageProxyUrlChange(e.target.value)}
              disabled={!enableImageProxy}
            />
          </div>
        </div>

        {/* 底部说明 */}
        <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700'>
          <p className='text-xs text-gray-500 dark:text-gray-400 text-center'>
            {t('footerNote')}
          </p>
        </div>
      </div>
    </>
  );

  return (
    <>
      <button
        onClick={handleSettingsClick}
        className='w-10 h-10 p-2 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200/50 dark:text-gray-300 dark:hover:bg-gray-700/50 transition-colors'
        aria-label={t('settingsAria')}
      >
        <Settings className='w-full h-full' />
      </button>

      {/* 使用 Portal 将设置面板渲染到 document.body */}
      {isOpen && mounted && createPortal(settingsPanel, document.body)}
    </>
  );
};
