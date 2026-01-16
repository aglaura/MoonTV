import { getAuthInfoFromBrowserCookie } from './auth';

export type DownloadStatus =
  | 'queued'
  | 'preparing'
  | 'downloading'
  | 'downloaded'
  | 'error';

export type DownloadRecord = {
  key?: string;
  title: string;
  url: string;
  ts: number;
  offline?: boolean;
  status?: DownloadStatus;
  progress?: number;
};

export const DOWNLOAD_RECORDS_EVENT = 'downloadRecordsUpdated';

export const buildDownloadStorageKey = (username?: string | null): string => {
  const trimmed = username?.trim();
  return trimmed ? `downloadRecords:${trimmed}` : 'downloadRecords';
};

export const resolveDownloadStorageKey = (): string => {
  try {
    const username = getAuthInfoFromBrowserCookie()?.username || null;
    return buildDownloadStorageKey(username);
  } catch {
    return buildDownloadStorageKey(null);
  }
};

export const readDownloadRecords = (storageKey: string): DownloadRecord[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const writeDownloadRecords = (
  storageKey: string,
  records: DownloadRecord[]
): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(records));
  } catch {
    return;
  }
  try {
    window.dispatchEvent(
      new CustomEvent(DOWNLOAD_RECORDS_EVENT, {
        detail: { key: storageKey, records },
      })
    );
  } catch {
  }
};
