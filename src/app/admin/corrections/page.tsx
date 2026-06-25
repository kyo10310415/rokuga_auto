import { requireAdmin } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import AppLayout from '@/components/layouts/AppLayout'
import StatusBadge from '@/components/ui/StatusBadge'
import { addDays } from 'date-fns'

export default async function AdminCorrectionsPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string }
}) {
  await requireAdmin()
  
  const page = parseInt(searchParams.page || '1', 10)
  const limit = 30
  const statusFilter = searchParams.status as never | undefined
  
  const where = {
    ...(statusFilter && { status: statusFilter }),
  }
  
  const [jobs, total] = await Promise.all([
    prisma.correctionJob.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
        calendarEvent: {
          select: {
            eventTitle: true,
            startTime: true,
            meetLink: true,
            detectionStatus: true,
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
  
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">補正履歴</h1>
            <p className="text-sm text-gray-500 mt-1">全 {total} 件</p>
          </div>
          
          {/* ステータスフィルター */}
          <div className="flex gap-2">
            {['', 'PENDING', 'SUCCESS', 'FAILED', 'RETRYING'].map((s) => (
              <a
                key={s}
                href={s ? `/admin/corrections?status=${s}` : '/admin/corrections'}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  (statusFilter || '') === s
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {s || 'すべて'}
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">開始時刻</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">種別</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状態</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">試行</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">エラー</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">操作</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {jobs.map((job) => (
                <tr key={job.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-gray-900 max-w-48 truncate">
                      {job.calendarEvent.eventTitle}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {job.user.name || job.user.email}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700 whitespace-nowrap">
                    {new Date(job.calendarEvent.startTime).toLocaleString('ja-JP', {
                      month: 'numeric', day: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {job.jobType === 'INITIAL_CORRECTION' && '初回'}
                    {job.jobType === 'PRE_CHECK' && '事前確認'}
                    {job.jobType === 'MANUAL_RETRY' && '手動再実行'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={job.status} type="job" />
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-700">
                    {job.attemptCount}/{job.maxAttempts}
                  </td>
                  <td className="px-4 py-3">
                    {job.errorMessage && (
                      <p className="text-xs text-danger-600 max-w-48 truncate" title={job.errorMessage}>
                        {job.errorMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {job.status === 'FAILED' && (
                      <RetryButton jobId={job.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {jobs.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-500">
              {statusFilter ? `${statusFilter}のジョブはありません` : 'ジョブがありません'}
            </div>
          )}
        </div>
        
        {/* ページネーション */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={`/admin/corrections?${statusFilter ? `status=${statusFilter}&` : ''}page=${p}`}
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

// クライアントコンポーネント（再実行ボタン）
function RetryButton({ jobId }: { jobId: string }) {
  return (
    <form
      action={async () => {
        'use server'
        const { prisma: db } = await import('@/lib/prisma')
        const { executeJob } = await import('@/lib/google/correction-engine')
        const { JobType, JobStatus } = await import('@prisma/client')
        
        const job = await db.correctionJob.findUnique({ where: { id: jobId } })
        if (!job) return
        
        const newJob = await db.correctionJob.create({
          data: {
            calendarEventId: job.calendarEventId,
            userId: job.userId,
            jobType: JobType.MANUAL_RETRY,
            status: JobStatus.PENDING,
            scheduledAt: new Date(),
          },
        })
        
        executeJob(newJob.id).catch(console.error)
      }}
    >
      <button
        type="submit"
        className="text-xs bg-primary-50 text-primary-700 border border-primary-200 px-2.5 py-1 rounded hover:bg-primary-100 transition-colors"
      >
        再実行
      </button>
    </form>
  )
}
