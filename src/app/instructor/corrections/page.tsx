import { requireAuth } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import AppLayout from '@/components/layouts/AppLayout'
import StatusBadge from '@/components/ui/StatusBadge'
import { JobStatus } from '@prisma/client'

export default async function InstructorCorrectionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const session = await requireAuth()

  const params = await searchParams
  const page = parseInt(params.page || '1', 10)
  const limit = 30
  const statusFilter = params.status as JobStatus | undefined

  const where = {
    userId: session.user.id,
    ...(statusFilter ? { status: statusFilter } : {}),
  }

  const [jobs, total] = await Promise.all([
    prisma.correctionJob.findMany({
      where,
      include: {
        calendarEvent: {
          select: {
            eventTitle: true,
            startTime: true,
            meetLink: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.correctionJob.count({ where }),
  ])

  const totalPages = Math.ceil(total / limit)

  const jobTypeLabels: Record<string, string> = {
    INITIAL_CORRECTION: '初回補正',
    PRE_CHECK: '事前確認',
    MANUAL_RETRY: '手動再実行',
  }

  const statusLabels: Record<JobStatus, string> = {
    PENDING: '待機中',
    RUNNING: '実行中',
    SUCCESS: '成功',
    FAILED: '失敗',
    RETRYING: 'リトライ中',
    SKIPPED: 'スキップ',
  }

  const allStatuses: JobStatus[] = ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'RETRYING', 'SKIPPED']

  function buildUrl(overrides: { status?: string; page?: number }) {
    const p = new URLSearchParams()
    const s = overrides.status ?? params.status
    const pg = overrides.page ?? page
    if (s) p.set('status', s)
    if (pg > 1) p.set('page', String(pg))
    const qs = p.toString()
    return `/instructor/corrections${qs ? `?${qs}` : ''}`
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">補正履歴</h1>
            <p className="text-sm text-gray-500 mt-1">全 {total} 件</p>
          </div>

          {/* ステータスフィルター */}
          <div className="flex flex-wrap gap-2">
            <a
              href={buildUrl({ status: undefined, page: 1 })}
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
                href={buildUrl({ status: s, page: 1 })}
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">開始日時</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">種別</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">試行</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">エラー</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">実行日時</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900 max-w-48 truncate">
                      {job.calendarEvent.eventTitle}
                    </p>
                    {job.calendarEvent.meetLink && (
                      <a
                        href={job.calendarEvent.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary-600 hover:underline"
                      >
                        Meetリンク
                      </a>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">
                    {new Date(job.calendarEvent.startTime).toLocaleString('ja-JP', {
                      month: 'numeric', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {jobTypeLabels[job.jobType] ?? job.jobType}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={job.status} type="job" />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 text-center">
                    {job.attemptCount}/{job.maxAttempts}
                  </td>
                  <td className="px-4 py-3">
                    {job.errorMessage && (
                      <p
                        className="text-xs text-danger-600 max-w-48 truncate"
                        title={job.errorMessage}
                      >
                        {job.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                    {new Date(job.createdAt).toLocaleString('ja-JP', {
                      month: 'numeric', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {jobs.length === 0 && (
            <div className="text-center py-12 text-sm text-gray-500">
              {statusFilter
                ? `「${statusLabels[statusFilter]}」の補正履歴はありません`
                : 'まだ補正履歴がありません'}
            </div>
          )}
        </div>

        {/* ページネーション */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={buildUrl({ page: p })}
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
