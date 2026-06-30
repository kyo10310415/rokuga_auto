'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()
  const [transcriptionFolderUrl, setTranscriptionFolderUrl] = useState('')
  const [sourceFolderUrl, setSourceFolderUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/admin/settings')
        if (res.ok) {
          const data = await res.json()
          setTranscriptionFolderUrl(data.transcriptionFolderUrl ?? '')
          setSourceFolderUrl(data.sourceFolderUrl ?? '')
        }
      } catch {
        setError('設定の読み込みに失敗しました')
      } finally {
        setFetching(false)
      }
    }
    fetchSettings()
  }, [])

  const handleSave = async () => {
    setLoading(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcriptionFolderUrl: transcriptionFolderUrl || null,
          sourceFolderUrl: sourceFolderUrl || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || '保存に失敗しました')
        return
      }
      setSaved(true)
      router.refresh()
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-gray-500">読み込み中...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">システム設定</h1>
        <p className="text-sm text-gray-500 mt-1">全体共通の設定を管理します</p>
      </div>

      {/* 移動元フォルダ設定 */}
      <div className="card p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-800">
            ファイル移動元フォルダ
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            録画・文字起こしファイルの取得元フォルダです。
            未設定の場合は「Meet Recordings」フォルダを自動検索します。
          </p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 text-sm text-amber-800 space-y-1">
          <p className="font-medium">📁 設定について</p>
          <p>Google Drive の「Meet Recordings」フォルダとは別の場所に録画が保存されている場合に指定してください。</p>
          <p className="mt-1 text-xs text-amber-600">
            ※ 未設定の場合は各ユーザーの「Meet Recordings」フォルダを自動検索します
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Google Drive フォルダURL（移動元）
          </label>
          <input
            type="url"
            value={sourceFolderUrl}
            onChange={(e) => setSourceFolderUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500">
            Google Drive でフォルダを開き、URLをそのまま貼り付けてください
          </p>
        </div>
      </div>

      {/* 文字起こし設定 */}
      <div className="card p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold text-gray-800">
            文字起こしファイル保存先
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Meet終了後に生成される文字起こしファイルの移動先フォルダです。
            全ユーザーで共通です。
          </p>
        </div>

        {/* 説明 */}
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800 space-y-1">
          <p className="font-medium">フォルダ構成</p>
          <p>指定フォルダ（親）</p>
          <p className="pl-4">└ 学籍番号フォルダ（例: OLTS240488-AR）← 自動作成</p>
          <p className="pl-8">└ 文字起こしファイル</p>
          <p className="mt-2 text-xs text-blue-600">
            ※ 学籍番号はカレンダーイベントの説明欄から自動取得します
          </p>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Google Drive フォルダURL
          </label>
          <input
            type="url"
            value={transcriptionFolderUrl}
            onChange={(e) => setTranscriptionFolderUrl(e.target.value)}
            placeholder="https://drive.google.com/drive/folders/..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
          <p className="text-xs text-gray-500">
            Google Drive でフォルダを開き、URLをそのまま貼り付けてください
          </p>
        </div>
      </div>

      {/* 録画ファイル設定の説明 */}
      <div className="card p-6 space-y-3">
        <div>
          <h2 className="text-base font-semibold text-gray-800">
            録画ファイル保存先
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            録画ファイルの移動先は講師ごとに異なります。
            各講師の設定は「ユーザー管理」ページで個別に設定してください。
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800 space-y-1">
          <p className="font-medium">フォルダ構成</p>
          <p>講師指定フォルダ（親）</p>
          <p className="pl-4">└ 年月フォルダ（例: 2026-6）← 自動作成</p>
          <p className="pl-8">└ 録画ファイル</p>
        </div>

        <button
          onClick={() => router.push('/admin/instructors')}
          className="btn-secondary text-sm"
        >
          ユーザー管理ページへ →
        </button>
      </div>

      {/* エラー・成功メッセージ */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-md p-3 text-sm text-green-700">
          ✅ 設定を保存しました
        </div>
      )}

      {/* 保存ボタン */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={loading}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? '保存中...' : '設定を保存'}
        </button>
      </div>
    </div>
  )
}
