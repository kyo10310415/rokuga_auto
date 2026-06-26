'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StatusBadge from '@/components/ui/StatusBadge'
import CreateInstructorModal from '@/components/admin/CreateInstructorModal'
import { GoogleAccountStatus, UserRole } from '@prisma/client'

interface GoogleAccount {
  googleEmail: string
  status: GoogleAccountStatus
  lastRefreshedAt: Date | null
  lastErrorMessage: string | null
  lastErrorAt: Date | null
}

interface User {
  id: string
  name: string | null
  email: string | null
  role: UserRole
  isActive: boolean
  googleAccount: GoogleAccount | null
  _count: { calendarEvents: number; correctionJobs: number }
}

interface Props {
  users: User[]
  currentUserId: string
}

const roleLabel: Record<UserRole, string> = {
  ADMIN: '管理者',
  USER: 'ユーザー',
}

// 削除確認ダイアログ
interface DeleteDialogProps {
  user: User
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}

function DeleteConfirmDialog({ user, onConfirm, onCancel, loading }: DeleteDialogProps) {
  const hasData = user._count.calendarEvents > 0 || user._count.correctionJobs > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        {/* アイコン＋タイトル */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full bg-red-100">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">ユーザーを削除しますか？</h3>
            <p className="mt-1 text-sm text-gray-600">
              <span className="font-medium">{user.name || user.email}</span>
              （{user.email}）を完全に削除します。
            </p>
          </div>
        </div>

        {/* 削除対象データの警告 */}
        {hasData && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-3 space-y-1">
            <p className="text-xs font-medium text-red-800">以下のデータもすべて削除されます：</p>
            {user._count.calendarEvents > 0 && (
              <p className="text-xs text-red-700">
                ・カレンダー予定　<span className="font-bold">{user._count.calendarEvents} 件</span>
              </p>
            )}
            {user._count.correctionJobs > 0 && (
              <p className="text-xs text-red-700">
                ・補正ジョブ　<span className="font-bold">{user._count.correctionJobs} 件</span>
              </p>
            )}
          </div>
        )}

        <p className="text-sm text-gray-700 mb-5">
          この操作は<span className="font-semibold text-red-600">取り消せません</span>。本当に削除しますか？
        </p>

        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="btn-secondary text-sm"
          >
            キャンセル
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="text-sm px-4 py-2 rounded-md font-medium
                       bg-red-600 text-white hover:bg-red-700
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-colors"
          >
            {loading ? '削除中...' : '削除する'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function InstructorsClient({ users: initial, currentUserId }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null)

  const patch = async (id: string, data: { isActive?: boolean; role?: string }) => {
    setLoadingId(id)
    try {
      const res = await fetch(`/api/admin/instructors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error || '操作に失敗しました')
        return
      }
      router.refresh()
    } catch {
      alert('通信エラーが発生しました')
    } finally {
      setLoadingId(null)
    }
  }

  const handleDelete = async (user: User) => {
    setLoadingId(user.id)
    try {
      const res = await fetch(`/api/admin/instructors/${user.id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || '削除に失敗しました')
        return
      }
      setDeleteTarget(null)
      router.refresh()
    } catch {
      alert('通信エラーが発生しました')
    } finally {
      setLoadingId(null)
    }
  }

  const handleToggleActive = (user: User) => {
    const next = !user.isActive
    const label = next ? '有効化' : '無効化'
    if (!window.confirm(`「${user.name || user.email}」を${label}しますか？`)) return
    patch(user.id, { isActive: next })
  }

  const handleRoleChange = (user: User, newRole: 'ADMIN' | 'USER') => {
    if (user.role === newRole) return
    const label = roleLabel[newRole]
    if (!window.confirm(`「${user.name || user.email}」の権限を「${label}」に変更しますか？`)) return
    patch(user.id, { role: newRole })
  }

  return (
    <>
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ユーザー管理</h1>
          <p className="text-sm text-gray-500 mt-1">{initial.length}名のユーザー</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary flex items-center gap-1.5"
        >
          <span className="text-base leading-none">＋</span>
          ユーザーを追加
        </button>
      </div>

      {/* テーブル */}
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">氏名</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">権限</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Google連携</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">連携状態</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">予定数</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">補正数</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {initial.map((user) => {
              const isSelf = user.id === currentUserId
              const isLoading = loadingId === user.id

              return (
                <tr key={user.id} className={`hover:bg-gray-50 ${!user.isActive ? 'opacity-50' : ''}`}>
                  {/* 氏名 */}
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900">{user.name || '(未設定)'}</p>
                    <p className="text-xs text-gray-500">{user.email}</p>
                    {!user.isActive && <span className="badge-gray mt-0.5">無効</span>}
                    {isSelf && <span className="ml-1 text-xs text-primary-600">（自分）</span>}
                  </td>

                  {/* 権限セレクト */}
                  <td className="px-4 py-3">
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user, e.target.value as 'ADMIN' | 'USER')}
                      disabled={isSelf || isLoading}
                      className="text-xs border border-gray-300 rounded px-2 py-1 bg-white
                                 focus:outline-none focus:ring-1 focus:ring-primary-500
                                 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <option value="USER">ユーザー</option>
                      <option value="ADMIN">管理者</option>
                    </select>
                  </td>

                  {/* Google連携メール */}
                  <td className="px-4 py-3">
                    {user.googleAccount
                      ? <p className="text-xs text-gray-700">{user.googleAccount.googleEmail}</p>
                      : <span className="text-xs text-gray-400">未連携</span>}
                  </td>

                  {/* 連携状態バッジ */}
                  <td className="px-4 py-3">
                    {user.googleAccount ? (
                      <div className="space-y-1">
                        <StatusBadge status={user.googleAccount.status} type="google" />
                        {user.googleAccount.lastErrorMessage && (
                          <p className="text-xs text-danger-600 max-w-40 truncate">
                            {user.googleAccount.lastErrorMessage}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="badge-gray">未連携</span>
                    )}
                  </td>

                  {/* 予定数 */}
                  <td className="px-4 py-3 text-sm text-gray-700 text-center">
                    {user._count.calendarEvents}
                  </td>

                  {/* 補正数 */}
                  <td className="px-4 py-3 text-sm text-gray-700 text-center">
                    {user._count.correctionJobs}
                  </td>

                  {/* 操作ボタン群 */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {/* 有効/無効ボタン */}
                      <button
                        onClick={() => handleToggleActive(user)}
                        disabled={isSelf || isLoading}
                        className={`text-xs px-2.5 py-1 rounded border transition-colors
                          disabled:opacity-50 disabled:cursor-not-allowed ${
                          user.isActive
                            ? 'text-danger-600 border-danger-200 hover:bg-danger-50'
                            : 'text-success-700 border-success-200 hover:bg-success-50'
                        }`}
                      >
                        {isLoading ? '処理中...' : user.isActive ? '無効化' : '有効化'}
                      </button>

                      {/* 削除ボタン（自分自身・ADMIN は非表示） */}
                      {!isSelf && user.role !== UserRole.ADMIN && (
                        <button
                          onClick={() => setDeleteTarget(user)}
                          disabled={isLoading}
                          className="text-xs px-2.5 py-1 rounded border transition-colors
                                     text-red-600 border-red-200 hover:bg-red-50
                                     disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          削除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {initial.length === 0 && (
          <div className="text-center py-12 text-sm text-gray-500">
            ユーザーが登録されていません。「ユーザーを追加」から作成してください。
          </div>
        )}
      </div>

      {/* モーダル類 */}
      {showModal && <CreateInstructorModal onClose={() => setShowModal(false)} />}

      {deleteTarget && (
        <DeleteConfirmDialog
          user={deleteTarget}
          loading={loadingId === deleteTarget.id}
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
}
