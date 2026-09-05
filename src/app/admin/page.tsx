import { requireAdmin } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import AppLayout from '@/components/layouts/AppLayout'
import StatusBadge from '@/components/ui/StatusBadge'
import { GoogleAccountStatus, JobStatus, DetectionStatus } from '@prisma/client'
import { addDays } from 'date-fns'
import { queueFailedCorrectionJobs } from '@/lib/google/correction-engine'
import { redirect } from 'next/navigation'

async function retryCurrentFailures() {
  'use server'

  const session = await requireAdmin()
  const result = await queueFailedCorrectionJobs()

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'correction.bulk_retry',
      targetType: 'CorrectionJob',
      detail: { queued: result.queued },
    },
  })

  redirect(`/admin?bulkRetryQueued=${result.queued}`)
}

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ bulkRetryQueued?: string }>
}) {
  await requireAdmin()

  const params = await searchParams
  const queuedParam = Number(params.bulkRetryQueued)
  const bulkRetryQueued = Number.isInteger(queuedParam) && queuedParam >= 0
    ? queuedParam
    : undefined
  
  const now = new Date()
  const next7days = addDays(now, 7)
  
  // サマリー統計を並列取得
  const [
    instructorCount,
    connectedCount,
    expiredCount,
    upcomingEventsCount,
    pendingJobsCount,
    latestJobsByEvent,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'USER', isActive: true } }),
    prisma.googleAccount.count({ where: { status: GoogleAccountStatus.ACTIVE } }),
    prisma.googleAccount.count({ 
      where: { status: { in: [GoogleAccountStatus.TOKEN_EXPIRED, GoogleAccountStatus.ERROR] } } 
    }),
    prisma.calendarEvent.count({
      where: {
        startTime: { gte: now, lte: next7days },
        detectionStatus: { not: DetectionStatus.SKIPPED },
      },
    }),
    prisma.correctionJob.count({ where: { status: JobStatus.PENDING } }),
    prisma.correctionJob.findMany({
      // 手動再実行前のFAILED履歴は残るため、予定ごとの最新ジョブだけを取得する
      where: {
        calendarEvent: { endTime: { gte: now } },
        user: {
          isActive: true,
          googleAccount: { status: GoogleAccountStatus.ACTIVE },
        },
      },
      distinct: ['calendarEventId'],
      include: {
        user: { select: { name: true } },
        calendarEvent: { select: { eventTitle: true, startTime: true } },
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
    }),
  ])

  const currentFailures = latestJobsByEvent.filter((job) => job.status === JobStatus.FAILED)
  const failedJobsCount = currentFailures.length
  const recentFailures = currentFailures.slice(0, 5)
  
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">管理ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-1">全講師の状態と補正処理の概要</p>
        </div>

        {bulkRetryQueued !== undefined && (
          <div className="bg-success-50 border border-success-200 rounded-md p-4">
            <p className="text-sm text-success-700">
              ✅ 補正失敗 {bulkRetryQueued}件を再実行待ちに追加しました。既存Cronで順次処理します。
            </p>
          </div>
        )}
        
        {/* サマリーカード */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">講師数</p>
            <p className="text-2xl font-bold text-gray-900">{instructorCount}</p>
            <p className="text-xs text-gray-500 mt-1">
              連携済み <span className="text-success-700 font-medium">{connectedCount}</span>
            </p>
          </div>
          
          <div className={`card p-4 ${expiredCount > 0 ? 'border-warning-400' : ''}`}>
            <p className="text-xs text-gray-500 mb-1">トークン異常</p>
            <p className={`text-2xl font-bold ${expiredCount > 0 ? 'text-warning-700' : 'text-gray-900'}`}>
              {expiredCount}
            </p>
            <p className="text-xs text-gray-500 mt-1">要再連携</p>
          </div>
          
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">今後7日の予定</p>
            <p className="text-2xl font-bold text-gray-900">{upcomingEventsCount}</p>
            <p className="text-xs text-gray-500 mt-1">補正対象イベント</p>
          </div>
          
          <div className={`card p-4 ${failedJobsCount > 0 ? 'border-danger-400' : ''}`}>
            <p className="text-xs text-gray-500 mb-1">補正失敗</p>
            <p className={`text-2xl font-bold ${failedJobsCount > 0 ? 'text-danger-700' : 'text-gray-900'}`}>
              {failedJobsCount}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              待機中 {pendingJobsCount}件
            </p>
          </div>
        </div>
        
        {/* 警告: トークン期限切れ */}
        {expiredCount > 0 && (
          <div className="bg-warning-50 border border-warning-300 rounded-md p-4">
            <div className="flex items-start gap-2">
              <span className="text-warning-500 text-lg">⚠️</span>
              <div>
                <p className="text-sm font-medium text-warning-700">
                  {expiredCount}名の講師でGoogle連携トークンが期限切れまたはエラー状態です
                </p>
                <p className="text-xs text-warning-600 mt-1">
                  該当講師にGoogle再連携を依頼してください。
                  <a href="/admin/instructors" className="underline ml-1">講師管理画面で確認 →</a>
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* 最近の失敗 */}
        {recentFailures.length > 0 && (
          <div className="card">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold text-gray-900">⚠️ 最近の補正失敗</h2>
              <form action={retryCurrentFailures}>
                <button
                  type="submit"
                  className="text-xs bg-primary-600 text-white px-3 py-1.5 rounded hover:bg-primary-700 transition-colors whitespace-nowrap"
                >
                  失敗予定を一括再実行
                </button>
              </form>
            </div>
            <div className="divide-y divide-gray-100">
              {recentFailures.map((job) => (
                <div key={job.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {job.calendarEvent.eventTitle}
                    </p>
                    <p className="text-xs text-gray-500">
                      {job.user.name} ・ 
                      {new Date(job.calendarEvent.startTime).toLocaleDateString('ja-JP')}
                    </p>
                    {job.errorMessage && (
                      <p className="text-xs text-danger-600 mt-0.5 truncate">
                        {job.errorMessage}
                      </p>
                    )}
                  </div>
                  <div className="ml-4 flex items-center gap-2">
                    <StatusBadge status={job.status} type="job" />
                    <a
                      href={`/admin/corrections?jobId=${job.id}`}
                      className="text-xs text-primary-600 hover:underline"
                    >
                      詳細
                    </a>
                  </div>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100">
              <a href="/admin/corrections?status=FAILED" className="text-xs text-primary-600 hover:underline">
                失敗履歴を確認 →
              </a>
            </div>
          </div>
        )}
        
        {failedJobsCount === 0 && expiredCount === 0 && (
          <div className="bg-success-50 border border-success-200 rounded-md p-4">
            <p className="text-sm text-success-700">
              ✅ 現在、対応が必要な問題はありません
            </p>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
