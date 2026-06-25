import { NextRequest, NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole, JobStatus, JobType } from '@prisma/client'
import { executeJob } from '@/lib/google/correction-engine'
import { createLogger } from '@/lib/logger'

const log = createLogger({ module: 'admin-retry' })

/**
 * POST /api/admin/corrections/[id]/retry
 * 補正ジョブの手動再実行
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getAuthSession()
  
  if (!session?.user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  
  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }
  
  const jobId = params.id
  
  const job = await prisma.correctionJob.findUnique({
    where: { id: jobId },
    include: { calendarEvent: true },
  })
  
  if (!job) {
    return NextResponse.json({ error: 'ジョブが見つかりません' }, { status: 404 })
  }
  
  if (job.status === JobStatus.RUNNING) {
    return NextResponse.json({ error: '実行中です' }, { status: 409 })
  }
  
  // 再実行用の新しいジョブを作成
  const newJob = await prisma.correctionJob.create({
    data: {
      calendarEventId: job.calendarEventId,
      userId: job.userId,
      jobType: JobType.MANUAL_RETRY,
      status: JobStatus.PENDING,
      scheduledAt: new Date(),
    },
  })
  
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'correction.manual_retry',
      targetType: 'CorrectionJob',
      targetId: jobId,
      detail: { newJobId: newJob.id, originalJobId: jobId },
    },
  })
  
  log.info({ 
    adminId: session.user.id, 
    originalJobId: jobId, 
    newJobId: newJob.id 
  }, '手動再実行ジョブ作成')
  
  // 非同期で実行（レスポンスを即返す）
  executeJob(newJob.id).catch((err) => {
    log.error({ newJobId: newJob.id, err }, '手動再実行失敗')
  })
  
  return NextResponse.json({ 
    success: true, 
    message: '再実行ジョブを投入しました',
    newJobId: newJob.id,
  })
}
