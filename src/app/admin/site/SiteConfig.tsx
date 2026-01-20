'use client';

import { useState, useEffect } from 'react';
import Swal from 'sweetalert2';
import { AdminConfig } from '@/lib/admin.types';

import { tt } from '../shared/i18n';
import { showError, showSuccess } from '../shared/alerts';
import { callApi } from '../shared/adminFetch';

interface SiteConfigProps {
  config: AdminConfig | null;
}

interface SiteConfigData {
  SiteName: string;
  Announcement: string;
  SearchDownstreamMaxPage: number;
  SiteInterfaceCacheTime: number;
  ImageProxy: string;
}

const SiteConfigComponent = ({ config }: SiteConfigProps) => {
  const [siteSettings, setSiteSettings] = useState<SiteConfigData>({
    SiteName: '',
    Announcement: '',
    SearchDownstreamMaxPage: 1,
    SiteInterfaceCacheTime: 7200,
    ImageProxy: '',
  });
  const [saving, setSaving] = useState(false);
  const [testingConfigJson, setTestingConfigJson] = useState(false);
  const [testSummary, setTestSummary] = useState<string | null>(null);

  interface RuntimeConfig {
    STORAGE_TYPE?: 'd1' | 'kv';
  }

  const runtimeConfig =
    typeof window !== 'undefined'
      ? (window as { RUNTIME_CONFIG?: RuntimeConfig }).RUNTIME_CONFIG
      : undefined;

  const isD1Storage = runtimeConfig?.STORAGE_TYPE === 'd1';

  useEffect(() => {
    if (config?.SiteConfig) {
      setSiteSettings({
        ...config.SiteConfig,
        ImageProxy: config.SiteConfig.ImageProxy || '',
      });
    }
  }, [config]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await callApi('/api/admin/site', { ...siteSettings });

      showSuccess(
        tt(
          'Saved. Please refresh the page.',
          '保存成功，请刷新页面。',
          '保存成功，請重新整理頁面'
        )
      );
    } catch (err) {
      // Error is handled by callApi
    } finally {
      setSaving(false);
    }
  };

  const handleTestConfigJson = async () => {
    try {
      setTestingConfigJson(true);
      const resp = await fetch('/api/admin/configjson-test', {
        method: 'POST',
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(
          data?.error ||
            tt(
              `HTTP ${resp.status}`,
              `HTTP ${resp.status}`,
              `HTTP ${resp.status}`
            )
        );
      }

      const lines = [
        `CONFIGJSON: ${data.baseUrl || '-'}`,
        `config.json: ${data.configOk ? 'OK' : 'FAIL'}${
          data.configStatus ? ` (${data.configStatus})` : ''
        }${data.configParsable === false ? ' (parse failed)' : ''}`,
        data.posterHelperStatus
          ? `poster.php: ${data.posterHelperOk ? 'OK' : 'FAIL'} (${data.posterHelperStatus})`
          : undefined,
        `poster write (${data.posterUploadMethod || 'POST'}): ${
          data.posterPostOk ? 'OK' : 'FAIL'
        }${data.posterPostStatus ? ` (${data.posterPostStatus})` : ''}`,
        data.posterHtmlPostStatus
          ? `poster.php POST: ${data.posterHtmlPostOk ? 'OK' : 'FAIL'} (${data.posterHtmlPostStatus})`
          : undefined,
        `poster GET: ${data.posterGetOk ? 'OK' : 'FAIL'}${
          data.posterGetStatus ? ` (${data.posterGetStatus})` : ''
        }${
          data.posterContentMatches === false ? ' (content mismatch)' : ''
        }`,
      ];

      // Append detail rows when failed
      const detailLines: string[] = [];
      if (!data.configOk && data.configError) {
        detailLines.push(`config.json error: ${data.configError}`);
      }
      if (data.configParsable === false) {
        detailLines.push('config.json not valid JSON');
      }
      if (data.posterPostOk === false && data.posterPostError) {
        detailLines.push(`poster POST error: ${data.posterPostError}`);
      }
      if (data.posterHtmlPostOk === false && data.posterHtmlPostError) {
        detailLines.push(`poster.php POST error: ${data.posterHtmlPostError}`);
      }
      if (!data.posterGetOk && data.posterGetError) {
        detailLines.push(`poster GET error: ${data.posterGetError}`);
      }
      if (data.posterUploadMethod) {
        lines.push(`upload method: ${data.posterUploadMethod}`);
      }
      if (detailLines.length > 0) {
        lines.push(...detailLines);
      }

      setTestSummary(lines.join(' • '));

      Swal.fire({
        icon: data.success ? 'success' : 'warning',
        title: tt('CONFIGJSON test', 'CONFIGJSON 测试', 'CONFIGJSON 測試'),
        html: lines.join('<br/>'),
      });
    } catch (err) {
      setTestSummary(null);
      showError(
        err instanceof Error
          ? err.message
          : tt('Test failed', '测试失败', '測試失敗')
      );
    } finally {
      setTestingConfigJson(false);
    }
  };

  if (!config) {
    return (
      <div className='text-center text-gray-500 dark:text-gray-400'>
        {tt('Loading…', '加载中…', '載入中...')}
      </div>
    );
  }

  return (
    <div className='space-y-6'>
      {/* 站点名稱 */}
      <div>
        <label
          className={`block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 ${
            isD1Storage ? 'opacity-50' : ''
          }`}
        >
          {tt('Site name', '站点名称', '站點名稱')}
          {isD1Storage && (
            <span className='ml-2 text-xs text-gray-500 dark:text-gray-400'>
              {tt(
                '(Not editable on D1)',
                '(D1 环境下不可修改)',
                '(D1 環境下不可修改)'
              )}
            </span>
          )}
        </label>
        <input
          type='text'
          value={siteSettings.SiteName}
          onChange={(e) =>
            !isD1Storage &&
            setSiteSettings((prev) => ({ ...prev, SiteName: e.target.value }))
          }
          disabled={isD1Storage}
          className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent ${
            isD1Storage ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        />
      </div>

      {/* 站點公告 */}
      <div>
        <label
          className={`block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 ${
            isD1Storage ? 'opacity-50' : ''
          }`}
        >
          {tt('Announcement', '站点公告', '站點公告')}
          {isD1Storage && (
            <span className='ml-2 text-xs text-gray-500 dark:text-gray-400'>
              {tt(
                '(Not editable on D1)',
                '(D1 环境下不可修改)',
                '(D1 環境下不可修改)'
              )}
            </span>
          )}
        </label>
        <textarea
          value={siteSettings.Announcement}
          onChange={(e) =>
            !isD1Storage &&
            setSiteSettings((prev) => ({
              ...prev,
              Announcement: e.target.value,
            }))
          }
          disabled={isD1Storage}
          rows={3}
          className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent ${
            isD1Storage ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        />
      </div>

      {/* 搜尋接口可拉取最大頁數 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          {tt(
            'Max pages to fetch (search)',
            '搜索接口可拉取最大页数',
            '搜尋接口可拉取最大頁數'
          )}
        </label>
        <input
          type='number'
          min={1}
          value={siteSettings.SearchDownstreamMaxPage}
          onChange={(e) =>
            setSiteSettings((prev) => ({
              ...prev,
              SearchDownstreamMaxPage: Number(e.target.value),
            }))
          }
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
        />
      </div>

      {/* 站点接口缓存时间 */}
      <div>
        <label className='block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2'>
          {tt(
            'API cache time (seconds)',
            '站点接口缓存时间（秒）',
            '站點接口快取時間（秒）'
          )}
        </label>
        <input
          type='number'
          min={1}
          value={siteSettings.SiteInterfaceCacheTime}
          onChange={(e) =>
            setSiteSettings((prev) => ({
              ...prev,
              SiteInterfaceCacheTime: Number(e.target.value),
            }))
          }
          className='w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
        />
      </div>

      {/* 图片代理 */}
      <div>
        <label
          className={`block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 ${
            isD1Storage ? 'opacity-50' : ''
          }`}
        >
          {tt('Image proxy prefix', '图片代理前缀', '圖片代理前綴')}
          {isD1Storage && (
            <span className='ml-2 text-xs text-gray-500 dark:text-gray-400'>
              {tt(
                '(Not editable on D1)',
                '(D1 环境下不可修改)',
                '(D1 環境下不可修改)'
              )}
            </span>
          )}
        </label>
        <input
          type='text'
          placeholder={tt(
            'e.g. https://imageproxy.example.com/?url=',
            '例如：https://imageproxy.example.com/?url=',
            '例如：https://imageproxy.example.com/?url='
          )}
          value={siteSettings.ImageProxy}
          onChange={(e) =>
            !isD1Storage &&
            setSiteSettings((prev) => ({
              ...prev,
              ImageProxy: e.target.value,
            }))
          }
          disabled={isD1Storage}
          className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent ${
            isD1Storage ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        />
        <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
          {tt(
            'Used to proxy image requests (CORS/restriction workaround). Leave empty to disable.',
            '用于代理图片访问，解决跨域或访问限制问题。留空则不使用代理。',
            '用於代理圖片存取，解決跨域或訪問限制問題。留空則不使用代理。'
          )}
        </p>
      </div>

      {/* 操作按钮 */}
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
        <div className='text-xs text-gray-600 dark:text-gray-400'>
          {testSummary
            ? testSummary
            : tt(
                'Test CONFIGJSON availability and poster cache write/read.',
                '测试 CONFIGJSON 可访问性及海报缓存写入/读取。',
                '測試 CONFIGJSON 可存取性與海報快取寫入/讀取。'
              )}
        </div>
        <div className='flex items-center gap-2'>
          <button
            onClick={handleTestConfigJson}
            disabled={testingConfigJson}
            className={`px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 ${
              testingConfigJson
                ? 'bg-gray-200 dark:bg-gray-800 text-gray-500'
                : 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-800 dark:text-gray-100'
            } transition-colors`}
          >
            {testingConfigJson
              ? tt('Testing…', '测试中…', '測試中…')
              : tt('Test CONFIGJSON', '测试 CONFIGJSON', '測試 CONFIGJSON')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || isD1Storage}
            className={`px-4 py-2 ${
              saving || isD1Storage
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            } text-white rounded-lg transition-colors`}
          >
            {saving
              ? tt('Saving…', '保存中…', '保存中…')
              : tt('Save', '保存', '保存')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SiteConfigComponent;
