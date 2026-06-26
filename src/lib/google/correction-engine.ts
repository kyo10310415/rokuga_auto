import { prisma } from '@/lib/prisma'
import { fetchUpcomingEvents, CalendarEventData } from '@/lib/google/calendar-service'
import { getMeetSpaceByLink, updateArtifactSettings } from '@/lib/google/meet-service'
import { DetectionStatus, JobStatus, JobType, GoogleAccountStatus } from '@prisma/client'
import { createLogger } from '@/lib/logger'
import { addMinutes } from 'date-fns'

const log = createLogger({ module: 'correction-engine' })

// リトライ間隔（分）: 指数バックオフ
const RETRY_DELAYS_MINUTES = [2, 5, 15, 30, 60]

/**
 * 全講師のイベントをスキャンし、補正ジョブを投入する
 */
export async function scanAndQueueJobs(): Promise<{
  scanned: number
  queued: number
  errors: number
}> {
  log.info('イベントスキャン開始')
  
  // アクティブなGoogle連携を持つ全講師を取得
  const activeAccounts = await prisma.googleAccount.findMany({
    where: {
      status: GoogleAccountStatus.ACTIVE,
      user: { isActive: true },
    },
    include: { user: true },
  })
  
  log.info({ count: activeAccounts.length }, '対象講師数')
  
  let scanned = 0
  let queued = 0
  let errors = 0
  
  for (const account of activeAccounts) {
    try {
      const result = await scanUserEvents(account.userId, account.googleEmail)
      scanned += result.scanned
      queued += result.queued
    } catch (err) {
      log.error({ userId: account.userId, err }, 'ユーザーイベントスキャン失敗')
      errors++
    }
  }
  
  log.info({ scanned, queued, errors }, 'イベントスキャン完了')
  return { scanned, queued, errors }
}

/**
 * 特定ユーザーのイベントをスキャン
 */
async function scanUserEvents(userId: string, googleEmail: string): Promise<{
  scanned: number
  queued: number
}> {
  const logCtx = createLogger({ module: 'correction-engine', userId })
  
  let events: CalendarEventData[]
  try {
    events = await fetchUpcomingEvents(userId)
  } catch (err) {
    logCtx.error({ err }, 'Calendar取得失敗')
    throw err
  }
  
  logCtx.info({ count: events.length }, 'イベント取得完了')
  
  let queued = 0
  
  for (const event of events) {
    // Meet付きイベントのみ対象
    if (!event.meetLink) {
      continue
    }
    
    // 自分が主催者のイベントのみ補正対象
    // 他者主催の会議は Meet Space の PATCH 権限がないためスキップ
    if (event.organizerEmail && event.organizerEmail.toLowerCase() !== googleEmail.toLowerCase()) {
      logCtx.info(
        { eventTitle: event.title, organizer: event.organizerEmail, self: googleEmail },
        '他者主催イベントをスキップ（権限なし）'
      )
      continue
    }
    
    // DBに保存または更新
    const existingEvent = await prisma.calendarEvent.findUnique({
      where: {
        userId_calendarId_googleEventId: {
          userId,
          calendarId: event.calendarId,
          googleEventId: event.id,
        },
      },
    })
    
    if (existingEvent) {
      // 既存イベント: 開始時刻の更新のみ（補正済みは再実行しない）
      if (existingEvent.detectionStatus === DetectionStatus.READY) {
        continue // 補正済みはスキップ
      }
      
      await prisma.calendarEvent.update({
        where: { id: existingEvent.id },
        data: {
          eventTitle: event.title,
          startTime: event.startTime,
          endTime: event.endTime,
          meetLink: event.meetLink,
          lastCheckedAt: new Date(),
        },
      })
      
      // CORRECTION_FAILEDの場合は再キュー
      if (existingEvent.detectionStatus !== DetectionStatus.CORRECTION_FAILED) {
        continue
      }
    }
    
    // 新規イベントをDB保存
    const calendarEvent = await prisma.calendarEvent.upsert({
      where: {
        userId_calendarId_googleEventId: {
          userId,
          calendarId: event.calendarId,
          googleEventId: event.id,
        },
      },
      create: {
        userId,
        calendarId: event.calendarId,
        googleEventId: event.id,
        eventTitle: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        meetLink: event.meetLink,
        organizerEmail: event.organizerEmail,
        attendees: event.attendees ? JSON.parse(JSON.stringify(event.attendees)) : undefined,
        detectionStatus: DetectionStatus.DETECTED,
        firstDetectedAt: new Date(),
        rawData: JSON.parse(JSON.stringify(event.rawData)),
      },
      update: {
        eventTitle: event.title,
        startTime: event.startTime,
        endTime: event.endTime,
        meetLink: event.meetLink,
        lastCheckedAt: new Date(),
        detectionStatus: DetectionStatus.DETECTED,
      },
    })
    
    // 既に補正ジョブが存在する場合はスキップ
    const existingJob = await prisma.correctionJob.findFirst({
      where: {
        calendarEventId: calendarEvent.id,
        jobType: JobType.INITIAL_CORRECTION,
        status: { in: [JobStatus.PENDING, JobStatus.RUNNING, JobStatus.SUCCESS] },
      },
    })
    
    if (existingJob) {
      continue
    }
    
    // 補正ジョブを投入
    await prisma.correctionJob.create({
      data: {
        calendarEventId: calendarEvent.id,
        userId,
        jobType: JobType.INITIAL_CORRECTION,
        status: JobStatus.PENDING,
        scheduledAt: new Date(),
      },
    })
    
    logCtx.info({ eventId: calendarEvent.id, title: event.title }, '補正ジョブ投入')
    queued++
  }
  
  return { scanned: events.length, queued }
}

