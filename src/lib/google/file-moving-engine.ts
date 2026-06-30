import { prisma } from '@/lib/prisma'
import { GoogleAccountStatus } from '@prisma/client'
import { createLogger } from '@/lib/logger'
import {
  getMeetRecordingFiles,
  getOrCreateYearMonthFolder,
  getOrCreateStudentFolder,
  moveFile,
  extractDateFromFileName,
  extractFolderIdFromUrl,
  classifyFile,
  extractStudentIdFromDescription,
  MoveResult,
} from '@/lib/google/drive-service'

const log = createLogger({ module: 'file-moving-engine' })

// システム設定キー
const TRANSCRIPTION_FOLDER_KEY = 'transcriptionFolderId'

export interface FileMoveEngineResult {
  usersProcessed: number
  recordingsMoved: number
  transcriptionsMoved: number
  skipped: number
  errors: number
  details: MoveResult[]
}

/**
 * 全ユーザーのファイル移動を実行
 * - fileMovingEnabled = true のユーザーのみ対象
 * - recordingFolderId が設定されているユーザーのみ対象
 */
export async function runFileMoveForAllUsers(
  userIdFilter?: string  // テスト用: 特定ユーザーのみ実行
): Promise<FileMoveEngineResult> {
  log.info({ userIdFilter }, 'ファイル移動エンジン開始')

  // 文字起こし共通フォルダIDをシステム設定から取得
  const transcriptionSetting = await prisma.systemSetting.findUnique({
    where: { key: TRANSCRIPTION_FOLDER_KEY },
  })
  const transcriptionFolderUrl = transcriptionSetting?.value ?? null
  const transcriptionFolderId = transcriptionFolderUrl
    ? extractFolderIdFromUrl(transcriptionFolderUrl)
    : null

  // fileMovingEnabled=true かつ recordingFolderId が設定されているユーザーを取得
  const whereClause = {
    fileMovingEnabled: true,
    recordingFolderId: { not: null },
    isActive: true,
    googleAccount: {
      status: GoogleAccountStatus.ACTIVE,
    },
    ...(userIdFilter ? { id: userIdFilter } : {}),
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    include: {
      googleAccount: true,
    },
  })

  log.info({ count: users.length }, '対象ユーザー数')

  const result: FileMoveEngineResult = {
    usersProcessed: 0,
    recordingsMoved: 0,
    transcriptionsMoved: 0,
    skipped: 0,
    errors: 0,
    details: [],
  }

  for (const user of users) {
    try {
      const userResult = await runFileMoveForUser(
        user.id,
        user.recordingFolderId!,
        transcriptionFolderId
      )
      result.usersProcessed++
      result.recordingsMoved += userResult.recordingsMoved
      result.transcriptionsMoved += userResult.transcriptionsMoved
      result.skipped += userResult.skipped
      result.errors += userResult.errors
      result.details.push(...userResult.details)
    } catch (err) {
      log.error({ userId: user.id, err }, 'ユーザーファイル移動失敗')
      result.errors++
    }
  }

  log.info(result, 'ファイル移動エンジン完了')
  return result
}

/**
 * 特定ユーザーのファイル移動を実行
 */
