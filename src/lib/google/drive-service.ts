import { google } from 'googleapis'
import { getAuthenticatedClient } from '@/lib/google/oauth-client'
import { createLogger } from '@/lib/logger'

const log = createLogger({ module: 'drive-service' })

// ファイル名パターン
// 録画: "WannaVレッスン予約 (石山光司) - 2026/06/29 18:58 JST～Recording"
// 文字起こし: "WannaVレッスン予約 (石山光司) - 2026/06/29 18:58 JST - Gemini によるメモ"
const RECORDING_PATTERN = /Recording$/
const TRANSCRIPTION_PATTERN = /Gemini によるメモ$/
// 録画ファイルの追加フィルタ: ファイル名に「レッスン」を含むもののみ移動対象
const RECORDING_LESSON_KEYWORD = 'レッスン'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  createdTime: string
  parents?: string[]
}

export interface MoveResult {
  fileId: string
  fileName: string
  type: 'recording' | 'transcription'
  success: boolean
  error?: string
  destinationFolderId?: string
}

/**
 * Google Drive フォルダURLからフォルダIDを抽出
 * https://drive.google.com/drive/folders/FOLDER_ID
 * https://drive.google.com/drive/u/0/folders/FOLDER_ID
 */
export function extractFolderIdFromUrl(url: string): string | null {
  if (!url) return null
  // URLパターンからID抽出
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/)
  if (match) return match[1]
  // IDそのものが渡された場合
  if (/^[a-zA-Z0-9_-]{25,}$/.test(url)) return url
  return null
}

/**
 * 移動元フォルダ内のファイルを取得
 * @param userId         対象ユーザーID
 * @param sourceFolderUrl 移動元フォルダURL（指定時はそのフォルダを使用）
 *                        未指定時は "Meet Recordings" フォルダを自動検索（後方互換）
 */
export async function getMeetRecordingFiles(
  userId: string,
  sourceFolderUrl?: string | null
): Promise<DriveFile[]> {
  const logCtx = createLogger({ module: 'drive-service', userId })

  try {
    const { client } = await getAuthenticatedClient(userId)
    const drive = google.drive({ version: 'v3', auth: client })

    let sourceFolderId: string | null = null

    if (sourceFolderUrl) {
      // 管理者が指定した移動元フォルダURLからIDを抽出
      sourceFolderId = extractFolderIdFromUrl(sourceFolderUrl)
      if (!sourceFolderId) {
        logCtx.warn({ sourceFolderUrl }, '移動元フォルダURLからIDを抽出できません')
        return []
      }
      logCtx.info({ sourceFolderId, sourceFolderUrl }, '指定された移動元フォルダを使用')
    } else {
      // フォールバック: "Meet Recordings" フォルダを自動検索
      const folderRes = await drive.files.list({
        q: `name = 'Meet Recordings' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: 'files(id, name)',
        spaces: 'drive',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      })

      const meetFolder = folderRes.data.files?.[0]
      if (!meetFolder?.id) {
        logCtx.info('Meet Recordings フォルダが見つかりません')
        return []
      }
      sourceFolderId = meetFolder.id
      logCtx.info({ sourceFolderId }, 'Meet Recordings フォルダを自動検出')
    }

    // フォルダ内のファイルを取得（共有ドライブ両対応）
    const filesRes = await drive.files.list({
      q: `'${sourceFolderId}' in parents and trashed = false`,
      fields: 'files(id, name, mimeType, createdTime, parents)',
      orderBy: 'createdTime desc',
      pageSize: 100,
      spaces: 'drive',
      includeItemsFromAllDrives: true,
      supportsAllDrives: true,
    })

    const files = filesRes.data.files as DriveFile[] ?? []
    logCtx.info({ count: files.length, sourceFolderId }, '移動元フォルダ ファイル取得完了')
    return files
  } catch (err) {
    logCtx.error({ err }, '移動元フォルダ ファイル取得失敗')
    throw err
  }
}

/**
 * 指定フォルダ内の年月サブフォルダを取得または作成
 * フォルダ名例: "2026-6"
 */
export async function getOrCreateYearMonthFolder(
  userId: string,
  parentFolderId: string,
  year: number,
  month: number
): Promise<string> {
  const { client } = await getAuthenticatedClient(userId)
  const drive = google.drive({ version: 'v3', auth: client })
  const folderName = `${year}-${month}`

  // 既存フォルダを検索（共有ドライブ両対応）
  const res = await drive.files.list({
    q: `name = '${folderName}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  })

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!
  }

  // 存在しない場合は作成
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })

  log.info({ userId, folderName, parentFolderId }, '年月フォルダ作成')
  return created.data.id!
}

/**
 * 指定フォルダ内の学籍番号サブフォルダを取得または作成
 */
export async function getOrCreateStudentFolder(
  userId: string,
  parentFolderId: string,
  studentId: string
): Promise<string> {
  const { client } = await getAuthenticatedClient(userId)
  const drive = google.drive({ version: 'v3', auth: client })

  // 既存フォルダを検索（共有ドライブ両対応）
  const res = await drive.files.list({
    q: `name = '${studentId}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  })

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!
  }

  // 存在しない場合は作成
  const created = await drive.files.create({
    requestBody: {
      name: studentId,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId],
    },
    fields: 'id',
    supportsAllDrives: true,
  })

  log.info({ userId, studentId, parentFolderId }, '学籍番号フォルダ作成')
  return created.data.id!
}

/**
 * ファイルを指定フォルダに移動（親フォルダを変更）
 */
export async function moveFile(
  userId: string,
  fileId: string,
  currentParentId: string,
  newParentId: string
): Promise<void> {
  const { client } = await getAuthenticatedClient(userId)
  const drive = google.drive({ version: 'v3', auth: client })

  await drive.files.update({
    fileId,
    addParents: newParentId,
    removeParents: currentParentId,
    fields: 'id, parents',
    supportsAllDrives: true,
  })
}

/**
 * ファイル名から日付を抽出
 * "WannaVレッスン予約 (石山光司) - 2026/06/29 18:58 JST～Recording"
 * → { year: 2026, month: 6 }
 */
export function extractDateFromFileName(fileName: string): { year: number; month: number } | null {
  const match = fileName.match(/(\d{4})\/(\d{2})\/(\d{2})/)
  if (!match) return null
  return {
    year: parseInt(match[1]),
    month: parseInt(match[2]),
  }
}

/**
 * ファイルが録画か文字起こしかを判定
 * 録画判定: 末尾が「Recording」かつファイル名に「レッスン」を含む
 * 文字起こし判定: 末尾が「Gemini によるメモ」
 */
export function classifyFile(fileName: string): 'recording' | 'transcription' | 'unknown' {
  if (RECORDING_PATTERN.test(fileName) && fileName.includes(RECORDING_LESSON_KEYWORD)) return 'recording'
  if (TRANSCRIPTION_PATTERN.test(fileName)) return 'transcription'
  return 'unknown'
}

/**
 * カレンダーの説明欄から学籍番号を抽出
 * 例: "学籍番号\nOLTS240488-AR"
 */
export function extractStudentIdFromDescription(description: string | null): string | null {
  if (!description) return null
  // 「学籍番号」の後に続く英数字とハイフンの文字列を取得
  const match = description.match(/学籍番号[\s\S]*?\n([A-Z0-9]+-[A-Z0-9]+)/)
  if (match) return match[1].trim()
  // 別パターン: 学籍番号の直後に記載
  const match2 = description.match(/学籍番号[：:\s]*([A-Z0-9]+-[A-Z0-9]+)/)
  if (match2) return match2[1].trim()
  return null
}
