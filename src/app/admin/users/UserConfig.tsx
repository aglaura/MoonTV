'use client';

import { useState, useEffect, useMemo } from 'react';
import Swal from 'sweetalert2';
import { getAuthInfoFromBrowserCookie } from '@/lib/auth';
import { AdminConfig, User } from '@/lib/admin.types';
import { tt } from '../shared/i18n';
import { showError } from '../shared/alerts';
import { callApi } from '../shared/adminFetch';
import EditUserModal, { EditingUser } from './EditUserModal';

type UserGroup = 'family' | 'guest';

const resolveUserGroup = (user: User): UserGroup =>
  user.group === 'guest' ? 'guest' : 'family';

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
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null);

  const currentUsername = getAuthInfoFromBrowserCookie()?.username || null;

  // Properly typed runtime config
  interface RuntimeConfig {
    STORAGE_TYPE?: 'd1' | 'kv';
  }

  const runtimeConfig =
    typeof window !== 'undefined'
      ? (window as { RUNTIME_CONFIG?: RuntimeConfig }).RUNTIME_CONFIG
      : undefined;

  const isD1Storage = runtimeConfig?.STORAGE_TYPE === 'd1';
    
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

  const groupOptions = useMemo(() => {
    const groups = new Set<string>(['family', 'guest']);
    (config?.UserConfig?.Users || []).forEach((user) => {
      const trimmedGroup = user.group?.trim();
      if (trimmedGroup) {
        groups.add(trimmedGroup);
      }
    });
    return Array.from(groups);
  }, [config]);

  const toggleAllowRegister = async (value: boolean) => {
    try {
      setUserSettings((prev) => ({ ...prev, enableRegistration: value }));

      await callApi('/api/admin/user', {
        action: 'setAllowRegister',
        allowRegister: value,
      });

      await refreshConfig();
    } catch (err) {
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
    const trimmedNewUsername = editingUser.newUsername.trim();
    const normalizedAvatar = editingUser.avatar.trim();
    const currentGroup = resolveUserGroup(editingEntry);
    let targetName = editingUser.username;

    const actionOptions = { skipRefresh: true, throwOnError: true };

    if (trimmedNewUsername && trimmedNewUsername !== editingUser.username) {
      tasks.push(async () => {
        await handleUserAction(
          'rename',
          targetName,
          undefined,
          undefined,
          undefined,
          trimmedNewUsername,
          actionOptions
        );
        targetName = trimmedNewUsername;
      });
    }

    if (normalizedAvatar !== (editingEntry.avatar || '')) {
      tasks.push(() =>
        handleUserAction(
          'setAvatar',
          targetName,
          undefined,
          normalizedAvatar,
          undefined,
          undefined,
          actionOptions
        )
      );
    }

    if (editingUser.newPassword.trim().length > 0) {
      tasks.push(() =>
        handleUserAction(
          'changePassword',
          targetName,
          editingUser.newPassword.trim(),
          undefined,
          undefined,
          undefined,
          actionOptions
        )
      );
    }

    if (editingUser.group !== currentGroup) {
      tasks.push(() =>
        handleUserAction(
          'setGroup',
          targetName,
          undefined,
          undefined,
          editingUser.group,
          undefined,
          actionOptions
        )
      );
    }

    const isAdminNow = editingEntry.role === 'admin';
    if (editingUser.makeAdmin !== isAdminNow) {
      tasks.push(() =>
        handleUserAction(
          editingUser.makeAdmin ? 'setAdmin' : 'cancelAdmin',
          targetName,
          undefined,
          undefined,
          undefined,
          undefined,
          actionOptions
        )
      );
    }

    const isBannedNow = !!editingEntry.banned;
    if (editingUser.banned !== isBannedNow) {
      tasks.push(() =>
        handleUserAction(
          editingUser.banned ? 'ban' : 'unban',
          targetName,
          undefined,
          undefined,
          undefined,
          undefined,
          actionOptions
        )
      );
    }

    if (tasks.length === 0) {
      setEditingUser(null);
      return;
    }

    try {
      for (const task of tasks) {
        await task();
      }
      await refreshConfig();
      setEditingUser(null);
    } catch (err) {
      showError(
        tt(
          'Some changes may have been applied.',
          '部分修改可能已生效。',
          '部分修改可能已生效。'
        )
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
    newUsername?: string,
    options?: { skipRefresh?: boolean; throwOnError?: boolean }
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

      if (!options?.skipRefresh) {
        await refreshConfig();
      }
    } catch (err) {
      if (options?.throwOnError) {
        throw err;
      }
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
                            value={user.group || 'family'}
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
                                  group: resolveUserGroup(user),
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
      <EditUserModal 
        editingUser={editingUser} 
        setEditingUser={setEditingUser} 
        editingEntry={editingEntry} 
        role={role}
        handleSaveEditUser={handleSaveEditUser}
      />
    </div>
  );
};

export default UserConfig;
