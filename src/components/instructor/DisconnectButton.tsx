'use client'

import { useRouter } from 'next/navigation'

export default function DisconnectButton() {
  const router = useRouter()

  const handleDisconnect = async () => {
    if (!confirm('Google連携を解除しますか？\n解除後は自動補正が停止します。')) return

    try {
      const res = await fetch('/api/google/disconnect', { method: 'DELETE' })
      if (res.ok) {
        router.refresh()
      } else {
        alert('解除に失敗しました。時間をおいて再試行してください。')
      }
    } catch {
      alert('通信エラーが発生しました。')
    }
  }

  return (
    <button
      onClick={handleDisconnect}
      className="text-xs text-danger-600 hover:underline"
    >
      連携を解除する
    </button>
  )
}
