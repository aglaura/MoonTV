/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

'use client';

// Force dynamic rendering to avoid next-intl static prerender issues
export const dynamic = 'force-dynamic';

import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  restrictToParentElement,
  restrictToVerticalAxis,
} from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Database,
  GripVertical,
  Info,
  Settings,
  Users,
  Video,
} from 'lucide-react';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Swal from 'sweetalert2';

import { AdminConfig, AdminConfigResult } from '@/lib/admin.types';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { parseSpeedToKBps } from '@/lib/utils';

import PageLayout from '@/components/PageLayout';

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

function tt(en: string, zhHans: string, zhHant: string): string {
  const locale = resolveUiLocale();
  if (locale === 'zh-Hans') return zhHans;
  if (locale === 'zh-Hant') return zhHant;
  return en;
}

const showError = (message: string) =>
  Swal.fire({ icon: 'error', title: tt('Error', '错误', '錯誤'), text: message });

const showSuccess = (message: string) =>
  Swal.fire({
    icon: 'success',
    title: tt('Success', '成功', '成功'),
    text: message,
    timer: 2000,
    showConfirmButton: false,
  });

const getQualityScoreFromLabel = (
  quality?: string,
  fallbackRank?: number
): number => {
  const normalized = (quality || '').toLowerCase();
  if (normalized.includes('4k') || normalized.includes('2160')) return 100;
  if (normalized.includes('2k') || normalized.includes('1440')) return 85;
  if (normalized.includes('1080')) return 75;
  if (normalized.includes('720')) return 60;
  if (normalized.includes('480')) return 40;
  if (normalized.includes('sd')) return 20;

  switch (fallbackRank) {
    case 4:
      return 100;
    case 3:
      return 85;
    case 2:
      return 75;
    case 1:
      return 60;
    default:
      return 0;
  }
};

const getQualityBadgeClasses = (quality?: string): string => {
  const normalized = (quality || '').toLowerCase();
  if (!normalized || normalized === '—' || normalized === 'na') {
    return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
  }
  if (normalized.includes('4k') || normalized.includes('2160')) {
    return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-200';
  }
  if (normalized.includes('2k') || normalized.includes('1440')) {
    return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-200';
  }
  if (normalized.includes('1080')) {
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200';
  }
  if (normalized.includes('720')) {
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200';
  }
  if (normalized.includes('480') || normalized.includes('sd')) {
    return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200';
  }
  if (normalized.includes('unavailable') || normalized.includes('error')) {
    return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200';
  }
  return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
};

const toDisplayScore = (score: number | undefined): string => {
  if (!Number.isFinite(score) || score === undefined) {
    return '—';
  }
  if (Math.abs(score - Math.round(score)) < 0.05) {
    return Math.round(score).toString();
  }
  return score.toFixed(1);
};

interface SiteConfig {
  SiteName: string;
  Announcement: string;
  SearchDownstreamMaxPage: number;
  SiteInterfaceCacheTime: number;
  ImageProxy: string;
}

interface DataSource {
  name: string;
  key: string;
  api?: string;
  m3u8?: string;
  detail?: string;
  disabled?: boolean;
  from: 'config' | 'custom';
}

interface SourceValuationRow {
  key: string;
  source: string;
  id?: string;
  quality: string;
  loadSpeed: string;
  pingTime: number;
  qualityRank?: number;
  speedValue?: number;
  sampleCount?: number;
  updated_at?: number;
  score?: number;
}

