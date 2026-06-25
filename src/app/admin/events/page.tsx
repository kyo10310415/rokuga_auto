import { requireAdmin } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import AppLayout from '@/components/layouts/AppLayout'
import StatusBadge from '@/components/ui/StatusBadge'
import { DetectionStatus } from '@prisma/client'

export default async function AdminEventsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  await requireAdmin()

  const params = await searchParams
  const page = parseInt(params.page || '1', 10)
  const limit = 30
  const statusFilter = params.status as DetectionStatus | undefined

  const where = statusFilter ? { detectionStatus: statusFilter } : {}

  const [events, total] = await Promise.all([
    prisma.calendarEvent.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
        _count: { select: { correctionJobs: true } },
      },
      orderBy: { startTime: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.calendarEvent.count({ where }),
  ])

  const totalPages = Math.ceil(total / limit)

  const statusLabels: Record<DetectionStatus, string> = {
    DETECTED: '検知済み',
    MEET_PENDING: 'Meet待ち',
    READY: '準備完了',
    SKIPPED: 'スキップ',
    CORRECTION_FAILED: '補正失敗',
  }

  const allStatuses: DetectionStatus[] = [
    'DETECTED', 'MEET_PENDING', 'READY', 'SKIPPED', 'CORRECTION_FAILED',
  ]

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">予定一覧</h1>
            <p className="text-sm text-gray-500 mt-1">全 {total} 件</p>
          </div>

          {/* ステータスフィルター */}
          <div className="flex flex-wrap gap-2">
            <a
              href="/admin/events"
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                !statusFilter
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
            >
              すべて
            </a>
            {allStatuses.map((s) => (
              <a
                key={s}
                href={`/admin/events?status=${s}`}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  statusFilter === s
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {statusLabels[s]}
              </a>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">予定名</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">講師</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">開始日時</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">終了</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Meetリンク</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">補正数</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">初回検知</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {events.map((event) => (
                <tr key={event.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900 max-w-48 truncate">
                      {event.eventTitle}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {event.user.name || event.user.email}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">
                    {new Date(event.startTime).toLocaleString('ja-JP', {
                      month: 'numeric', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">
                    {new Date(event.endTime).toLocaleString('ja-JP', {
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3">
                    {event.meetLink ? (
                      <a
                        href={event.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary-600 hover:underline"
                      >
                        参加リンク
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">なし</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={event.detectionStatus} type="detection" />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 text-center">
                    {event._count.correctionJobs}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(event.firstDetectedAt).toLocaleString('ja-JP', {
                      month: 'numeric', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {events.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-500">
              {statusFilter
                ? `「${statusLabels[statusFilter]}」の予定はありません`
                : 'まだ検知された予定がありません'}
            </div>
          )}
        </div>

        {/* ページネーション */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={`/admin/events?${statusFilter ? `status=${statusFilter}&` : ''}page=${p}`}
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
