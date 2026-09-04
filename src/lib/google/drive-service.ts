import { google } from 'googleapis'
import { getAuthenticatedClient } from '@/lib/google/oauth-client'
import { createLogger } from '@/lib/logger'

const log = createLogger({ module: 'drive-service' })

// ファイル名パターン
// 録画: "WannaVレッスン予約 (石山光司) - 2026/06/29 18:58 JST～Recording"
// 文字起こし: "WannaVレッスン予約 (石山光司) - 2026/06/29 18:58 JST - Gemini によるメモ"
const RECORDING_PATTERN = /Recording$/
const TRANSCRIPTION_PATTERN = /Gemini によるメモ$/
// 移動対象フィルタ: ファイル名にいずれかのキーワードを含むもののみ対象
// 録画・文字起こし両方に適用
const MOVE_TARGET_KEYWORDS = ['レッスン', 'Proプラン', 'PROプラン']
const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder'
const DEFAULT_SOURCE_FOLDER_NAME = 'Google Meet'

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  createdTime: string
  parents?: string[]
}

export interface DriveFolder {
  id: string
  name: string
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
 * 移動元ルート直下のサブフォルダを取得
 * @param userId          対象ユーザーID
 * @param sourceFolderUrl 移動元ルートフォルダURL（指定時はそのフォルダを使用）
 *                        未指定時は "Google Meet" フォルダを自動検索
 */
export async function getMeetSourceFolders(
  userId: string,
  sourceFolderUrl?: string | null
): Promise<DriveFolder[]> {
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
      // 同名フォルダが複数ある場合に誤ったルートを選ばないよう、最大2件まで取得
      const sourceFolders: DriveFolder[] = []
      let pageToken: string | undefined

      do {
        const folderRes = await drive.files.list({
          q: `name = '${DEFAULT_SOURCE_FOLDER_NAME}' and mimeType = '${DRIVE_FOLDER_MIME_TYPE}' and trashed = false`,
          fields: 'nextPageToken, files(id, name)',
          pageSize: 2,
          pageToken,
          spaces: 'drive',
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
        })

        for (const folder of folderRes.data.files ?? []) {
          if (folder.id && folder.name) {
            sourceFolders.push({ id: folder.id, name: folder.name })
          }
        }
        pageToken = folderRes.data.nextPageToken ?? undefined
      } while (pageToken && sourceFolders.length < 2)

      if (sourceFolders.length === 0) {
        logCtx.info(`${DEFAULT_SOURCE_FOLDER_NAME} フォルダが見つかりません`)
        return []
      }

      if (sourceFolders.length >= 2) {
        logCtx.warn(
          { count: sourceFolders.length },
          `${DEFAULT_SOURCE_FOLDER_NAME} フォルダが複数見つかったため処理をスキップ`
        )
        return []
      }

      sourceFolderId = sourceFolders[0].id
      logCtx.info({ sourceFolderId }, `${DEFAULT_SOURCE_FOLDER_NAME} フォルダを自動検出`)
    }

    // 移動元ルート直下のサブフォルダだけを取得（共有ドライブ両対応）
    const folders: DriveFolder[] = []
    let pageToken: string | undefined

    do {
      const foldersRes = await drive.files.list({
        q: `'${sourceFolderId}' in parents and mimeType = '${DRIVE_FOLDER_MIME_TYPE}' and trashed = false`,
        fields: 'nextPageToken, files(id, name)',
        orderBy: 'createdTime desc',
        pageSize: 100,
        pageToken,
        spaces: 'drive',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      })

      for (const folder of foldersRes.data.files ?? []) {
        if (folder.id && folder.name) {
          folders.push({ id: folder.id, name: folder.name })
        }
      }
      pageToken = foldersRes.data.nextPageToken ?? undefined
    } while (pageToken)

    logCtx.info({ count: folders.length, sourceFolderId }, '移動元サブフォルダ取得完了')
    return folders
  } catch (err) {
    logCtx.error({ err }, '移動元サブフォルダ取得失敗')
    throw err
  }
}

/**
 * 指定フォルダ直下のファイルを取得（子フォルダは対象外・再帰探索なし）
 */
export async function getFilesInFolder(
  userId: string,
  folderId: string
): Promise<DriveFile[]> {
  const logCtx = createLogger({ module: 'drive-service', userId, folderId })

  try {
    const { client } = await getAuthenticatedClient(userId)
    const drive = google.drive({ version: 'v3', auth: client })
    const files: DriveFile[] = []
    let pageToken: string | undefined

    do {
      const filesRes = await drive.files.list({
        q: `'${folderId}' in parents and mimeType != '${DRIVE_FOLDER_MIME_TYPE}' and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, createdTime, parents)',
        orderBy: 'createdTime desc',
        pageSize: 100,
        pageToken,
        spaces: 'drive',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
      })

      for (const file of filesRes.data.files ?? []) {
        if (file.id && file.name && file.mimeType && file.createdTime) {
          files.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            createdTime: file.createdTime,
            parents: file.parents ?? undefined,
          })
        }
      }
      pageToken = filesRes.data.nextPageToken ?? undefined
    } while (pageToken)

    logCtx.info({ count: files.length }, 'サブフォルダ内ファイル取得完了')
    return files
  } catch (err) {
    logCtx.error({ err }, 'サブフォルダ内ファイル取得失敗')
    throw err
  }
}

/**
 * 指定フォルダの中身を再取得し、ファイル・フォルダともに完全に空なら削除
 */
export async function deleteFolderIfEmpty(
  userId: string,
  folderId: string
): Promise<boolean> {
  const logCtx = createLogger({ module: 'drive-service', userId, folderId })
  const { client } = await getAuthenticatedClient(userId)
  const drive = google.drive({ version: 'v3', auth: client })

  const childrenRes = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id)',
    pageSize: 1,
    spaces: 'drive',
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
  })

  if ((childrenRes.data.files?.length ?? 0) > 0) {
    logCtx.info('サブフォルダに子要素が残っているため削除をスキップ')
    return false
  }

  await drive.files.delete({
    fileId: folderId,
    supportsAllDrives: true,
  })
  logCtx.info('空のサブフォルダを削除')
  return true
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
 * 録画判定: 末尾が「Recording」かつ MOVE_TARGET_KEYWORDS のいずれかを含む
 * 文字起こし判定: 末尾が「Gemini によるメモ」かつ MOVE_TARGET_KEYWORDS のいずれかを含む
 * 対象キーワード: レッスン / Proプラン / PROプラン
 */
export function classifyFile(fileName: string): 'recording' | 'transcription' | 'unknown' {
  const isTarget = MOVE_TARGET_KEYWORDS.some((kw) => fileName.includes(kw))
  if (RECORDING_PATTERN.test(fileName) && isTarget) return 'recording'
  if (TRANSCRIPTION_PATTERN.test(fileName) && isTarget) return 'transcription'
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
