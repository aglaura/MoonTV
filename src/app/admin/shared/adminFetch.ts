/* eslint-disable @typescript-eslint/no-explicit-any */
import Swal from 'sweetalert2';

type UiLocale = 'en' | 'zh-Hans' | 'zh-Hant';

function resolveUiLocale(): UiLocale {
  try {
    const saved =
      typeof window !== 'undefined'
        ? window.localStorage.getItem('userLocale')
        : null;
    if (saved === 'en' || saved === 'zh-Hans' || saved === 'zh-Hant') {
      return saved;
    }
  } catch {
    // ignore
  }

  const nav =
    typeof navigator !== 'undefined' ? (navigator.language || '') : '';
  const lower = nav.toLowerCase();
  if (lower.startsWith('zh-cn') || lower.startsWith('zh-hans')) return 'zh-Hans';
  if (
    lower.startsWith('zh-tw') ||
    lower.startsWith('zh-hant') ||
    lower.startsWith('zh-hk')
  ) {
    return 'zh-Hant';
  }
  return 'en';
}

// Memoized locale resolution to prevent repeated localStorage/navigator calls
const uiLocale = resolveUiLocale();

export function tt(en: string, zhHans: string, zhHant: string): string {
  if (uiLocale === 'zh-Hans') return zhHans;
  if (uiLocale === 'zh-Hant') return zhHant;
  return en;
}

export const showError = (message: string) =>
  Swal.fire({ icon: 'error', title: tt('Error', '错误', '錯誤'), text: message });

export const showSuccess = (message: string) =>
  Swal.fire({
    icon: 'success',
    title: tt('Success', '成功', '成功'),
    text: message,
    timer: 2000,
    showConfirmButton: false,
  });

export const callApi = async (endpoint: string, body: Record<string, any>) => {
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body }),
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(
        data.error ||
          tt(
            `Operation failed: ${resp.status}`,
            `操作失败: ${resp.status}`,
            `操作失敗: ${resp.status}`
          )
      );
    }

    return resp;
  } catch (err) {
    showError(
      err instanceof Error
        ? err.message
        : tt('Operation failed', '操作失败', '操作失敗')
    );
    throw err;
  }
};