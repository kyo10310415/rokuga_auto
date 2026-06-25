'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StatusBadge from '@/components/ui/StatusBadge'
import CreateInstructorModal from '@/components/admin/CreateInstructorModal'
import { GoogleAccountStatus } from '@prisma/client'

interface GoogleAccount {
  googleEmail: string
  status: GoogleAccountStatus
  lastRefreshedAt: Date | null
  lastErrorMessage: string | null
  lastErrorAt: Date | null
}

interface Instructor {
  id: string
  name: string | null
  email: string | null
  isActive: boolean
  googleAccount: GoogleAccount | null
  _count: {
    calendarEvents: number
    correctionJobs: number
  }
}

interface Props {
  instructors: Instructor[]
}

export default function InstructorsClient({ instructors: initial }: Props) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const handleToggleActive = async (instructor: Instructor) => {
    const next = !instructor.isActive
    const label = next ? '有効化' : '無効化'
    if (!window.confirm(`「${instructor.name || instructor.email}」を${label}しますか？`)) return

    setTogglingId(instructor.id)
    try {
      const res = await fetch(`/api/admin/instructors/${instructor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: next }),
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || '操作に失敗しました')
        return
      }
      router.refresh()
    } catch {
      alert('通信エラーが発生しました')
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <>
      {/* ヘッダー行 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">講師管理</h1>
          <p className="text-sm text-gray-500 mt-1">{initial.length}名の講師</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-primary flex items-center gap-1.5"
        >
          <span className="text-base leading-none">＋</span>
          講師を追加
        </button>
      </div>

      {/* テーブル */}
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">講師名</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Google連携</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">連携状態</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">予定数</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">補正数</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">最終更新</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {initial.map((instructor) => (
              <tr
                key={instructor.id}
                className={`hover:bg-gray-50 ${!instructor.isActive ? 'opacity-50' : ''}`}
              >
                {/* 名前 */}
                <td className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900">
                    {instructor.name || '(未設定)'}
                  </p>
                  <p className="text-xs text-gray-500">{instructor.email}</p>
                  {!instructor.isActive && (
                    <span className="badge-gray mt-0.5">無効</span>
                  )}
                </td>

                {/* Google連携メール */}
                <td className="px-4 py-3">
                  {instructor.googleAccount ? (
                    <p className="text-xs text-gray-700">{instructor.googleAccount.googleEmail}</p>
                  ) : (
                    <span className="text-xs text-gray-400">未連携</span>
                  )}
                </td>

                {/* 連携状態バッジ */}
                <td className="px-4 py-3">
                  {instructor.googleAccount ? (
                    <div className="space-y-1">
                      <StatusBadge status={instructor.googleAccount.status} type="google" />
                      {instructor.googleAccount.lastErrorMessage && (
                        <p className="text-xs text-danger-600 max-w-40 truncate">
                          {instructor.googleAccount.lastErrorMessage}
                        </p>
                      )}
                    </div>
                  ) : (
                    <span className="badge-gray">未連携</span>
                  )}
                </td>

                {/* 予定数 */}
                <td className="px-4 py-3 text-sm text-gray-700 text-center">
                  {instructor._count.calendarEvents}
                </td>

                {/* 補正数 */}
                <td className="px-4 py-3 text-sm text-gray-700 text-center">
                  {instructor._count.correctionJobs}
                </td>

                {/* 最終更新 */}
                <td className="px-4 py-3 text-xs text-gray-500">
                  {instructor.googleAccount?.lastRefreshedAt
                    ? new Date(instructor.googleAccount.lastRefreshedAt).toLocaleDateString('ja-JP')
                    : '—'}
                </td>

                {/* 操作 */}
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleActive(instructor)}
                    disabled={togglingId === instructor.id}
                    className={`text-xs px-2.5 py-1 rounded border transition-colors
                      disabled:opacity-50 disabled:cursor-not-allowed ${
                      instructor.isActive
                        ? 'text-danger-600 border-danger-200 hover:bg-danger-50'
                        : 'text-success-700 border-success-200 hover:bg-success-50'
                    }`}
                  >
                    {togglingId === instructor.id
                      ? '処理中...'
                      : instructor.isActive ? '無効化' : '有効化'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {initial.length === 0 && (
          <div className="text-center py-12 text-sm text-gray-500">
            講師が登録されていません。「講師を追加」から作成してください。
          </div>
        )}
      </div>

      {/* 作成モーダル */}
      {showModal && (
        <CreateInstructorModal onClose={() => setShowModal(false)} />
      )}
    </>
  )
}
