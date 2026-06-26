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

export default function InstructorsClient({ users: initial, currentUserId }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [loadingId, setLoadingId] = useState<string | null>(null)

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

                  {/* 有効/無効ボタン */}
                  <td className="px-4 py-3">
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

      {showModal && <CreateInstructorModal onClose={() => setShowModal(false)} />}
    </>
  )
}
