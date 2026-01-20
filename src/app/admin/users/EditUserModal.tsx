import type { Dispatch, SetStateAction } from 'react';

import type { User } from '@/lib/admin.types';

import { tt } from '../shared/i18n';

export interface EditingUser {
  username: string;
  newUsername: string;
  avatar: string;
  group: 'family' | 'guest';
  makeAdmin: boolean;
  banned: boolean;
  newPassword: string;
}

interface EditUserModalProps {
  editingUser: EditingUser | null;
  setEditingUser: Dispatch<SetStateAction<EditingUser | null>>;
  editingEntry: User | null;
  role: 'owner' | 'admin' | null;
  handleSaveEditUser: () => Promise<void>;
}

const EditUserModal = ({
  editingUser,
  setEditingUser,
  editingEntry,
  role,
  handleSaveEditUser,
}: EditUserModalProps) => {
  if (!editingUser) {
    return null;
  }

  return (
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
  );
};

export default EditUserModal;