export async function runFileMoveForUser(
  userId: string,
  recordingFolderUrl: string,
  transcriptionFolderId: string | null
): Promise<{
  recordingsMoved: number
  transcriptionsMoved: number
  skipped: number
  errors: number
  details: MoveResult[]
}> {
  const logCtx = createLogger({ module: 'file-moving-engine', userId })
  logCtx.info('ユーザーファイル移動開始')

  const recordingFolderId = extractFolderIdFromUrl(recordingFolderUrl)
  if (!recordingFolderId) {
    logCtx.warn({ recordingFolderUrl }, '録画フォルダIDの抽出失敗')
    return { recordingsMoved: 0, transcriptionsMoved: 0, skipped: 0, errors: 1, details: [] }
  }

  // Meet Recordings フォルダのファイルを取得
  const files = await getMeetRecordingFiles(userId)

  let recordingsMoved = 0
  let transcriptionsMoved = 0
  let skipped = 0
  let errors = 0
  const details: MoveResult[] = []

  for (const file of files) {
    const fileType = classifyFile(file.name)

    if (fileType === 'unknown') {
      logCtx.info({ fileName: file.name }, '対象外ファイルをスキップ')
      skipped++
      continue
    }

    try {
      if (fileType === 'recording') {
        // 録画ファイル: ユーザー指定フォルダ/年月フォルダに移動
        const date = extractDateFromFileName(file.name)
        if (!date) {
          logCtx.warn({ fileName: file.name }, '日付抽出失敗: スキップ')
          skipped++
          continue
        }

        const yearMonthFolderId = await getOrCreateYearMonthFolder(
          userId,
          recordingFolderId,
          date.year,
          date.month
        )

        const currentParentId = file.parents?.[0] ?? ''
        await moveFile(userId, file.id, currentParentId, yearMonthFolderId)

        logCtx.info({ fileName: file.name, dest: `${date.year}-${date.month}` }, '録画移動完了')
        recordingsMoved++
        details.push({
          fileId: file.id,
          fileName: file.name,
          type: 'recording',
          success: true,
          destinationFolderId: yearMonthFolderId,
        })
      } else if (fileType === 'transcription') {
        // 文字起こし: 共通フォルダ/学籍番号フォルダに移動
        if (!transcriptionFolderId) {
          logCtx.warn('文字起こしフォルダ未設定: スキップ')
          skipped++
          continue
        }

        // カレンダーイベントの説明欄から学籍番号を取得
        const studentId = await findStudentIdForFile(userId, file.name)
        if (!studentId) {
          logCtx.warn({ fileName: file.name }, '学籍番号取得失敗: スキップ')
          skipped++
          continue
        }

        const studentFolderId = await getOrCreateStudentFolder(
          userId,
          transcriptionFolderId,
          studentId
        )

        const currentParentId = file.parents?.[0] ?? ''
        await moveFile(userId, file.id, currentParentId, studentFolderId)

        logCtx.info({ fileName: file.name, studentId }, '文字起こし移動完了')
        transcriptionsMoved++
        details.push({
          fileId: file.id,
          fileName: file.name,
          type: 'transcription',
          success: true,
          destinationFolderId: studentFolderId,
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err)
      logCtx.error({ fileName: file.name, err }, 'ファイル移動失敗')
      errors++
      details.push({
        fileId: file.id,
        fileName: file.name,
        type: fileType,
        success: false,
        error: errorMessage,
      })
    }
  }

  return { recordingsMoved, transcriptionsMoved, skipped, errors, details }
}

/**
 * ファイル名に対応するカレンダーイベントを検索し、学籍番号を取得
 * ファイル名の日時と一致するイベントの説明欄を参照
 */
async function findStudentIdForFile(
  userId: string,
  fileName: string
): Promise<string | null> {
  // ファイル名から日付を抽出
  const dateMatch = fileName.match(/(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2})/)
  if (!dateMatch) return null

  const [, year, month, day, hour, minute] = dateMatch
  // 前後10分の範囲でイベントを検索
  const fileTime = new Date(`${year}-${month}-${day}T${hour}:${minute}:00`)
  const timeFrom = new Date(fileTime.getTime() - 10 * 60 * 1000)
  const timeTo = new Date(fileTime.getTime() + 10 * 60 * 1000)

  const event = await prisma.calendarEvent.findFirst({
    where: {
      userId,
      startTime: { gte: timeFrom, lte: timeTo },
      description: { not: null },
    },
    orderBy: { startTime: 'asc' },
  })

  if (!event?.description) return null

  return extractStudentIdFromDescription(event.description)
}
