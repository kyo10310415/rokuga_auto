'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  onClose: () => void
}

export default function CreateInstructorModal({ onClose }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'USER' | 'ADMIN'>('USER')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [initialPassword, setInitialPassword] = useState('')
  const [delivered, setDelivered] = useState(false)
  const [createdEmail, setCreatedEmail] = useState('')
  const submitting = useRef(false)

  const close = () => {
    if (submitting.current || (initialPassword && !delivered)) return
    setInitialPassword('')
    onClose()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting.current || initialPassword) return
    submitting.current = true
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/admin/instructors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, role }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '作成に失敗しました')
        return
      }

      setCreatedEmail(data.instructor.email)
      setInitialPassword(data.initialPassword)
      router.refresh()
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">アカウントを作成</h2>
          <button
            onClick={close}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="閉じる"
            disabled={loading || (!!initialPassword && !delivered)}
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-danger-50 border border-danger-200 rounded-md p-3">
            <p className="text-sm text-danger-700">{error}</p>
          </div>
        )}

        {initialPassword ? (
          <div className="space-y-4">
            <p className="text-sm">{createdEmail} のアカウントを作成しました。</p>
            <p className="text-sm text-amber-800">初期パスワードは今回だけ表示されます。本人確認済みの私的な経路で渡してください。共有チャットや画面共有には表示しないでください。</p>
            <label htmlFor="initial-password" className="block text-sm font-medium">初期パスワード</label>
            <input id="initial-password" type="text" readOnly value={initialPassword} autoComplete="off" spellCheck={false} className="w-full border rounded-md p-2 font-mono text-sm" />
            <p className="text-xs text-gray-600">本人の初回ログイン後に変更が必要です。閉じると再表示できません。</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={delivered} onChange={(e) => setDelivered(e.target.checked)} />
              本人へ渡した、または安全な場所に控えました
            </label>
            <button type="button" onClick={close} disabled={!delivered} className="btn-primary">閉じる</button>
          </div>
        ) : <form onSubmit={handleSubmit} className="space-y-4">
          {/* 氏名 */}
          <div>
            <label htmlFor="new-name" className="block text-sm font-medium text-gray-700 mb-1">
              氏名 <span className="text-danger-500">*</span>
            </label>
            <input
              id="new-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={loading}
              required
              placeholder="山田 太郎"
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* メールアドレス */}
          <div>
            <label htmlFor="new-email" className="block text-sm font-medium text-gray-700 mb-1">
              メールアドレス <span className="text-danger-500">*</span>
            </label>
            <input
              id="new-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
              placeholder="user@example.com"
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* 初期パスワード案内 */}
          <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
            <p className="text-sm font-medium text-amber-800">
              初期パスワードは作成時にランダム生成します
            </p>
            <p className="mt-0.5 text-xs text-amber-700">
              作成後に一度だけ表示します。本人へ安全に渡し、初回ログイン後に変更してください。
            </p>
          </div>

          {/* 権限 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              権限 <span className="text-danger-500">*</span>
            </label>
            <div className="flex gap-3">
              <label className={`flex-1 flex items-center gap-2 border rounded-md px-3 py-2.5 cursor-pointer transition-colors ${
                role === 'USER'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-300 hover:bg-gray-50'
              }`}>
                <input
                  type="radio"
                  disabled={loading}
                  name="role"
                  value="USER"
                  checked={role === 'USER'}
                  onChange={() => setRole('USER')}
                  className="accent-primary-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">ユーザー</p>
                  <p className="text-xs text-gray-500">Google連携・自分の予定を管理</p>
                </div>
              </label>

              <label className={`flex-1 flex items-center gap-2 border rounded-md px-3 py-2.5 cursor-pointer transition-colors ${
                role === 'ADMIN'
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-300 hover:bg-gray-50'
              }`}>
                <input
                  type="radio"
                  disabled={loading}
                  name="role"
                  value="ADMIN"
                  checked={role === 'ADMIN'}
                  onChange={() => setRole('ADMIN')}
                  className="accent-primary-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">管理者</p>
                  <p className="text-xs text-gray-500">全機能・ユーザー管理</p>
                </div>
              </label>
            </div>
          </div>

          {/* ボタン */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={close}
              className="btn-secondary"
              disabled={loading}
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
            >
              {loading ? '作成中...' : '作成する'}
            </button>
          </div>
        </form>}
      </div>
    </div>
  )
}
