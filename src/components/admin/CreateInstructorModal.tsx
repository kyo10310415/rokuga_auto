'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  onClose: () => void
}

export default function CreateInstructorModal({ onClose }: Props) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'USER' | 'ADMIN'>('USER')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/admin/instructors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, role }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '作成に失敗しました')
        return
      }

      router.refresh()
      onClose()
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-gray-900">アカウントを作成</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            aria-label="閉じる"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-danger-50 border border-danger-200 rounded-md p-3">
            <p className="text-sm text-danger-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
              required
              placeholder="user@example.com"
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          {/* 初期パスワード */}
          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
              初期パスワード <span className="text-danger-500">*</span>
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              placeholder="8文字以上"
              className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500">
              作成後に安全な方法で本人へ伝えてください
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
              onClick={onClose}
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
        </form>
      </div>
    </div>
  )
}
