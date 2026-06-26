'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'

export default function LoginPage() {
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/'
  const error = searchParams.get('error')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [formError, setFormError] = useState('')
  
  const errorMessages: Record<string, string> = {
    CredentialsSignin: 'メールアドレスまたはパスワードが正しくありません',
    OAuthAccountNotLinked: '既に別の方法でログイン済みのメールアドレスです',
    default: 'ログインに失敗しました',
  }
  
  const handleCredentialsLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setFormError('')
    
    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
      callbackUrl,
    })
    
    setLoading(false)
    
    if (result?.error) {
      setFormError(errorMessages[result.error] || errorMessages.default)
    } else {
      // router.push はクライアントサイドナビゲーションのためミドルウェアを経由しない場合がある。
      // window.location.href でフルリロードしてミドルウェアを必ず通す。
      // mustChangePassword=true なら middleware が /change-password にリダイレクトする。
      window.location.href = callbackUrl
    }
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Meet補正システム
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            VTuberスクール 業務管理
          </p>
        </div>
        
        <div className="card p-8 space-y-6">
          {(error || formError) && (
            <div className="bg-danger-50 border border-danger-200 rounded-md p-3">
              <p className="text-sm text-danger-700">
                {formError || errorMessages[error || ''] || errorMessages.default}
              </p>
            </div>
          )}
          
          {/* メール・パスワードログイン */}
          <form onSubmit={handleCredentialsLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                メールアドレス
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="admin@example.com"
              />
            </div>
            
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                パスワード
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-md py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="パスワードを入力"
              />
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center"
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
          
          <p className="text-xs text-center text-gray-500">
            ※ 初回ログインは管理者にアカウントを作成してもらってください
          </p>
        </div>
      </div>
    </div>
  )
}