/**
 * Pendingの補正ジョブを実行
 */
export async function executePendingJobs(): Promise<{
  executed: number
  succeeded: number
  failed: number
}> {
  const log2 = createLogger({ module: 'correction-engine' })
  
  const pendingJobs = await prisma.correctionJob.findMany({
    where: {
      status: JobStatus.PENDING,
      scheduledAt: { lte: new Date() },
    },
    include: { calendarEvent: true },
    orderBy: { scheduledAt: 'asc' },
    take: 50, // バッチサイズ
  })
  
  log2.info({ count: pendingJobs.length }, 'Pendingジョブ実行開始')
  
  let executed = 0
  let succeeded = 0
  let failed = 0
  
  for (const job of pendingJobs) {
    try {
      const success = await executeJob(job.id)
      executed++
      if (success) succeeded++
      else failed++
    } catch (err) {
      log2.error({ jobId: job.id, err }, 'ジョブ実行例外')
      executed++
      failed++
    }
  }
  
  return { executed, succeeded, failed }
}

/**
 * 単一ジョブの実行
 */
export async function executeJob(jobId: string): Promise<boolean> {
  const logCtx = createLogger({ module: 'correction-engine', jobId })
  
  // ジョブをRUNNINGに更新
  const job = await prisma.correctionJob.update({
    where: { id: jobId },
    data: {
      status: JobStatus.RUNNING,
      startedAt: new Date(),
      attemptCount: { increment: 1 },
    },
    include: { calendarEvent: true },
  })
  
  logCtx.info({ 
    calendarEventId: job.calendarEventId,
    meetLink: job.calendarEvent.meetLink,
    attemptCount: job.attemptCount,
  }, 'ジョブ実行開始')
  
  const meetLink = job.calendarEvent.meetLink
  
  if (!meetLink) {
    // MeetリンクがまだついていないのでPendingに
    await prisma.correctionJob.update({
      where: { id: jobId },
      data: { status: JobStatus.PENDING, scheduledAt: addMinutes(new Date(), 5) },
    })
    await prisma.calendarEvent.update({
      where: { id: job.calendarEventId },
      data: { detectionStatus: DetectionStatus.MEET_PENDING },
    })
    logCtx.warn('Meetリンクなし: 5分後に再試行')
    return false
  }
  
  try {
    // Meet Space情報を取得
    const spaceResult = await getMeetSpaceByLink(job.userId, meetLink)
    
    if (!spaceResult) {
      throw new Error(`Meet Spaceが取得できませんでした: ${meetLink}`)
    }
    
    // SpaceIDをDBに保存
    await prisma.calendarEvent.update({
      where: { id: job.calendarEventId },
      data: { meetSpaceId: spaceResult.spaceName },
    })
    
    // artifact設定を更新
    const result = await updateArtifactSettings(
      job.userId,
      spaceResult.spaceName,
      spaceResult.spaceInfo
    )
    
    if (result.success) {
      // 成功
      await prisma.correctionJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.SUCCESS,
          completedAt: new Date(),
          preRecordingEnabled: result.before.recordingEnabled,
          preTranscriptionEnabled: result.before.transcriptionEnabled,
          postRecordingEnabled: result.after.recordingEnabled,
          postTranscriptionEnabled: result.after.transcriptionEnabled,
          confirmedRecordingEnabled: result.after.recordingEnabled,
          confirmedTranscriptionEnabled: result.after.transcriptionEnabled,
          errorCode: null,
          errorMessage: null,
          errorDetail: undefined,
        },
      })
      
      await prisma.calendarEvent.update({
        where: { id: job.calendarEventId },
        data: { detectionStatus: DetectionStatus.READY },
      })
      
      logCtx.info({ result }, '補正成功')
      return true
    } else {
      throw new Error(result.error || '補正失敗（原因不明）')
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logCtx.error({ err }, '補正失敗')
    
    // リトライ判定
    if (job.attemptCount < job.maxAttempts) {
      const delayMinutes = RETRY_DELAYS_MINUTES[job.attemptCount - 1] ?? 60
      const nextRetry = addMinutes(new Date(), delayMinutes)
      
      await prisma.correctionJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.RETRYING,
          errorCode: 'CORRECTION_ERROR',
          errorMessage,
          errorDetail: { err: String(err), timestamp: new Date().toISOString() },
          nextRetryAt: nextRetry,
          scheduledAt: nextRetry,
        },
      })
      
      // 次回のPendingジョブを作成
      await prisma.correctionJob.update({
        where: { id: jobId },
        data: { status: JobStatus.PENDING, scheduledAt: nextRetry },
      })
      
      logCtx.warn({ nextRetry, delayMinutes }, `リトライスケジュール: ${delayMinutes}分後`)
    } else {
      // リトライ上限に達した
      await prisma.correctionJob.update({
        where: { id: jobId },
        data: {
          status: JobStatus.FAILED,
          completedAt: new Date(),
          errorCode: 'MAX_RETRY_EXCEEDED',
          errorMessage,
          errorDetail: { err: String(err), timestamp: new Date().toISOString() },
        },
      })
      
      await prisma.calendarEvent.update({
        where: { id: job.calendarEventId },
        data: { detectionStatus: DetectionStatus.CORRECTION_FAILED },
      })
      
      logCtx.error({ jobId }, `リトライ上限(${job.maxAttempts}回)超過: FAILED`)
    }
    
    return false
  }
}

