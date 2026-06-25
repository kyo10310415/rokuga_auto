import { getAuthenticatedClient } from './oauth-client'
import { createLogger } from '@/lib/logger'

const log = createLogger({ module: 'meet-service' })

export interface MeetSpaceInfo {
  name: string  // "spaces/{id}" 形式
  meetingUri: string
  meetingCode: string
  config?: {
    recordingConfig?: {
      autoRecording?: string  // "RECORDING_ENABLED" | "RECORDING_DISABLED"
    }
    transcriptionConfig?: {
      autoTranscription?: string  // "TRANSCRIPTION_ENABLED" | "TRANSCRIPTION_DISABLED"
    }
    smartNotesConfig?: {
      autoSmartNotes?: string
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
    
    // Google Meet API v2を直接呼び出し
    // googleapis SDKにはMeet APIが含まれているが、バージョン確認が必要
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
 * Meet Spaceのartifact設定を更新
 * 録画・文字起こしをONに補正する
 * 
 * 重要: smartNotesConfigは変更しない（既存設定を維持）
 */
export async function updateArtifactSettings(
  userId: string,
  spaceName: string,
  currentSpace: MeetSpaceInfo
): Promise<{ success: boolean; before: ArtifactSettings; after: ArtifactSettings; error?: string }> {
  const logCtx = createLogger({ module: 'meet-service', userId, spaceName })
  
  const before: ArtifactSettings = {
    recordingEnabled: currentSpace.config?.recordingConfig?.autoRecording === 'RECORDING_ENABLED',
    transcriptionEnabled: currentSpace.config?.transcriptionConfig?.autoTranscription === 'TRANSCRIPTION_ENABLED',
    smartNotesEnabled: currentSpace.config?.smartNotesConfig?.autoSmartNotes === 'SMART_NOTES_ENABLED',
  }
  
  logCtx.info({ before }, '補正前の設定')
  
  // 既にONの場合はスキップ
  if (before.recordingEnabled && before.transcriptionEnabled) {
    logCtx.info('既に録画・文字起こしがONです。補正をスキップします。')
    return {
      success: true,
      before,
      after: before,
    }
  }
  
  try {
    const { client } = await getAuthenticatedClient(userId)
    
    // PATCHリクエストで設定を更新
    // smartNotesConfigは含めない（変更しない）
    const updateMask = 'config.recordingConfig,config.transcriptionConfig'
    
    const response = await client.request<MeetSpaceInfo>({
      url: `https://meet.googleapis.com/v2/${spaceName}`,
      method: 'PATCH',
      params: { updateMask },
      data: {
        config: {
          recordingConfig: {
            autoRecording: 'RECORDING_ENABLED',
          },
          transcriptionConfig: {
            autoTranscription: 'TRANSCRIPTION_ENABLED',
          },
        },
      },
    })
    
    const after: ArtifactSettings = {
      recordingEnabled: response.data.config?.recordingConfig?.autoRecording === 'RECORDING_ENABLED',
      transcriptionEnabled: response.data.config?.transcriptionConfig?.autoTranscription === 'TRANSCRIPTION_ENABLED',
      smartNotesEnabled: response.data.config?.smartNotesConfig?.autoSmartNotes === 'SMART_NOTES_ENABLED',
    }
    
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
  
  return {
    recordingEnabled: spaceInfo.config?.recordingConfig?.autoRecording === 'RECORDING_ENABLED',
    transcriptionEnabled: spaceInfo.config?.transcriptionConfig?.autoTranscription === 'TRANSCRIPTION_ENABLED',
    smartNotesEnabled: spaceInfo.config?.smartNotesConfig?.autoSmartNotes === 'SMART_NOTES_ENABLED',
  }
}
