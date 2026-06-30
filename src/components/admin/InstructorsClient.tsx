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
  recordingFolderId: string | null
  sourceFolderId: string | null
  fileMovingEnabled: boolean
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

// 録画フォルダ設定モーダル
interface RecordingFolderModalProps {
  user: User
  onClose: () => void
  onSave: (userId: string, folderUrl: string | null, sourceFolderUrl: string | null, fileMovingEnabled: boolean) => Promise<void>
  loading: boolean
}

function RecordingFolderModal({ user, onClose, onSave, loading }: RecordingFolderModalProps) {
  const [folderUrl, setFolderUrl] = useState(user.recordingFolderId ?? '')
  const [sourceFolderUrl, setSourceFolderUrl] = useState(user.sourceFolderId ?? '')
  const [fileMovingEnabled, setFileMovingEnabled] = useState(user.fileMovingEnabled)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; details?: string } | null>(null)

  const handleTest = async () => {
    setTestLoading(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/instructors/test-file-move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      })
      const data = await res.json()
      if (res.ok) {
        setTestResult({
          success: true,
          message: `✅ テスト完了: 録画${data.recordingsMoved}件・文字起こし${data.transcriptionsMoved}件移動`,
          details: data.details?.map((d: { fileName: string; success: boolean; error?: string }) => `${d.success ? '✅' : '❌'} ${d.fileName}`).join('\n'),
        })
      } else {
        setTestResult({ success: false, message: `❌ ${data.error || 'テスト失敗'}` })
      }
    } catch {
      setTestResult({ success: false, message: '❌ 通信エラー' })
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 p-6 space-y-5">
        <h3 className="text-base font-semibold text-gray-900">
          📁 録画ファイル設定 — {user.name || user.email}
        </h3>

        {/* 移動元フォルダURL入力 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            移動元フォルダURL
            <span className="ml-1 text-xs font-normal text-gray-400">(未設定時は Meet Recordings を自動検索)</span>
          </label>
          <input
            type="url"
            value={sourceFolderUrl}
            onChange={(e) => setSourceFolderUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p className="text-xs text-gray-500">
            録画・文字起こしファイルの取得元となる Google Drive フォルダです
          </p>
        </div>

        {/* フォルダURL入力 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            録画保存先フォルダURL
          </label>
          <input
            type="url"
            value={folderUrl}
            onChange={(e) => setFolderUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p className="text-xs text-gray-500">
            Google Driveで録画を保存する親フォルダのURLを入力してください
          </p>
        </div>

        {/* フォルダ構成説明 */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-800 space-y-0.5">
          <p className="font-medium">📂 自動で作成されるフォルダ構成</p>
          <p>指定フォルダ（親）</p>
          <p className="pl-3">└ 2026-6（年月）← 自動作成</p>
          <p className="pl-6">└ 録画ファイル</p>
        </div>

        {/* ファイル移動トグル */}
        <div className="flex items-center justify-between py-3 border-t border-gray-100">
          <div>
            <p className="text-sm font-medium text-gray-700">ファイル移動機能</p>
            <p className="text-xs text-gray-500 mt-0.5">
              ONにするとCron Jobで自動的にファイルが移動されます
            </p>
          </div>
          <button
            onClick={() => setFileMovingEnabled(!fileMovingEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${ fileMovingEnabled ? 'bg-primary-600' : 'bg-gray-200' }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${ fileMovingEnabled ? 'translate-x-6' : 'translate-x-1' }`}
            />
          </button>
        </div>

        {/* テスト機能 */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">テスト実行</p>
              <p className="text-xs text-gray-500 mt-0.5">
                今すぐファイル移動を1回実行して動作確認できます
              </p>
            </div>
            <button
              onClick={handleTest}
              disabled={testLoading || !folderUrl}
              className="text-xs px-3 py-1.5 rounded border border-primary-300
                         text-primary-700 hover:bg-primary-50 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {testLoading ? '実行中...' : 'テスト実行'}
            </button>
          </div>

          {testResult && (
            <div className={`rounded-md p-3 text-xs ${
              testResult.success
                ? 'bg-green-50 border border-green-200 text-green-800'
                : 'bg-red-50 border border-red-200 text-red-800'
            }`}>
              <p className="font-medium">{testResult.message}</p>
              {testResult.details && (
                <pre className="mt-1 whitespace-pre-wrap font-mono text-xs opacity-80">
                  {testResult.details}
                </pre>
              )}
            </div>
          )}
        </div>

        {/* ボタン */}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary text-sm">キャンセル</button>
          <button
            onClick={() => onSave(user.id, folderUrl || null, sourceFolderUrl || null, fileMovingEnabled)}
            disabled={loading}
            className="btn-primary text-sm disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存'}
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
  const [recordingFolderTarget, setRecordingFolderTarget] = useState<User | null>(null)

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

  const handleSaveRecordingFolder = async (
    userId: string,
    folderUrl: string | null,
    sourceFolderUrl: string | null,
    fileMovingEnabled: boolean
  ) => {
    setLoadingId(userId)
    try {
      const res = await fetch(`/api/admin/instructors/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordingFolderUrl: folderUrl, sourceFolderUrl, fileMovingEnabled }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error || '保存に失敗しました')
        return
      }
      setRecordingFolderTarget(null)
      router.refresh()
    } catch {
      alert('通信エラーが発生しました')
    } finally {
      setLoadingId(null)
    }
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

                      {/* 録画フォルダ設定ボタン */}
                      <button
                        onClick={() => setRecordingFolderTarget(user)}
                        disabled={isLoading}
                        title={user.fileMovingEnabled ? 'ファイル移動: ON' : 'ファイル移動: OFF'}
                        className={`text-xs px-2.5 py-1 rounded border transition-colors
                          disabled:opacity-50 disabled:cursor-not-allowed ${
                          user.fileMovingEnabled
                            ? 'text-primary-700 border-primary-300 bg-primary-50'
                            : 'text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        📁 {user.fileMovingEnabled ? 'ON' : 'OFF'}
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

      {recordingFolderTarget && (
        <RecordingFolderModal
          user={recordingFolderTarget}
          loading={loadingId === recordingFolderTarget.id}
          onClose={() => setRecordingFolderTarget(null)}
          onSave={handleSaveRecordingFolder}
        />
      )}
    </>
  )
}