/**
 * 開始前再確認: 会議開始30分前のイベントをチェック
 */
export async function runPreCheckJobs(minutesBefore = 30): Promise<{
  checked: number
  corrected: number
  failures: number
}> {
  const logCtx = createLogger({ module: 'correction-engine' })
  
  const now = new Date()
  const checkFrom = now
  const checkTo = addMinutes(now, minutesBefore)
  
  // 開始前30分以内のREADYイベントを確認
  const upcomingEvents = await prisma.calendarEvent.findMany({
    where: {
      startTime: { gte: checkFrom, lte: checkTo },
      detectionStatus: { in: [DetectionStatus.READY, DetectionStatus.DETECTED] },
      meetSpaceId: { not: null },
    },
    include: {
      user: {
        include: { googleAccount: true },
      },
    },
  })
  
  logCtx.info({ count: upcomingEvents.length }, '開始前再確認対象')
  
  let checked = 0
  let corrected = 0
  let failures = 0
  
  for (const event of upcomingEvents) {
    if (!event.meetSpaceId) continue
    if (event.user.googleAccount?.status !== GoogleAccountStatus.ACTIVE) continue
    
    checked++
    
    // 設定を再確認
    try {
      const { verifyArtifactSettings, getMeetSpace, updateArtifactSettings } = await import('@/lib/google/meet-service')
      const currentSettings = await verifyArtifactSettings(event.userId, event.meetSpaceId)
      
      if (!currentSettings) {
        logCtx.warn({ eventId: event.id }, '設定確認失敗')
        failures++
        continue
      }
      
      if (currentSettings.recordingEnabled && currentSettings.transcriptionEnabled) {
        logCtx.info({ eventId: event.id }, '設定確認OK')
        continue
      }
      
      // 設定が狂っている場合は再補正
      logCtx.warn({ eventId: event.id, currentSettings }, '設定が期待値と異なる: 再補正')
      
      const spaceInfo = await getMeetSpace(event.userId, event.meetSpaceId)
      if (!spaceInfo) {
        failures++
        continue
      }
      
      const result = await updateArtifactSettings(event.userId, event.meetSpaceId, spaceInfo)
      
      // 再補正ジョブをDB記録
      await prisma.correctionJob.create({
        data: {
          calendarEventId: event.id,
          userId: event.userId,
          jobType: JobType.PRE_CHECK,
          status: result.success ? JobStatus.SUCCESS : JobStatus.FAILED,
          startedAt: new Date(),
          completedAt: new Date(),
          preRecordingEnabled: result.before.recordingEnabled,
          preTranscriptionEnabled: result.before.transcriptionEnabled,
          postRecordingEnabled: result.after.recordingEnabled,
          postTranscriptionEnabled: result.after.transcriptionEnabled,
          errorMessage: result.error,
        },
      })
      
      if (result.success) {
        corrected++
        logCtx.info({ eventId: event.id }, '再補正成功')
      } else {
        failures++
        logCtx.error({ eventId: event.id, error: result.error }, '再補正失敗')
      }
    } catch (err) {
      logCtx.error({ eventId: event.id, err }, '再確認例外')
      failures++
    }
  }
  
  logCtx.info({ checked, corrected, failures }, '開始前再確認完了')
  return { checked, corrected, failures }
}
