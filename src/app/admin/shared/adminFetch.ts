/* eslint-disable @typescript-eslint/no-explicit-any */
import Swal from 'sweetalert2';
import { tt } from './i18n';
import { showError } from './alerts';

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
