import { callApi } from '../shared/adminFetch';

export const toggleSource = async (key: string, enabled: boolean) => {
  try {
    await callApi('/api/admin/source', {
      action: enabled ? 'enable' : 'disable',
      key,
    });
  } catch (err) {
    // Error is handled by callApi
  }
};

export const deleteSource = async (key: string) => {
  try {
    await callApi('/api/admin/source', {
      action: 'delete',
      key,
    });
  } catch (err) {
    // Error is handled by callApi
  }
};

export const addSource = async (sourceData: {
  key: string;
  name: string;
  api?: string;
  m3u8?: string;
  detail?: string;
}) => {
  try {
    await callApi('/api/admin/source', {
      action: 'add',
      ...sourceData,
    });
  } catch (err) {
    // Error is handled by callApi
  }
};

export const updateSourceOrder = async (order: string[]) => {
  try {
    await callApi('/api/admin/source', {
      action: 'sort',
      order,
    });
  } catch (err) {
    // Error is handled by callApi
  }
};