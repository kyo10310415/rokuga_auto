import { getAuthenticatedClient } from './oauth-client'
import { createLogger } from '@/lib/logger'

const log = createLogger({ module: 'meet-service' })

// ============================================================
// Google Meet API v2 の正しい型定義
// 公式: https://developers.google.com/workspace/meet/api/reference/rest/v2/spaces
//
// 構造:
//   Space.config (SpaceConfig)
//     └─ artifactConfig (ArtifactConfig)
//          ├─ recordingConfig.autoRecordingGeneration: "ON" | "OFF"
//          ├─ transcriptionConfig.autoTranscriptionGeneration: "ON" | "OFF"
//          └─ smartNotesConfig.autoSmartNotesGeneration: "ON" | "OFF"
// ============================================================

export interface MeetSpaceInfo {
  name: string        // "spaces/{id}" 形式
  meetingUri: string
  meetingCode: string
  config?: {
    artifactConfig?: {
      recordingConfig?: {
        autoRecordingGeneration?: string    // "ON" | "OFF" | "AUTO_GENERATION_TYPE_UNSPECIFIED"
      }
      transcriptionConfig?: {
        autoTranscriptionGeneration?: string // "ON" | "OFF" | "AUTO_GENERATION_TYPE_UNSPECIFIED"
      }
      smartNotesConfig?: {
        autoSmartNotesGeneration?: string   // "ON" | "OFF" | "AUTO_GENERATION_TYPE_UNSPECIFIED"
      }
    }
  }
}

export interface ArtifactSettings {
  recordingEnabled: boolean
  transcriptionEnabled: boolean
  smartNotesEnabled?: boolean
}

/**
 * Google Meet SpaceIDをMeetリンクから抽出
 * 例: https://meet.google.com/abc-defg-hij → "abc-defg-hij"
 */
export function extractMeetCode(meetLink: string): string | null {
  const match = meetLink.match(/meet\.google\.com\/([a-z0-9-]+)/i)
  return match ? match[1] : null
}

/**
 * Meet Space情報を取得
 * API: GET https://meet.googleapis.com/v2/spaces/{name}
 */
export async function getMeetSpace(
  userId: string,
  spaceName: string
): Promise<MeetSpaceInfo | null> {
  const logCtx = createLogger({ module: 'meet-service', userId, spaceName })
  
  try {
    const { client } = await getAuthenticatedClient(userId)
    
    const response = await client.request<MeetSpaceInfo>({
      url: `https://meet.googleapis.com/v2/${spaceName}`,
      method: 'GET',
    })
    
    logCtx.info({ spaceInfo: response.data }, 'Meet Space情報取得成功')
    return response.data
  } catch (err) {
    logCtx.error({ err }, 'Meet Space情報取得失敗')
    return null
  }
}

/**
 * MeetリンクからSpace情報を取得
 */
export async function getMeetSpaceByLink(
  userId: string,
  meetLink: string
): Promise<{ spaceName: string; spaceInfo: MeetSpaceInfo } | null> {
  const meetCode = extractMeetCode(meetLink)
  if (!meetCode) return null
  
  // meetingCodeからspaceを検索
  // API: GET https://meet.googleapis.com/v2/spaces/{meetingCode}
  const spaceName = `spaces/${meetCode}`
  const spaceInfo = await getMeetSpace(userId, spaceName)
  
  if (!spaceInfo) return null
  
  return { spaceName: spaceInfo.name || spaceName, spaceInfo }
}

/**
 * SpaceInfo から ArtifactSettings を読み取るヘルパー
 */
function readArtifactSettings(spaceInfo: MeetSpaceInfo): ArtifactSettings {
  const artifact = spaceInfo.config?.artifactConfig
  return {
    recordingEnabled:     artifact?.recordingConfig?.autoRecordingGeneration === 'ON',
    transcriptionEnabled: artifact?.transcriptionConfig?.autoTranscriptionGeneration === 'ON',
    smartNotesEnabled:    artifact?.smartNotesConfig?.autoSmartNotesGeneration === 'ON',
  }
}

/**
 * Meet Spaceのartifact設定を更新
 * 録画・文字起こしをONに補正する
 *
 * 正しいAPI構造 (v2):
 *   config.artifactConfig.recordingConfig.autoRecordingGeneration = "ON"
 *   config.artifactConfig.transcriptionConfig.autoTranscriptionGeneration = "ON"
 *
 * updateMask は使用しない:
 *   公式仕様「updateMask未指定の場合、リクエストボディに値があるフィールドが全て更新される」
 *   updateMask の正確なパス仕様が不明確なため、省略して全フィールド更新モードを使用する
 */
export async function updateArtifactSettings(
  userId: string,
  spaceName: string,
  currentSpace: MeetSpaceInfo
): Promise<{ success: boolean; before: ArtifactSettings; after: ArtifactSettings; error?: string }> {
  const logCtx = createLogger({ module: 'meet-service', userId, spaceName })
  
  const before = readArtifactSettings(currentSpace)
  logCtx.info({ before }, '補正前の設定')
  
  // 既にONの場合はスキップ
  if (before.recordingEnabled && before.transcriptionEnabled) {
    logCtx.info('既に録画・文字起こしがONです。補正をスキップします。')
    return { success: true, before, after: before }
  }
  
  try {
    const { client } = await getAuthenticatedClient(userId)
    
    const response = await client.request<MeetSpaceInfo>({
      url: `https://meet.googleapis.com/v2/${spaceName}`,
      method: 'PATCH',
      // updateMask は省略 → リクエストボディに値があるフィールドが全て更新される
      data: {
        config: {
          artifactConfig: {
            recordingConfig: {
              autoRecordingGeneration: 'ON',
            },
            transcriptionConfig: {
              autoTranscriptionGeneration: 'ON',
            },
            // smartNotesConfig は現在の値を引き継ぐ（上書きしない）
            ...(currentSpace.config?.artifactConfig?.smartNotesConfig
              ? { smartNotesConfig: currentSpace.config.artifactConfig.smartNotesConfig }
              : {}),
          },
        },
      },
    })
    
    const after = readArtifactSettings(response.data)
    logCtx.info({ before, after }, '補正完了')
    
    return { success: true, before, after }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logCtx.error({ err }, 'artifact設定更新失敗')
    
    return {
      success: false,
      before,
      after: before,
      error: errorMessage,
    }
  }
}

/**
 * 補正後の設定を確認（再確認用）
 */
export async function verifyArtifactSettings(
  userId: string,
  spaceName: string
): Promise<ArtifactSettings | null> {
  const spaceInfo = await getMeetSpace(userId, spaceName)
  if (!spaceInfo) return null
  return readArtifactSettings(spaceInfo)
}
