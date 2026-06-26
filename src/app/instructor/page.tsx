import { requireAuth } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import AppLayout from '@/components/layouts/AppLayout'
import StatusBadge from '@/components/ui/StatusBadge'
import DisconnectButton from '@/components/instructor/DisconnectButton'
import { GoogleAccountStatus, DetectionStatus } from '@prisma/client'
import { addDays } from 'date-fns'

export default async function InstructorPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string; missing?: string }>
}) {
  const session = await requireAuth()
  const userId = session.user.id
  const params = await searchParams
  
  const [googleAccount, upcomingEvents] = await Promise.all([
    prisma.googleAccount.findUnique({
      where: { userId },
      select: {
        googleEmail: true,
        status: true,
        lastRefreshedAt: true,
        lastErrorMessage: true,
        createdAt: true,
      },
    }),
    prisma.calendarEvent.findMany({
      where: {
        userId,
        startTime: { gte: new Date(), lte: addDays(new Date(), 7) },
      },
      include: {
        correctionJobs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { startTime: 'asc' },
      take: 5,
    }),
  ])
  
  const isConnected = !!googleAccount && googleAccount.status === GoogleAccountStatus.ACTIVE
  const hasTokenIssue = googleAccount && 
    (googleAccount.status === GoogleAccountStatus.TOKEN_EXPIRED || 
     googleAccount.status === GoogleAccountStatus.ERROR)
  
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">マイページ</h1>
          <p className="text-sm text-gray-500 mt-1">
            ようこそ、{session.user.name || session.user.email} さん
          </p>
        </div>
        
        {/* 成功・エラーメッセージ */}
        {params.success === 'google_connected' && (
          <div className="bg-success-50 border border-success-200 rounded-md p-3">
            <p className="text-sm text-success-700">
              ✅ Googleアカウントの連携が完了しました。次回のスキャンから自動補正が開始されます。
            </p>
          </div>
        )}
        
        {params.error && (
          <div className="bg-danger-50 border border-danger-200 rounded-md p-3">
            <p className="text-sm text-danger-700">
              ❌ {getErrorMessage(params.error, params.missing)}
            </p>
          </div>
        )}
        
        {/* Google連携状態 */}
        <section className="card p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Google連携状態</h2>
          
          {isConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <StatusBadge status="ACTIVE" type="google" />
                <p className="text-sm text-gray-700">{googleAccount!.googleEmail}</p>
              </div>
              
              <div className="text-xs text-gray-500 space-y-1">
                <p>連携開始: {new Date(googleAccount!.createdAt).toLocaleDateString('ja-JP')}</p>
                {googleAccount?.lastRefreshedAt && (
                  <p>最終更新: {new Date(googleAccount.lastRefreshedAt).toLocaleDateString('ja-JP')}</p>
                )}
              </div>
              
              <div className="flex gap-2 mt-3">
                <DisconnectButton />
              </div>
            </div>
          ) : hasTokenIssue ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <StatusBadge status={googleAccount!.status} type="google" />
                <p className="text-sm text-gray-700">{googleAccount!.googleEmail}</p>
              </div>
              {googleAccount?.lastErrorMessage && (
                <p className="text-xs text-danger-600">{googleAccount.lastErrorMessage}</p>
              )}
              <a href="/api/google/connect" className="btn-primary inline-flex text-xs">
                再連携する
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Googleアカウントを連携すると、Google Calendarの予約を自動で検知し、
                Meet会議の録画・文字起こしを自動でONに設定します。
              </p>
              <div className="bg-gray-50 rounded p-3 text-xs text-gray-600 space-y-1">
                <p className="font-medium">連携に必要な権限:</p>
                <p>・Google Calendar（読み取り専用）</p>
                <p>・Google Meet 会議設定の更新</p>
              </div>
              <a href="/api/google/connect" className="btn-primary inline-flex text-sm">
                Googleアカウントを連携する
              </a>
            </div>
          )}
        </section>
        
        {/* 今後の予定 */}
        <section className="card">
          <div className="px-5 py-4 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">今後の予定（7日間）</h2>
          </div>
          
          {upcomingEvents.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {upcomingEvents.map((event) => {
                const latestJob = event.correctionJobs[0]
                
                return (
                  <div key={event.id} className="px-5 py-4 flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {event.eventTitle}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {new Date(event.startTime).toLocaleString('ja-JP', {
                          month: 'numeric', day: 'numeric', weekday: 'short',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                      {event.meetLink && (
                        <a
                          href={event.meetLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary-600 hover:underline mt-1 inline-block"
                        >
                          Meet会議リンク ↗
                        </a>
                      )}
                    </div>
                    <div className="ml-4 flex flex-col items-end gap-1">
                      <StatusBadge status={event.detectionStatus} type="detection" />
                      {latestJob && (
                        <StatusBadge status={latestJob.status} type="job" />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-sm text-gray-500">
              {isConnected ? '今後7日間の予定はありません' : 'Googleを連携すると予定が表示されます'}
            </div>
          )}
          
          {upcomingEvents.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100">
              <a href="/instructor/events" className="text-xs text-primary-600 hover:underline">
                すべての予定を見る →
              </a>
            </div>
          )}
        </section>
      </div>
    </AppLayout>
  )
}

function getErrorMessage(error: string, missing?: string): string {
  const messages: Record<string, string> = {
    google_auth_denied: 'Google認証がキャンセルされました',
    invalid_callback: 'コールバック処理に失敗しました',
    google_account_already_linked: 'このGoogleアカウントは既に別のユーザーが使用しています',
    insufficient_scopes: `必要な権限が付与されませんでした: ${missing || ''}`,
    connection_failed: 'Google連携に失敗しました。時間をおいて再試行してください。',
  }
  return messages[error] || '予期しないエラーが発生しました'
}