interface CollapsibleTabProps {
  title: string;
  icon?: React.ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const CollapsibleTab = ({
  title,
  icon,
  isExpanded,
  onToggle,
  children,
}: CollapsibleTabProps) => {
  return (
    <div className='rounded-xl shadow-sm mb-4 overflow-hidden bg-white/80 backdrop-blur-md dark:bg-gray-800/50 dark:ring-1 dark:ring-gray-700'>
      <button
        onClick={onToggle}
        className='w-full px-6 py-4 flex items-center justify-between bg-gray-50/70 dark:bg-gray-800/60 hover:bg-gray-100/80 dark:hover:bg-gray-700/60 transition-colors'
      >
        <div className='flex items-center gap-3'>
          {icon}
          <h3 className='text-lg font-medium text-gray-900 dark:text-gray-100'>
            {title}
          </h3>
        </div>
        <div className='text-gray-500 dark:text-gray-400'>
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </div>
      </button>

      {isExpanded && <div className='px-6 py-4'>{children}</div>}
    </div>
  );
};

interface UserConfigProps {
  config: AdminConfig | null;
  role: 'owner' | 'admin' | null;
  refreshConfig: () => Promise<void>;
}

const UserConfig = ({ config, role, refreshConfig }: UserConfigProps) => {
  const [userSettings, setUserSettings] = useState({
    enableRegistration: false,
  });
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [showChangePasswordForm, setShowChangePasswordForm] = useState(false);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
  });
  const [newUserGroup, setNewUserGroup] = useState<'family' | 'guest'>(
    'family'
  );
  const [changePasswordUser, setChangePasswordUser] = useState({
    username: '',
    password: '',
  });
  const [editingUser, setEditingUser] = useState<{
    username: string;
    newUsername: string;
    avatar: string;
    group: 'family' | 'guest';
    makeAdmin: boolean;
    banned: boolean;
    newPassword: string;
  } | null>(null);

  const currentUsername = getAuthInfoFromBrowserCookie()?.username || null;

  const isD1Storage =
    typeof window !== 'undefined' &&
    (window as any).RUNTIME_CONFIG?.STORAGE_TYPE === 'd1';
  const editingEntry = useMemo(
    () =>
      editingUser
        ? config?.UserConfig.Users.find(
            (u) => u.username === editingUser.username
          )
        : null,
    [config, editingUser]
  );

  useEffect(() => {
    if (config?.UserConfig) {
      setUserSettings({
        enableRegistration: config.UserConfig.AllowRegister,
      });
    }
  }, [config]);

  const toggleAllowRegister = async (value: boolean) => {
    try {
      setUserSettings((prev) => ({ ...prev, enableRegistration: value }));

      const res = await fetch('/api/admin/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setAllowRegister',
          allowRegister: value,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error ||
            tt(
              `Operation failed: ${res.status}`,
              `操作失败: ${res.status}`,
              `操作失敗: ${res.status}`
            )
        );
      }

      await refreshConfig();
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : tt('Operation failed', '操作失败', '操作失敗')
      );
      // revert toggle UI
      setUserSettings((prev) => ({ ...prev, enableRegistration: !value }));
    }
  };

  const handleBanUser = async (uname: string) => {
    await handleUserAction('ban', uname);
  };

  const handleUnbanUser = async (uname: string) => {
    await handleUserAction('unban', uname);
  };

  const handleSetAdmin = async (uname: string) => {
    await handleUserAction('setAdmin', uname);
  };

  const handleRemoveAdmin = async (uname: string) => {
    await handleUserAction('cancelAdmin', uname);
  };

  const handleSetAvatar = async (uname: string, currentAvatar?: string) => {
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
    await handleUserAction('setAvatar', uname, undefined, avatar);
  };

  const handleAddUser = async () => {
    if (!newUser.username || !newUser.password) return;
    await handleUserAction(
      'add',
      newUser.username,
      newUser.password,
      undefined,
      newUserGroup
    );
    setNewUser({ username: '', password: '' });
    setNewUserGroup('family');
    setShowAddUserForm(false);
  };

  const handleChangePassword = async () => {
    if (!changePasswordUser.username || !changePasswordUser.password) return;
    await handleUserAction(
      'changePassword',
      changePasswordUser.username,
      changePasswordUser.password
    );
    setChangePasswordUser({ username: '', password: '' });
    setShowChangePasswordForm(false);
  };

  const handleShowChangePasswordForm = (username: string) => {
    setChangePasswordUser({ username, password: '' });
    setShowChangePasswordForm(true);
    setShowAddUserForm(false); // 关闭新增用戶表单
  };

  const handleDeleteUser = async (username: string) => {
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

    await handleUserAction('deleteUser', username);
  };

  const handleSaveEditUser = async () => {
    if (!editingUser || !editingEntry) {
      setEditingUser(null);
      return;
    }
    if (editingEntry.role === 'owner') {
      setEditingUser(null);
      return;
    }

    const tasks: Array<() => Promise<void>> = [];
    const { username, newUsername, avatar, group, makeAdmin, banned, newPassword } =
      editingUser;
    const trimmedNewUsername = newUsername.trim();
    const normalizedAvatar = avatar.trim();
    const currentGroup =
      (editingEntry as any)?.group === 'guest' ? 'guest' : 'family';
    let targetName = username;

    if (trimmedNewUsername && trimmedNewUsername !== username) {
      tasks.push(async () => {
        await handleUserAction(
          'rename',
          targetName,
          undefined,
          undefined,
          undefined,
          trimmedNewUsername
        );
        targetName = trimmedNewUsername;
      });
    }

    if (normalizedAvatar !== (editingEntry.avatar || '')) {
      tasks.push(() =>
        handleUserAction('setAvatar', targetName, undefined, normalizedAvatar)
      );
    }

    if (newPassword.trim().length > 0) {
      tasks.push(() =>
        handleUserAction('changePassword', targetName, newPassword.trim())
      );
    }

    if (group !== currentGroup) {
      tasks.push(() =>
        handleUserAction('setGroup', targetName, undefined, undefined, group)
      );
    }

    const isAdminNow = editingEntry.role === 'admin';
    if (makeAdmin !== isAdminNow) {
      tasks.push(() =>
        makeAdmin
          ? handleUserAction('setAdmin', targetName)
          : handleUserAction('cancelAdmin', targetName)
      );
    }

    const isBannedNow = !!editingEntry.banned;
    if (banned !== isBannedNow) {
      tasks.push(() =>
        banned
          ? handleUserAction('ban', targetName)
          : handleUserAction('unban', targetName)
      );
    }

    try {
      for (const task of tasks) {
        await task();
      }
      await refreshConfig();
      setEditingUser(null);
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : tt('Operation failed', '操作失败', '操作失敗')
      );
    }
  };

  const handleUserAction = async (
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
    targetPassword?: string,
    avatar?: string,
    group?: string,
    newUsername?: string
  ) => {
    try {
      const res = await fetch('/api/admin/user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUsername,
          ...(targetPassword ? { targetPassword } : {}),
          ...(typeof avatar === 'string' ? { avatar } : {}),
          ...(group ? { group } : {}),
          ...(newUsername ? { newUsername } : {}),
          action,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error ||
            tt(
              `Operation failed: ${res.status}`,
              `操作失败: ${res.status}`,
              `操作失敗: ${res.status}`
            )
        );
      }

      await refreshConfig();
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : tt('Operation failed', '操作失败', '操作失敗')
      );
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
      {/* 用戶統計 */}
      <div>
        <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-3'>
          {tt('User stats', '用户统计', '用戶統計')}
        </h4>
        <div className='p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800'>
          <div className='text-2xl font-bold text-green-800 dark:text-green-300'>
            {config.UserConfig.Users.length}
          </div>
          <div className='text-sm text-green-600 dark:text-green-400'>
            {tt('Total users', '总用户数', '總用戶數')}
          </div>
        </div>
      </div>

      {/* 註冊設定 */}
      <div>
        <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300 mb-3'>
          {tt('Registration', '注册设置', '註冊設定')}
        </h4>
        <div className='flex items-center justify-between'>
          <label
            className={`text-gray-700 dark:text-gray-300 ${
              isD1Storage ? 'opacity-50' : ''
            }`}
          >
            {tt(
              'Allow new user registration',
              '允许新用户注册',
              '允許新用戶註冊'
            )}
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
          <button
            onClick={() =>
              !isD1Storage &&
              toggleAllowRegister(!userSettings.enableRegistration)
            }
            disabled={isD1Storage}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 ${
              userSettings.enableRegistration
                ? 'bg-green-600'
                : 'bg-gray-200 dark:bg-gray-700'
            } ${isD1Storage ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                userSettings.enableRegistration
                  ? 'translate-x-6'
                  : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 用戶列表 */}
      <div>
        <div className='flex items-center justify-between mb-3'>
          <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            {tt('Users', '用户列表', '用戶列表')}
          </h4>
          <button
            onClick={() => {
              setShowAddUserForm(!showAddUserForm);
              if (showChangePasswordForm) {
                setShowChangePasswordForm(false);
                setChangePasswordUser({ username: '', password: '' });
              }
            }}
            className='px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors'
          >
            {showAddUserForm
              ? tt('Cancel', '取消', '取消')
              : tt('Add user', '新增用户', '新增用戶')}
          </button>
        </div>

        {/* 新增用戶表单 */}
        {showAddUserForm && (
          <div className='mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700'>
            <div className='flex flex-col sm:flex-row gap-4 sm:gap-3'>
              <input
                type='text'
                placeholder={tt('Username', '用户名', '使用者名稱')}
                value={newUser.username}
                onChange={(e) =>
                  setNewUser((prev) => ({ ...prev, username: e.target.value }))
                }
                className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
              />
              <input
                type='password'
                placeholder={tt('Password', '密码', '密碼')}
                value={newUser.password}
                onChange={(e) =>
                  setNewUser((prev) => ({ ...prev, password: e.target.value }))
                }
                className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
              />
              <select
                className='px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
                value={newUserGroup}
                onChange={(e) =>
                  setNewUserGroup(
                    e.target.value === 'guest' ? 'guest' : 'family'
                  )
                }
              >
                <option value='family'>
                  {tt('Family group (PASSWORD)', '家庭组 (PASSWORD)', '家庭組 (PASSWORD)')}
                </option>
                <option value='guest'>
                  {tt('Guest group (PASSWORD2)', '访客组 (PASSWORD2)', '訪客組 (PASSWORD2)')}
                </option>
              </select>
              <button
                onClick={handleAddUser}
                disabled={!newUser.username || !newUser.password}
                className='w-full sm:w-auto px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors'
              >
                {tt('Add', '新增', '新增')}
              </button>
            </div>
          </div>
        )}

        {/* 修改密碼表单 */}
        {showChangePasswordForm && (
          <div className='mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-700'>
            <h5 className='text-sm font-medium text-blue-800 dark:text-blue-300 mb-3'>
              {tt(
                'Change user password',
                '修改用户密码',
                '修改用戶密碼'
              )}
            </h5>
            <div className='flex flex-col sm:flex-row gap-4 sm:gap-3'>
              <input
                type='text'
                placeholder={tt('Username', '用户名', '使用者名稱')}
                value={changePasswordUser.username}
                disabled
                className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 cursor-not-allowed'
              />
              <input
                type='password'
                placeholder={tt('New password', '新密码', '新密碼')}
                value={changePasswordUser.password}
                onChange={(e) =>
                  setChangePasswordUser((prev) => ({
                    ...prev,
                    password: e.target.value,
                  }))
                }
                className='flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
              />
              <button
                onClick={handleChangePassword}
                disabled={!changePasswordUser.password}
                className='w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg transition-colors'
              >
                {tt('Change', '修改密码', '修改密碼')}
              </button>
              <button
                onClick={() => {
                  setShowChangePasswordForm(false);
                  setChangePasswordUser({ username: '', password: '' });
                }}
                className='w-full sm:w-auto px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors'
              >
                {tt('Cancel', '取消', '取消')}
              </button>
            </div>
          </div>
        )}

        {/* 用戶列表 */}
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg max-h-[28rem] overflow-y-auto overflow-x-auto'>
          <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
            <thead className='bg-gray-50 dark:bg-gray-900'>
              <tr>
                <th
                  scope='col'
                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
                >
                  {tt('Username', '用户名', '使用者名稱')}
                </th>
                <th
                  scope='col'
                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
                >
                  {tt('Role', '角色', '角色')}
                </th>
                <th
                  scope='col'
                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
                >
                  {tt('Group', '组别', '組別')}
                </th>
                <th
                  scope='col'
                  className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
                >
                  {tt('Status', '状态', '狀態')}
                </th>
                <th
                  scope='col'
                  className='px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'
                >
                  {tt('Actions', '操作', '操作')}
                </th>
              </tr>
            </thead>
            {/* 按规则排序用户：自己 -> 站長(若非自己) -> 管理員 -> 其他 */}
            {(() => {
              const sortedUsers = [...config.UserConfig.Users].sort((a, b) => {
                type UserInfo = (typeof config.UserConfig.Users)[number];
                const priority = (u: UserInfo) => {
                  if (u.username === currentUsername) return 0;
                  if (u.role === 'owner') return 1;
                  if (u.role === 'admin') return 2;
                  return 3;
                };
                return priority(a) - priority(b);
              });
              return (
                <tbody className='divide-y divide-gray-200 dark:divide-gray-700'>
                  {sortedUsers.map((user) => {
                    const canChangePassword =
                      user.role !== 'owner' && // 不能修改站長密碼
                      (role === 'owner' || // 站長可以修改管理員和一般用戶密碼
                        (role === 'admin' &&
                          (user.role === 'user' ||
                            user.username === currentUsername))); // 管理員可以修改一般用戶和自己的密碼

                    const canDeleteUser =
                      user.username !== currentUsername &&
                      (role === 'owner' || // 站長可以删除除自己外的所有用户
                        (role === 'admin' && user.role === 'user')); // 管理員仅可删除一般用戶

                    const canOperate =
                      user.username !== currentUsername &&
                      (role === 'owner' ||
                        (role === 'admin' && user.role === 'user'));
                    const canEditAvatar =
                      role === 'owner' ||
                      user.username === currentUsername ||
                      (role === 'admin' && user.role === 'user');
                    const groupOptions = Array.from(
                      new Set(
                        (config?.UserConfig?.Users || [])
                          .map((u) =>
                            typeof (u as any)?.group === 'string' &&
                            (u as any).group?.trim()
                              ? (u as any).group.trim()
                              : ''
                          )
                          .concat(['family', 'guest'])
                          .filter((g) => g && g.length > 0)
                      )
                    );
                    return (
                      <tr
                        key={user.username}
                        className='hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors'
                      >
                        <td className='px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100'>
                          <div className='flex items-center gap-3'>
                            <span className='block w-8 h-8 rounded-full bg-gradient-to-br from-green-500/20 to-green-400/10 overflow-hidden flex items-center justify-center text-xs font-semibold text-green-700 dark:text-green-300 border border-green-500/20'>
                              {user.avatar ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={user.avatar}
                                  alt={user.username}
                                  className='w-full h-full object-cover'
                                />
                              ) : (
                                user.username.charAt(0).toUpperCase()
                              )}
                            </span>
                            <span>{user.username}</span>
                          </div>
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap'>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              user.role === 'owner'
                                ? 'bg-yellow-100 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-300'
                                : user.role === 'admin'
                                ? 'bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {user.role === 'owner'
                              ? tt('Owner', '站长', '站長')
                              : user.role === 'admin'
                              ? tt('Admin', '管理员', '管理員')
                              : tt('User', '普通用户', '一般用戶')}
                          </span>
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap'>
                          <select
                            className='px-3 py-1.5 text-xs rounded-md border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-200 focus:outline-none focus:ring-2 focus:ring-green-500'
                            value={(user as any)?.group || 'family'}
                            onChange={(e) =>
                              handleUserAction(
                                'setGroup',
                                user.username,
                                undefined,
                                undefined,
                                e.target.value?.trim() || 'family'
                              )
                            }
                          >
                            {groupOptions.map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap'>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              !user.banned
                                ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                                : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300'
                            }`}
                          >
                            {!user.banned
                              ? tt('Active', '正常', '正常')
                              : tt('Banned', '已封禁', '已封禁')}
                          </span>
                        </td>
                        <td className='px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2'>
                          <div className='inline-flex items-center gap-2'>
                            <button
                              onClick={() => {
                            setEditingUser({
                              username: user.username,
                              newUsername: user.username,
                              avatar: user.avatar || '',
                              group:
                                (user as any)?.group === 'guest'
                                  ? 'guest'
                                  : 'family',
                                  makeAdmin: user.role === 'admin',
                                  banned: !!user.banned,
                                  newPassword: '',
                                });
                                setShowAddUserForm(false);
                                setShowChangePasswordForm(false);
                              }}
                              className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-gray-900 text-white hover:bg-gray-800 dark:bg-gray-700 dark:hover:bg-gray-600 transition-colors'
                            >
                              {tt('Edit', '编辑', '編輯')}
                            </button>
                            {canDeleteUser && (
                              <button
                                onClick={() => handleDeleteUser(user.username)}
                                className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-red-600 text-white hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 transition-colors'
                              >
                                {tt('Delete', '删除', '刪除用戶')}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              );
            })()}
          </table>
        </div>
      </div>
      {editingUser && (
        <div className='fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4'>
          <div className='w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900 shadow-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4'>
            <div className='flex items-center justify-between'>
              <div>
                <h3 className='text-lg font-semibold text-gray-900 dark:text-gray-100'>
                  {tt('Edit user', '编辑用户', '編輯用戶')} — {editingUser.username}
                </h3>
                <p className='text-sm text-gray-500 dark:text-gray-400'>
                  {tt('Update avatar, group, role, ban status, or password.', '可更新头像、分组、角色、封禁状态或密码。', '可更新頭像、分組、角色、封禁狀態或密碼。')}
                </p>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className='text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-white'
              >
                ×
              </button>
            </div>

            <div className='space-y-3'>
              <div>
                <label className='block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1'>
                  {tt('Username', '用户名', '使用者名稱')}
                </label>
                <input
                  type='text'
                  value={editingUser.newUsername}
                  onChange={(e) =>
                    setEditingUser((prev) =>
                      prev ? { ...prev, newUsername: e.target.value } : prev
                    )
                  }
                  disabled={
                    !editingEntry ||
                    editingEntry.role === 'owner' ||
                    (role !== 'owner' && editingEntry.role === 'admin')
                  }
                  className='w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:dark:bg-gray-800/60 disabled:text-gray-500'
                  placeholder={tt('Enter new username', '输入新用户名', '輸入新使用者名稱')}
                />
              </div>

              <div>
                <label className='block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1'>
                  {tt('Avatar URL', '头像链接', '頭像連結')}
                </label>
                <input
                  type='url'
                  value={editingUser.avatar}
                  onChange={(e) =>
                    setEditingUser((prev) =>
                      prev ? { ...prev, avatar: e.target.value } : prev
                    )
                  }
                  className='w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
                  placeholder='https://...'
                />
              </div>

              <div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
                <div>
                  <label className='block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1'>
                    {tt('Group', '组别', '組別')}
                  </label>
                  <select
                    value={editingUser.group}
                    onChange={(e) =>
                      setEditingUser((prev) =>
                        prev
                          ? {
                              ...prev,
                              group: e.target.value === 'guest' ? 'guest' : 'family',
                            }
                          : prev
                      )
                    }
                    className='w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
                  >
                    <option value='family'>
                      {tt('Family (PASSWORD)', '家庭 (PASSWORD)', '家庭 (PASSWORD)')}
                    </option>
                    <option value='guest'>
                      {tt('Guest (PASSWORD2)', '访客 (PASSWORD2)', '訪客 (PASSWORD2)')}
                    </option>
                  </select>
                </div>
                <div className='flex items-center gap-3'>
                  <label className='text-xs font-medium text-gray-600 dark:text-gray-300'>
                    {tt('Admin role', '管理员', '管理員')}
                  </label>
                  <input
                    type='checkbox'
                    checked={editingUser.makeAdmin}
                    onChange={(e) =>
                      setEditingUser((prev) =>
                        prev ? { ...prev, makeAdmin: e.target.checked } : prev
                      )
                    }
                    className='h-4 w-4'
                    disabled={
                      !editingEntry ||
                      editingEntry.role === 'owner' ||
                      (role !== 'owner' && editingEntry.role !== 'user')
                    }
                  />
                  <label className='text-xs font-medium text-gray-600 dark:text-gray-300 ml-4'>
                    {tt('Banned', '封禁', '封禁')}
                  </label>
                  <input
                    type='checkbox'
                    checked={editingUser.banned}
                    onChange={(e) =>
                      setEditingUser((prev) =>
                        prev ? { ...prev, banned: e.target.checked } : prev
                      )
                    }
                    className='h-4 w-4'
                    disabled={!editingEntry || editingEntry.role === 'owner'}
                  />
                </div>
              </div>

              <div>
                <label className='block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1'>
                  {tt('New password (optional)', '新密码（可选）', '新密碼（可選）')}
                </label>
                <input
                  type='password'
                  value={editingUser.newPassword}
                  onChange={(e) =>
                    setEditingUser((prev) =>
                      prev ? { ...prev, newPassword: e.target.value } : prev
                    )
                  }
                  className='w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-green-500 focus:border-transparent'
                  placeholder={tt('Leave blank to keep current', '留空则不修改', '留空則不修改')}
                />
              </div>
            </div>

            <div className='flex justify-end gap-2 pt-2'>
              <button
                onClick={() => setEditingUser(null)}
                className='px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
              >
                {tt('Cancel', '取消', '取消')}
              </button>
              <button
                onClick={handleSaveEditUser}
                disabled={!editingEntry || editingEntry.role === 'owner'}
                className='px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-400 transition-colors'
              >
                {tt('Save', '保存', '保存')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoSourceConfig = () => {
  const infoSources = [
    {
      key: 'douban',
      name: 'Douban',
      description: tt('Ratings + metadata', '评分与影片信息', '評分與影片資訊'),
    },
    {
      key: 'tmdb',
      name: 'TMDB',
      description: tt('Posters + metadata', '海报与元数据', '海報與中繼資料'),
    },
    {
      key: 'imdb',
      name: 'IMDb',
      description: tt('English title + ratings', '英文标题与评分', '英文標題與評分'),
    },
    {
      key: 'wmdb',
      name: 'WMDB',
      description: tt(
        'Aggregated metadata (Douban/IMDb/RT)',
        '聚合信息（豆瓣/IMDb/烂番茄）',
        '聚合資訊（豆瓣/IMDb/爛番茄）'
      ),
    },
  ];

  return (
    <div className='space-y-4'>
      <div className='rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/70 p-4'>
        <div className='flex items-center justify-between'>
          <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            {tt('Info sources', '信息来源', '資訊來源')}
          </h4>
          <span className='text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'>
            {tt('Built-in', '内置', '內建')}
          </span>
        </div>
        <p className='mt-2 text-xs text-gray-500 dark:text-gray-400'>
          {tt(
            'Metadata-only sources (no streams). Managed by the app and not part of api_site.',
            '仅提供元数据（无播放源）。由应用内置管理，不在 api_site 列表中。',
            '僅提供中繼資料（無播放來源）。由應用內建管理，不在 api_site 清單中。'
          )}
        </p>
        <div className='mt-3 grid gap-2 sm:grid-cols-2'>
          {infoSources.map((source) => (
            <div
              key={source.key}
              className='rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200/70 dark:border-gray-700/60 px-3 py-2'
            >
              <div className='text-sm font-semibold text-gray-800 dark:text-gray-100'>
                {source.name}
              </div>
              <div className='text-xs text-gray-500 dark:text-gray-400'>
                {source.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const VideoSourceConfig = ({
  config,
  refreshConfig,
}: {
  config: AdminConfig | null;
  refreshConfig: () => Promise<void>;
}) => {
  const [sources, setSources] = useState<DataSource[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [orderChanged, setOrderChanged] = useState(false);
  const [newSource, setNewSource] = useState<DataSource>({
    name: '',
    key: '',
    api: '',
    m3u8: '',
    detail: '',
    disabled: false,
    from: 'config',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 轻微位移即可触发
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 150, // 长按 150ms 后触发，避免与滚动冲突
        tolerance: 5,
      },
    })
  );

  useEffect(() => {
    if (config?.SourceConfig) {
      setSources(config.SourceConfig);
      setOrderChanged(false);
    }
  }, [config]);

  const callSourceApi = async (body: Record<string, any>) => {
    try {
      const resp = await fetch('/api/admin/source', {
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

      await refreshConfig();
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : tt('Operation failed', '操作失败', '操作失敗')
      );
      throw err; // 向上抛出方便调用处判断
    }
  };

  const handleToggleEnable = (key: string) => {
    const target = sources.find((s) => s.key === key);
    if (!target) return;
    const action = target.disabled ? 'enable' : 'disable';
    callSourceApi({ action, key }).catch(() => {
      console.error('Operation failed', action, key);
    });
  };

  const handleDelete = (key: string) => {
    callSourceApi({ action: 'delete', key }).catch(() => {
      console.error('Operation failed', 'delete', key);
    });
  };

  const handleAddSource = () => {
    const apiValue = newSource.api?.trim();
    const m3u8Value = newSource.m3u8?.trim();
    if (!newSource.name || !newSource.key || (!apiValue && !m3u8Value)) return;
    callSourceApi({
      action: 'add',
      key: newSource.key,
      name: newSource.name,
      api: apiValue,
      m3u8: m3u8Value,
      detail: newSource.detail,
    })
      .then(() => {
        setNewSource({
          name: '',
          key: '',
          api: '',
          m3u8: '',
          detail: '',
          disabled: false,
          from: 'custom',
        });
        setShowAddForm(false);
      })
      .catch(() => {
        console.error('Operation failed', 'add', newSource);
      });
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sources.findIndex((s) => s.key === active.id);
    const newIndex = sources.findIndex((s) => s.key === over.id);
    setSources((prev) => arrayMove(prev, oldIndex, newIndex));
    setOrderChanged(true);
  };

  const handleSaveOrder = () => {
    const order = sources.map((s) => s.key);
    callSourceApi({ action: 'sort', order })
      .then(() => {
        setOrderChanged(false);
      })
      .catch(() => {
        console.error('Operation failed', 'sort', order);
      });
  };

  const DraggableRow = ({ source }: { source: DataSource }) => {
    const { attributes, listeners, setNodeRef, transform, transition } =
      useSortable({ id: source.key });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
    } as React.CSSProperties;

    return (
      <tr
        ref={setNodeRef}
        style={style}
        className='hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors select-none'
      >
        <td
          className='px-2 py-4 cursor-grab text-gray-400'
          style={{ touchAction: 'none' }}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={16} />
        </td>
        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100'>
          {source.name}
        </td>
        <td className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100'>
          {source.key}
        </td>
        <td
          className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 max-w-[12rem] truncate'
          title={source.api}
        >
          {source.api || '-'}
        </td>
        <td
          className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 max-w-[12rem] truncate'
          title={source.m3u8}
        >
          {source.m3u8 || '-'}
        </td>
        <td
          className='px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 max-w-[8rem] truncate'
          title={source.detail || '-'}
        >
          {source.detail || '-'}
        </td>
        <td className='px-6 py-4 whitespace-nowrap max-w-[1rem]'>
          <span
            className={`px-2 py-1 text-xs rounded-full ${
              !source.disabled
                ? 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300'
                : 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-300'
            }`}
          >
            {!source.disabled
              ? tt('Enabled', '启用中', '啟用中')
              : tt('Disabled', '已禁用', '已禁用')}
          </span>
        </td>
        <td className='px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2'>
          <button
            onClick={() => handleToggleEnable(source.key)}
            className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium ${
              !source.disabled
                ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/60'
                : 'bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/60'
            } transition-colors`}
          >
            {!source.disabled
              ? tt('Disable', '禁用', '禁用')
              : tt('Enable', '启用', '啟用')}
          </button>
          {source.from !== 'config' && (
            <button
              onClick={() => handleDelete(source.key)}
              className='inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-700/40 dark:hover:bg-gray-700/60 dark:text-gray-200 transition-colors'
            >
              {tt('Delete', '删除', '刪除')}
            </button>
          )}
        </td>
      </tr>
    );
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
      {/* 新增影片來源表单 */}
      <div className='flex items-start justify-between gap-4'>
        <div>
          <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            {tt('Stream providers', '播放来源列表', '播放來源列表')}
          </h4>
          <p className='mt-1 text-xs text-gray-500 dark:text-gray-400'>
            {tt(
              'Stream providers supply playable sources (metadata is optional).',
              '播放源提供可播放资源（可能包含部分元数据）。',
              '播放來源提供可播放資源（可能包含部分中繼資料）。'
            )}
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className='px-3 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors'
        >
          {showAddForm
            ? tt('Cancel', '取消', '取消')
            : tt('Add provider', '新增播放来源', '新增播放來源')}
        </button>
      </div>

      {showAddForm && (
        <div className='p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 space-y-4'>
          <div className='grid grid-cols-1 sm:grid-cols-2 gap-4'>
            <input
              type='text'
              placeholder={tt('Name', '名称', '名稱')}
              value={newSource.name}
              onChange={(e) =>
                setNewSource((prev) => ({ ...prev, name: e.target.value }))
              }
              className='px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
            />
            <input
              type='text'
              placeholder='Key'
              value={newSource.key}
              onChange={(e) =>
                setNewSource((prev) => ({ ...prev, key: e.target.value }))
              }
              className='px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
            />
            <input
              type='text'
              placeholder={tt(
                'API URL (optional)',
                'API 地址（选填）',
                'API 地址（選填）'
              )}
              value={newSource.api}
              onChange={(e) =>
                setNewSource((prev) => ({ ...prev, api: e.target.value }))
              }
              className='px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
            />
            <input
              type='text'
              placeholder={tt(
                'M3U8 URL (optional)',
                'M3U8 地址（选填）',
                'M3U8 地址（選填）'
              )}
              value={newSource.m3u8}
              onChange={(e) =>
                setNewSource((prev) => ({ ...prev, m3u8: e.target.value }))
              }
              className='px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
            />
            <input
              type='text'
              placeholder={tt(
                'Detail URL (optional)',
                'Detail 地址（选填）',
                'Detail 地址（選填）'
              )}
              value={newSource.detail}
              onChange={(e) =>
                setNewSource((prev) => ({ ...prev, detail: e.target.value }))
              }
              className='px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
            />
          </div>
          <div className='flex justify-end'>
            <button
              onClick={handleAddSource}
              disabled={
                !newSource.name ||
                !newSource.key ||
                (!newSource.api?.trim() && !newSource.m3u8?.trim())
              }
              className='w-full sm:w-auto px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg transition-colors'
            >
              {tt('Add', '新增', '新增')}
            </button>
          </div>
        </div>
      )}

      {/* 视频源表格 */}
      <div className='border border-gray-200 dark:border-gray-700 rounded-lg max-h-[28rem] overflow-y-auto overflow-x-auto'>
        <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700'>
          <thead className='bg-gray-50 dark:bg-gray-900'>
            <tr>
              <th className='w-8' />
              <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                {tt('Name', '名称', '名稱')}
              </th>
              <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                Key
              </th>
              <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                {tt('API URL', 'API 地址', 'API 地址')}
              </th>
              <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                {tt('M3U8 URL', 'M3U8 地址', 'M3U8 地址')}
              </th>
              <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                {tt('Detail URL', 'Detail 地址', 'Detail 地址')}
              </th>
              <th className='px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                {tt('Status', '状态', '狀態')}
              </th>
              <th className='px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                {tt('Actions', '操作', '操作')}
              </th>
            </tr>
          </thead>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            autoScroll={false}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          >
            <SortableContext
              items={sources.map((s) => s.key)}
              strategy={verticalListSortingStrategy}
            >
              <tbody className='divide-y divide-gray-200 dark:divide-gray-700'>
                {sources.map((source) => (
                  <DraggableRow key={source.key} source={source} />
                ))}
              </tbody>
            </SortableContext>
          </DndContext>
        </table>
      </div>

      {/* 儲存排序按钮 */}
      {orderChanged && (
        <div className='flex justify-end'>
          <button
            onClick={handleSaveOrder}
            className='px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors'
          >
            {tt('Save order', '保存排序', '儲存排序')}
          </button>
        </div>
      )}
    </div>
  );
};

const SourceValuationTable = ({ sourceConfig }: { sourceConfig?: DataSource[] }) => {
  const [valuations, setValuations] = useState<SourceValuationRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAllProviders, setShowAllProviders] = useState(false);
  const sourceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (sourceConfig ?? []).forEach((source) => {
      if (!source?.key) return;
      map.set(source.key.trim(), source.name?.trim() || source.key.trim());
    });
    return map;
  }, [sourceConfig]);

  const fetchValuations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await fetch('/api/admin/valuations');
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(
          data.error ||
            tt(
              `Failed to load: ${response.status}`,
              `载入失败: ${response.status}`,
              `載入失敗: ${response.status}`
            )
        );
      }
      const data = (await response.json()) as { items?: SourceValuationRow[] };
      const rows = data.items ?? [];
      const dedup = new Map<string, SourceValuationRow>();
      rows.forEach((item) => {
        const key = (item.source || item.key || '').trim();
        if (!key) return;
        dedup.set(key, {
          ...item,
          key,
        });
      });
      const dedupedRows = Array.from(dedup.values()).map((item) => {
        const normalizedSpeed =
          typeof item.speedValue === 'number' && item.speedValue > 0
            ? item.speedValue
            : parseSpeedToKBps(item.loadSpeed);
        return {
          ...item,
          speedValue: normalizedSpeed,
        };
      });

      if (dedupedRows.length === 0) {
        setValuations([]);
        return;
      }

      const speedValues = dedupedRows
        .map((item) => item.speedValue ?? 0)
        .filter((value) => value > 0);
      const maxSpeed = speedValues.length > 0 ? Math.max(...speedValues) : 0;

      const pingValues = dedupedRows
        .map((item) =>
          typeof item.pingTime === 'number' && item.pingTime > 0
            ? item.pingTime
            : null
        )
        .filter((value): value is number => value !== null);
      const minPing =
        pingValues.length > 0 ? Math.min(...pingValues) : Number.NaN;
      const maxPing =
        pingValues.length > 0 ? Math.max(...pingValues) : Number.NaN;

      const rowsWithScores = dedupedRows
        .map((item) => {
          const qualityScore = getQualityScoreFromLabel(
            item.quality,
            item.qualityRank
          );

          const speedScore =
            maxSpeed > 0 && (item.speedValue ?? 0) > 0
              ? Math.min(100, Math.max(0, ((item.speedValue ?? 0) / maxSpeed) * 100))
              : 0;

          let pingScore = 0;
          if (
            typeof item.pingTime === 'number' &&
            item.pingTime > 0 &&
            Number.isFinite(minPing) &&
            Number.isFinite(maxPing) &&
            maxPing - minPing !== 0
          ) {
            pingScore = Math.min(
              100,
              Math.max(
                0,
                ((maxPing - item.pingTime) / (maxPing - minPing)) * 100
              )
            );
          } else if (
            typeof item.pingTime === 'number' &&
            item.pingTime > 0 &&
            Number.isFinite(minPing) &&
            Number.isFinite(maxPing) &&
            maxPing === minPing
          ) {
            pingScore = 100;
          }

          // Provider valuation weights: prioritize quality, de-emphasize speed.
          const QUALITY_WEIGHT = 0.6;
          const SPEED_WEIGHT = 0.15;
          const PING_WEIGHT = 0.25;
          const score =
            qualityScore * QUALITY_WEIGHT +
            speedScore * SPEED_WEIGHT +
            pingScore * PING_WEIGHT;

          return {
            ...item,
            score: Number.isFinite(score) ? Number(score.toFixed(1)) : undefined,
          };
        })
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

      setValuations(rowsWithScores);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : tt('Failed to load', '载入失败', '載入失敗');
      console.error('Failed to load provider valuations:', err);
      setError(message);
      showError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleTestValuations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      // Create a fake sample for the top provider to verify sampleCount/updated_at
      const target = valuations[0];
      if (!target) {
        throw new Error(
          tt(
            'No providers available to test.',
            '没有可测试的提供者。',
            '沒有可測試的提供者。'
          )
        );
      }
      const payload = {
        valuations: [
          {
            key: target.key,
            source: target.source,
            quality: target.quality || '1080p',
            loadSpeed: target.loadSpeed || '1 MB/s',
            pingTime: target.pingTime || 1000,
            qualityRank: target.qualityRank ?? 75,
            speedValue: target.speedValue ?? 1024,
            sampleCount: (target.sampleCount ?? 0) + 1,
            updated_at: Date.now(),
          },
        ],
      };

      const resp = await fetch('/api/source/valuation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(
          data.error ||
            tt(
              `Failed: ${resp.status}`,
              `失败: ${resp.status}`,
              `失敗: ${resp.status}`
            )
        );
      }

      await fetchValuations();

      Swal.fire({
        icon: 'success',
        title: tt('Valuations test', '估值测试', '估值測試'),
        text: tt(
          'Added a test sample to the first provider and refreshed.',
          '向第一个提供者添加了测试样本并已刷新。',
          '向第一個提供者新增了測試樣本並已刷新。'
        ),
      });
    } catch (err) {
      Swal.fire({
        icon: 'error',
        title: tt('Valuations test failed', '估值测试失败', '估值測試失敗'),
        text:
          err instanceof Error
            ? err.message
            : tt('Unknown error', '未知错误', '未知錯誤'),
      });
    } finally {
      setIsLoading(false);
    }
  }, [valuations, fetchValuations]);

  useEffect(() => {
    fetchValuations();
  }, [fetchValuations]);

  const mergedRows = useMemo(() => {
    if (!showAllProviders || !Array.isArray(sourceConfig)) {
      return valuations;
    }
    const existing = new Set(valuations.map((v) => v.key));
    const missing = sourceConfig
      .filter((s) => s.key && !existing.has(s.key))
      .map((s) => ({
        key: s.key,
        source: s.name || s.key,
        quality: '—',
        loadSpeed: '—',
        pingTime: 0,
        qualityRank: undefined,
        speedValue: undefined,
        sampleCount: 0,
        score: undefined,
        updated_at: undefined,
      }))
      .sort((a, b) =>
        (a.source || a.key).localeCompare(b.source || b.key)
      );
    return [...valuations, ...missing];
  }, [showAllProviders, sourceConfig, valuations]);

  const providerCount = sourceConfig?.length || 0;

  return (
    <div className='space-y-4'>
      <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3'>
        <div>
          <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            {tt(
              'Provider valuations (sorted by quality, speed, ping)',
              '提供者评估（按画质、速度、延迟排序）',
              '提供者評估（依畫質、速度、延遲排序）'
            )}
          </h4>
          <p className='text-xs text-gray-500 dark:text-gray-400'>
            {showAllProviders
              ? tt(
                  `Showing all providers (${providerCount || '—'} total; providers without data appear as placeholders)`,
                  `显示所有提供者（共 ${providerCount || '—'} 个，无数据者以占位显示）`,
                  `顯示所有提供者（共 ${providerCount || '—'} 個，無資料者以佔位顯示）`
                )
              : tt(
                  'Showing providers with benchmark data only',
                  '仅显示有测速记录的提供者',
                  '僅顯示有測速紀錄的提供者'
                )}
          </p>
        </div>
        <div className='flex items-center gap-3'>
          <label className='flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300'>
            <input
              type='checkbox'
              className='h-4 w-4'
              checked={showAllProviders}
              onChange={(e) => setShowAllProviders(e.target.checked)}
            />
            {tt('Show all providers', '显示所有提供者', '顯示所有提供者')}
          </label>
          <button
            onClick={fetchValuations}
            className='px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors'
            disabled={isLoading}
          >
            {isLoading
              ? tt('Refreshing…', '刷新中…', '刷新中…')
              : tt('Refresh', '刷新', '重新整理')}
          </button>
          <button
            onClick={handleTestValuations}
            className='px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-sm rounded-lg transition-colors'
            disabled={isLoading}
          >
            {tt('Test storage', '测试存储', '測試存儲')}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className='text-sm text-gray-500 dark:text-gray-400'>
          {tt('Loading…', '加载中…', '讀取中…')}
        </div>
      ) : mergedRows.length === 0 ? (
        <div className='text-sm text-gray-500 dark:text-gray-400'>
          {tt(
            'No benchmark records yet.',
            '尚无测速记录。',
            '尚無測速紀錄。'
          )}
        </div>
      ) : (
        <div className='border border-gray-200 dark:border-gray-700 rounded-lg max-h-[28rem] overflow-y-auto overflow-x-auto'>
          <table className='min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm'>
            <thead className='bg-gray-50 dark:bg-gray-900'>
              <tr>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  {tt('Provider', '提供者', '提供者')}
                </th>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Key
                </th>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  {tt('Resolution', '分辨率', '解析度')}
                </th>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Score
                </th>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Speed
                </th>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Ping (ms)
                </th>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Samples
                </th>
                <th className='px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider'>
                  Updated
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-gray-200 dark:divide-gray-700'>
              {mergedRows.map((item) => {
                const trimmedSource = (item.source || '').trim();
                const displayName =
                  sourceNameMap.get(item.key) ??
                  sourceNameMap.get(trimmedSource) ??
                  item.source ??
                  item.key;
                return (
                  <tr key={item.key} className='hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors'>
                    <td className='px-4 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap'>
                      {displayName}
                    </td>
                    <td className='px-4 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap'>
                      {item.key}
                    </td>
                    <td className='px-4 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap'>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getQualityBadgeClasses(
                          item.quality
                        )}`}
                      >
                        {item.quality || '—'}
                      </span>
                    </td>
                    <td className='px-4 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap'>
                      {(() => {
                        const scoreLabel = toDisplayScore(item.score);
                        return scoreLabel === '—'
                          ? '—'
                          : `${scoreLabel}${tt(' pts', ' 分', ' 分')}`;
                      })()}
                    </td>
                    <td className='px-4 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap'>
                      {item.loadSpeed}
                    </td>
                    <td className='px-4 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap'>
                      {item.pingTime ?? '—'}
                    </td>
                    <td className='px-4 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap'>
                      {item.sampleCount ?? 0}
                    </td>
                    <td className='px-4 py-2 text-gray-600 dark:text-gray-300 whitespace-nowrap'>
                      {item.updated_at
                        ? new Date(item.updated_at).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {error && (
        <div className='text-xs text-red-500'>{error}</div>
      )}
    </div>
  );
};

const SiteConfigComponent = ({ config }: { config: AdminConfig | null }) => {
  const [siteSettings, setSiteSettings] = useState<SiteConfig>({
    SiteName: '',
    Announcement: '',
    SearchDownstreamMaxPage: 1,
    SiteInterfaceCacheTime: 7200,
    ImageProxy: '',
  });
  const [saving, setSaving] = useState(false);
  const [testingConfigJson, setTestingConfigJson] = useState(false);
  const [testSummary, setTestSummary] = useState<string | null>(null);

  const isD1Storage =
    typeof window !== 'undefined' &&
    (window as any).RUNTIME_CONFIG?.STORAGE_TYPE === 'd1';

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
      const resp = await fetch('/api/admin/site', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...siteSettings }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(
          data.error ||
            tt(
              `Save failed: ${resp.status}`,
              `保存失败: ${resp.status}`,
              `保存失敗: ${resp.status}`
            )
        );
      }

      showSuccess(
        tt(
          'Saved. Please refresh the page.',
          '保存成功，请刷新页面。',
          '保存成功，請重新整理頁面'
        )
      );
    } catch (err) {
      showError(
        err instanceof Error
          ? err.message
          : tt('Save failed', '保存失败', '保存失敗')
      );
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
/* eslint-disable @typescript-eslint/no-explicit-any, no-console */

'use client';

// Force dynamic rendering to avoid next-intl static prerender issues
export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, Suspense, useMemo } from 'react';
import { Settings, Database, Users, Info, Video, BarChart3 } from 'lucide-react';
import Swal from 'sweetalert2';

import { AdminConfig, AdminConfigResult } from '@/lib/admin.types';

import PageLayout from '@/components/PageLayout';
import CollapsibleTab from './shared/CollapsibleTab';
import UserConfig from './users/UserConfig';
import VideoSourceConfig from './video-source/VideoSourceConfig';
import SourceValuationTable from './valuations/SourceValuationTable';
import SiteConfigComponent from './site/SiteConfig';
import RedisStatus from './redis/RedisStatus';

function AdminPageClient() {
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<'owner' | 'admin' | null>(null);
  const [expandedTabs, setExpandedTabs] = useState<{ [key: string]: boolean }>({
    userConfig: false,
    videoSource: false,
    sourceValuations: false,
    infoSources: false,
    siteConfig: false,
    redis: false,
  });

  const fetchConfig = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }

      const response = await fetch(`/api/admin/config`);

      if (!response.ok) {
        const data = (await response.json()) as any;
        throw new Error(
          tt(
            `Failed to load config: ${data.error}`,
            `获取配置失败: ${data.error}`,
            `獲取配置失敗: ${data.error}`
          )
        );
      }

      const data = (await response.json()) as AdminConfigResult;
      setConfig(data.Config);
      setRole(data.Role);
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
    fetchConfig(true);
  }, [fetchConfig]);

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
      const response = await fetch(`/api/admin/reset`);
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
          {/* 标题 + 重置配置按钮 */}
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

          {/* 站點配置标签 */}
          <CollapsibleTab
            title={tt('Site settings', '站点配置', '站點配置')}
            icon={
              <Settings
                size={20}
                className='text-gray-600 dark:text-gray-400'
              />
            }
            isExpanded={expandedTabs.siteConfig}
            onToggle={() => toggleTab('siteConfig')}
          >
            <SiteConfigComponent config={config} />
          </CollapsibleTab>

          {/* Redis 狀態 */}
          <CollapsibleTab
            title={tt('Cache / Redis', '缓存 / Redis', '快取 / Redis')}
            icon={
              <Database
                size={20}
                className='text-gray-600 dark:text-gray-400'
              />
            }
            isExpanded={expandedTabs.redis}
            onToggle={() => toggleTab('redis')}
          >
            <RedisStatus />
          </CollapsibleTab>

          <div className='space-y-4'>
            {/* 用戶配置标签 */}
            <CollapsibleTab
              title={tt('Users', '用户', '用戶配置')}
              icon={
                <Users size={20} className='text-gray-600 dark:text-gray-400' />
              }
              isExpanded={expandedTabs.userConfig}
              onToggle={() => toggleTab('userConfig')}
            >
              <UserConfig
                config={config}
                role={role}
                refreshConfig={fetchConfig}
              />
            </CollapsibleTab>

            <CollapsibleTab
              title={tt('Info sources', '信息来源', '資訊來源')}
              icon={
                <Info size={20} className='text-gray-600 dark:text-gray-400' />
              }
              isExpanded={expandedTabs.infoSources}
              onToggle={() => toggleTab('infoSources')}
            >
              <InfoSourceConfig />
            </CollapsibleTab>

            {/* 播放來源配置标签 */}
            <CollapsibleTab
              title={tt('Stream providers', '播放来源', '播放來源')}
              icon={
                <Video size={20} className='text-gray-600 dark:text-gray-400' />
              }
              isExpanded={expandedTabs.videoSource}
              onToggle={() => toggleTab('videoSource')}
            >
              <VideoSourceConfig config={config} refreshConfig={fetchConfig} />
            </CollapsibleTab>

            <CollapsibleTab
              title={tt('Provider valuations', '提供者评估', '提供者評估')}
              icon={
                <BarChart3
                  size={20}
                  className='text-gray-600 dark:text-gray-400'
                />
              }
              isExpanded={expandedTabs.sourceValuations}
              onToggle={() => toggleTab('sourceValuations')}
            >
              <SourceValuationTable sourceConfig={config?.SourceConfig} />
            </CollapsibleTab>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

const InfoSourceConfig = () => {
  const infoSources = [
    {
      key: 'douban',
      name: 'Douban',
      description: tt('Ratings + metadata', '评分与影片信息', '評分與影片資訊'),
    },
    {
      key: 'tmdb',
      name: 'TMDB',
      description: tt('Posters + metadata', '海报与元数据', '海報與中繼資料'),
    },
    {
      key: 'imdb',
      name: 'IMDb',
      description: tt('English title + ratings', '英文标题与评分', '英文標題與評分'),
    },
    {
      key: 'wmdb',
      name: 'WMDB',
      description: tt(
        'Aggregated metadata (Douban/IMDb/RT)',
        '聚合信息（豆瓣/IMDb/烂番茄）',
        '聚合資訊（豆瓣/IMDb/爛番茄）'
      ),
    },
  ];

  return (
    <div className='space-y-4'>
      <div className='rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/70 p-4'>
        <div className='flex items-center justify-between'>
          <h4 className='text-sm font-medium text-gray-700 dark:text-gray-300'>
            {tt('Info sources', '信息来源', '資訊來源')}
          </h4>
          <span className='text-[10px] uppercase tracking-wide px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'>
            {tt('Built-in', '内置', '內建')}
          </span>
        </div>
        <p className='mt-2 text-xs text-gray-500 dark:text-gray-400'>
          {tt(
            'Metadata-only sources (no streams). Managed by the app and not part of api_site.',
            '仅提供元数据（无播放源）。由应用内置管理，不在 api_site 列表中。',
            '僅提供中繼資料（無播放來源）。由應用內建管理，不在 api_site 清單中。'
          )}
        </p>
        <div className='mt-3 grid gap-2 sm:grid-cols-2'>
          {infoSources.map((source) => (
            <div
              key={source.key}
              className='rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200/70 dark:border-gray-700/60 px-3 py-2'
            >
              <div className='text-sm font-semibold text-gray-800 dark:text-gray-100'>
                {source.name}
              </div>
              <div className='text-xs text-gray-500 dark:text-gray-400'>
                {source.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Memoized locale resolution to prevent repeated localStorage/navigator calls
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

export default function AdminPage() {
  return (
    <Suspense>
      <AdminPageClient />
    </Suspense>
  );
}
