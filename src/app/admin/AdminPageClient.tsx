'use client';

import { useState } from 'react';
import { BarChart3, Database, Info, Settings, Users, Video } from 'lucide-react';
import Swal from 'sweetalert2';

import PageLayout from '@/components/PageLayout';
import { tt } from './shared/i18n';
import { showError, showSuccess } from './shared/alerts';
import useAdminConfig from './shared/useAdminConfig';
import CollapsibleTab from './shared/CollapsibleTab';
import InfoSourceConfig from './info/InfoSourceConfig';
import RedisStatus from './redis/RedisStatus';
import SiteConfigComponent from './site/SiteConfig';
import UserConfig from './users/UserConfig';
import SourceValuationTable from './valuations/SourceValuationTable';
import VideoSourceConfig from './video-source/VideoSourceConfig';

function AdminPageClient() {
  const { config, role, loading, error, refresh } = useAdminConfig();
  const [expandedTabs, setExpandedTabs] = useState<Record<string, boolean>>({
    userConfig: false,
    videoSource: false,
    sourceValuations: false,
    infoSources: false,
    siteConfig: false,
    redis: false,
  });

  const toggleTab = (tabKey: string) => {
    setExpandedTabs((prev) => ({
      ...prev,
      [tabKey]: !prev[tabKey],
    }));
  };

  const handleResetConfig = async () => {
    const { isConfirmed } = await Swal.fire({
      title: tt('Confirm reset', '确认重置', '確認重置'),
      text: tt(
        'This will reset user bans/admin roles and custom sources. Site settings will revert to defaults. Continue?',
        '此操作将重置用户封禁与管理员设置、自定义影片来源，站点配置将还原为默认值，是否继续？',
        '此操作將重置用戶封禁與管理員設定、自訂影片來源，站點配置將還原為預設值，是否繼續？'
      ),
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: tt('Confirm', '确认', '確認'),
      cancelButtonText: tt('Cancel', '取消', '取消'),
    });
    if (!isConfirmed) return;

    try {
      const response = await fetch('/api/admin/reset');
      if (!response.ok) {
        throw new Error(
          tt(
            `Reset failed: ${response.status}`,
            `重置失败: ${response.status}`,
            `重置失敗: ${response.status}`
          )
        );
      }
      showSuccess(
        tt(
          'Reset successful. Please refresh the page.',
          '重置成功，请刷新页面。',
          '重置成功，請重新整理頁面！'
        )
      );
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : tt('Reset failed', '重置失败', '重置失敗')
      );
    }
  };

  if (loading) {
    return (
      <PageLayout activePath='/admin'>
        <div className='px-2 sm:px-10 py-4 sm:py-8'>
          <div className='max-w-[95%] mx-auto'>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100 mb-8'>
              {tt('Admin', '管理', '管理員設定')}
            </h1>
            <div className='space-y-4'>
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className='h-20 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse'
                />
              ))}
            </div>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (error) {
    return null;
  }

  return (
    <PageLayout activePath='/admin'>
      <div className='px-2 sm:px-10 py-4 sm:py-8'>
        <div className='max-w-[95%] mx-auto'>
          <div className='flex items-center gap-2 mb-8'>
            <h1 className='text-2xl font-bold text-gray-900 dark:text-gray-100'>
              {tt('Admin', '管理', '管理員設定')}
            </h1>
            {config && role === 'owner' && (
              <button
                onClick={handleResetConfig}
                className='px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-xs rounded-md transition-colors'
              >
                {tt('Reset', '重置', '重置配置')}
              </button>
            )}
          </div>

          <CollapsibleTab
            title={tt('Site settings', '站点配置', '站點配置')}
            icon={<Settings size={20} className='text-gray-600 dark:text-gray-400' />}
            isExpanded={expandedTabs.siteConfig}
            onToggle={() => toggleTab('siteConfig')}
          >
            <SiteConfigComponent config={config} />
          </CollapsibleTab>

          <CollapsibleTab
            title={tt('Cache / Redis', '缓存 / Redis', '快取 / Redis')}
            icon={<Database size={20} className='text-gray-600 dark:text-gray-400' />}
            isExpanded={expandedTabs.redis}
            onToggle={() => toggleTab('redis')}
          >
            <RedisStatus />
          </CollapsibleTab>

          <div className='space-y-4'>
            <CollapsibleTab
              title={tt('Users', '用户', '用戶配置')}
              icon={<Users size={20} className='text-gray-600 dark:text-gray-400' />}
              isExpanded={expandedTabs.userConfig}
              onToggle={() => toggleTab('userConfig')}
            >
              <UserConfig config={config} role={role} refreshConfig={refresh} />
            </CollapsibleTab>

            <CollapsibleTab
              title={tt('Info sources', '信息来源', '資訊來源')}
              icon={<Info size={20} className='text-gray-600 dark:text-gray-400' />}
              isExpanded={expandedTabs.infoSources}
              onToggle={() => toggleTab('infoSources')}
            >
              <InfoSourceConfig />
            </CollapsibleTab>

            <CollapsibleTab
              title={tt('Stream providers', '播放来源', '播放來源')}
              icon={<Video size={20} className='text-gray-600 dark:text-gray-400' />}
              isExpanded={expandedTabs.videoSource}
              onToggle={() => toggleTab('videoSource')}
            >
              <VideoSourceConfig config={config} refreshConfig={refresh} />
            </CollapsibleTab>

            <CollapsibleTab
              title={tt('Provider valuations', '提供者评估', '提供者評估')}
              icon={<BarChart3 size={20} className='text-gray-600 dark:text-gray-400' />}
              isExpanded={expandedTabs.sourceValuations}
              onToggle={() => toggleTab('sourceValuations')}
            >
              <SourceValuationTable config={config} />
            </CollapsibleTab>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

export default AdminPageClient;
