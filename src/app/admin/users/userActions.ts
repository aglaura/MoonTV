/* eslint-disable @typescript-eslint/no-explicit-any */

import { tt, showError, callApi } from '../shared/adminFetch';
import Swal from 'sweetalert2';

export const handleUserAction = async (
  action:
    | 'add'
    | 'ban'
    | 'unban'
    | 'setAdmin'
    | 'cancelAdmin'
    | 'setAvatar'
    | 'changePassword'
    | 'deleteUser'
    | 'setGroup'
    | 'rename',
  targetUsername: string,
  refreshConfig: () => Promise<void>,
  targetPassword?: string,
  avatar?: string,
  group?: string,
  newUsername?: string
) => {
  try {
    await callApi('/api/admin/user', {
      targetUsername,
      ...(targetPassword ? { targetPassword } : {}),
      ...(typeof avatar === 'string' ? { avatar } : {}),
      ...(group ? { group } : {}),
      ...(newUsername ? { newUsername } : {}),
      action,
    });

    await refreshConfig();
  } catch (err) {
    // Error is handled by callApi
  }
};

export const handleBanUser = async (uname: string, refreshConfig: () => Promise<void>) => {
  await handleUserAction('ban', uname, refreshConfig);
};

export const handleUnbanUser = async (uname: string, refreshConfig: () => Promise<void>) => {
  await handleUserAction('unban', uname, refreshConfig);
};

export const handleSetAdmin = async (uname: string, refreshConfig: () => Promise<void>) => {
  await handleUserAction('setAdmin', uname, refreshConfig);
};

export const handleRemoveAdmin = async (uname: string, refreshConfig: () => Promise<void>) => {
  await handleUserAction('cancelAdmin', uname, refreshConfig);
};

export const handleSetAvatar = async (
  uname: string,
  refreshConfig: () => Promise<void>,
  currentAvatar?: string
) => {
  const { value: avatar } = await Swal.fire({
    title: tt('Set avatar', '设置头像', '設定頭像'),
    input: 'url',
    inputValue: currentAvatar || '',
    inputPlaceholder: 'https://example.com/avatar.png',
    showCancelButton: true,
    confirmButtonText: tt('Save', '保存', '保存'),
    cancelButtonText: tt('Cancel', '取消', '取消'),
  });

  if (avatar === undefined) return;
  await handleUserAction('setAvatar', uname, refreshConfig, undefined, avatar);
};

export const handleDeleteUser = async (username: string, refreshConfig: () => Promise<void>) => {
  const { isConfirmed } = await Swal.fire({
    title: tt('Confirm delete user', '确认删除用户', '確認刪除用戶'),
    text: tt(
      `Deleting ${username} will also delete their search history, play records, and favorites. This cannot be undone.`,
      `删除用户 ${username} 将同时删除其搜索历史、播放记录与收藏夹，此操作不可恢复！`,
      `刪除用戶 ${username} 將同時刪除其搜尋歷史、播放紀錄與收藏夾，此操作不可恢復！`
    ),
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: tt('Delete', '确认删除', '確認刪除'),
    cancelButtonText: tt('Cancel', '取消', '取消'),
    confirmButtonColor: '#dc2626',
  });

  if (!isConfirmed) return;

  await handleUserAction('deleteUser', username, refreshConfig);
};