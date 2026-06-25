import { requireAdmin } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import AppLayout from '@/components/layouts/AppLayout'

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>
}) {
  await requireAdmin()

  const params = await searchParams
  const page = parseInt(params.page || '1', 10)
  const limit = 50
  const actionFilter = params.action || ''

  const where = actionFilter
    ? { action: { contains: actionFilter } }
    : {}

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ])

  const totalPages = Math.ceil(total / limit)

  // よく使うアクションのフィルタープリセット
  const actionPresets = [
    { label: 'すべて', value: '' },
    { label: 'ログイン', value: 'auth.signin' },
    { label: 'ログアウト', value: 'auth.signout' },
    { label: 'Google連携', value: 'google.' },
    { label: '補正', value: 'correction.' },
    { label: '管理操作', value: 'admin.' },
  ]

  // アクション名を日本語に変換
  const actionLabel = (action: string): string => {
    const map: Record<string, string> = {
      'auth.signin': 'ログイン',
      'auth.signout': 'ログアウト',
      'google.connect': 'Google連携',
      'google.disconnect': 'Google連携解除',
      'google.token_refresh': 'トークン更新',
      'correction.retry': '補正再実行',
      'admin.view_logs': 'ログ閲覧',
    }
    return map[action] ?? action
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">監査ログ</h1>
            <p className="text-sm text-gray-500 mt-1">全 {total} 件</p>
          </div>

          {/* アクションフィルター */}
          <div className="flex flex-wrap gap-2">
            {actionPresets.map(({ label, value }) => (
              <a
                key={value}
                href={value ? `/admin/audit-logs?action=${value}` : '/admin/audit-logs'}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  actionFilter === value
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {label}
              </a>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日時</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ユーザー</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">アクション</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">対象</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">詳細</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IPアドレス</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString('ja-JP', {
                      month: 'numeric', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {log.user ? (
                      <div>
                        <p className="text-xs font-medium text-gray-900">
                          {log.user.name || '(名前未設定)'}
                        </p>
                        <p className="text-xs text-gray-400">{log.user.email}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">システム</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700">
                      {actionLabel(log.action)}
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5">{log.action}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {log.targetType && (
                      <span>
                        {log.targetType}
                        {log.targetId && (
                          <span className="text-gray-400 ml-1 font-mono text-xs">
                            #{log.targetId.slice(0, 8)}…
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 max-w-xs">
                    {log.detail && (
                      <pre className="truncate text-xs bg-gray-50 rounded px-1.5 py-1 max-w-48 overflow-hidden">
                        {JSON.stringify(log.detail, null, 0).slice(0, 80)}
                        {JSON.stringify(log.detail).length > 80 ? '…' : ''}
                      </pre>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                    {log.ipAddress || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {logs.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-500">
              {actionFilter ? `「${actionFilter}」のログはありません` : 'ログがまだありません'}
            </div>
          )}
        </div>

        {/* ページネーション */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={`/admin/audit-logs?${actionFilter ? `action=${actionFilter}&` : ''}page=${p}`}
                className={`w-8 h-8 flex items-center justify-center rounded text-xs ${
                  p === page
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                {p}
              </a>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  )
}
