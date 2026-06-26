import { requireAdmin } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import AppLayout from '@/components/layouts/AppLayout'
import StatusBadge from '@/components/ui/StatusBadge'
import { GoogleAccountStatus, JobStatus, DetectionStatus } from '@prisma/client'
import { addDays } from 'date-fns'

export default async function AdminDashboard() {
  await requireAdmin()
  
  const now = new Date()
  const next7days = addDays(now, 7)
  
  // サマリー統計を並列取得
  const [
    instructorCount,
    connectedCount,
    expiredCount,
    upcomingEventsCount,
    pendingJobsCount,
    failedJobsCount,
    recentFailures,
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
    prisma.correctionJob.count({ where: { status: JobStatus.FAILED } }),
    prisma.correctionJob.findMany({
      where: { status: JobStatus.FAILED },
      include: {
        user: { select: { name: true } },
        calendarEvent: { select: { eventTitle: true, startTime: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 5,
    }),
  ])
  
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">管理ダッシュボード</h1>
          <p className="text-sm text-gray-500 mt-1">全講師の状態と補正処理の概要</p>
        </div>
        
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
            <div className="px-4 py-3 border-b border-gray-200">
              <h2 className="text-sm font-semibold text-gray-900">⚠️ 最近の補正失敗</h2>
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
                すべての失敗を確認 →
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
