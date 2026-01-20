import { useCallback, useEffect, useState } from 'react';

import { AdminConfig, AdminConfigResult } from '@/lib/admin.types';

import { tt } from './i18n';
import { showError } from './alerts';

export interface UseAdminConfigResult {
  config: AdminConfig | null;
  role: 'owner' | 'admin' | null;
  loading: boolean;
  error: string | null;
  refresh: (showLoading?: boolean) => Promise<void>;
}

const useAdminConfig = (): UseAdminConfigResult => {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<'owner' | 'admin' | null>(null);

  const refresh = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      const response = await fetch('/api/admin/config');

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          tt(
            `Failed to load config: ${data.error ?? response.status}`,
            `获取配置失败: ${data.error ?? response.status}`,
            `獲取配置失敗: ${data.error ?? response.status}`
          )
        );
      }

      const data = (await response.json()) as AdminConfigResult;
      setConfig(data.Config);
      setRole(data.Role);
      setError(null);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : tt('Failed to load config', '获取配置失败', '獲取配置失敗');
      showError(msg);
      setError(msg);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    refresh(true);
  }, [refresh]);

  return {
    config,
    role,
    loading,
    error,
    refresh,
  };
};

export default useAdminConfig;
