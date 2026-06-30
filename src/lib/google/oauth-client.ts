import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/crypto/token-encrypt'
import { GoogleAccountStatus } from '@prisma/client'
import { createLogger } from '@/lib/logger'

const log = createLogger({ module: 'google-client' })

// 必要なスコープ一覧
// - calendar.readonly: イベント一覧取得
// - meetings.space.settings: Meet設定更新（IMPORTANT: Google Workspace必須）
// - drive: Google Driveファイル操作（録画・文字起こしの自動移動）
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/meetings.space.settings',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive',
]

/**
 * Google OAuth2クライアントを生成（個別ユーザー用）
 */
export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/google/callback`
  )
}

/**
 * 認証URLを生成
 */
export function getAuthUrl(userId: string): string {
  const client = createOAuthClient()
  
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: GOOGLE_SCOPES,
    prompt: 'consent', // refresh_tokenを確実に取得するために毎回consent
    state: userId,     // コールバック時にユーザーIDを識別
    include_granted_scopes: true,
  })
}

/**
 * DBからGoogleアカウント情報を取得し、有効なOAuth2クライアントを返す
 * トークンが期限切れの場合は自動リフレッシュを試みる
 */
export async function getAuthenticatedClient(userId: string) {
  const googleAccount = await prisma.googleAccount.findUnique({
    where: { userId },
  })
  
  if (!googleAccount) {
    throw new Error('Google連携が設定されていません')
  }
  
  if (googleAccount.status === GoogleAccountStatus.REVOKED) {
    throw new Error('Google連携が取り消されています。再連携が必要です。')
  }
  
  const client = createOAuthClient()
  
  // トークンを復号
  let accessToken: string
  let refreshToken: string
  
  try {
    accessToken = decrypt(googleAccount.accessTokenEnc)
    refreshToken = decrypt(googleAccount.refreshTokenEnc)
  } catch (err) {
    log.error({ userId, err }, 'トークン復号失敗')
    await prisma.googleAccount.update({
      where: { userId },
      data: {
        status: GoogleAccountStatus.ERROR,
        lastErrorMessage: 'トークン復号に失敗しました',
        lastErrorAt: new Date(),
      },
    })
    throw new Error('トークンの復号に失敗しました')
  }
  
  client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: googleAccount.tokenExpiresAt.getTime(),
  })
  
  // トークンリフレッシュイベントを設定
  client.on('tokens', async (tokens) => {
    log.info({ userId }, 'トークン自動更新')
    
    const updateData: Record<string, unknown> = {
      lastRefreshedAt: new Date(),
      status: GoogleAccountStatus.ACTIVE,
      lastErrorMessage: null,
      lastErrorAt: null,
    }
    
    if (tokens.access_token) {
      updateData.accessTokenEnc = encrypt(tokens.access_token)
    }
    if (tokens.expiry_date) {
      updateData.tokenExpiresAt = new Date(tokens.expiry_date)
    }
    if (tokens.refresh_token) {
      updateData.refreshTokenEnc = encrypt(tokens.refresh_token)
    }
    
    await prisma.googleAccount.update({
      where: { userId },
      data: updateData,
    }).catch((err) => log.error({ userId, err }, 'トークン更新DB保存失敗'))
  })
  
  return { client, googleAccount }
}

/**
 * トークンを手動リフレッシュ
 */
export async function refreshToken(userId: string): Promise<boolean> {
  const log2 = createLogger({ module: 'google-client', userId })
  
  try {
    const googleAccount = await prisma.googleAccount.findUnique({
      where: { userId },
    })
    
    if (!googleAccount) {
      log2.warn('GoogleAccountが見つからない')
      return false
    }
    
    const client = createOAuthClient()
    const refreshTokenVal = decrypt(googleAccount.refreshTokenEnc)
    client.setCredentials({ refresh_token: refreshTokenVal })
    
    const { credentials } = await client.refreshAccessToken()
    
    await prisma.googleAccount.update({
      where: { userId },
      data: {
        accessTokenEnc: encrypt(credentials.access_token!),
        tokenExpiresAt: new Date(credentials.expiry_date!),
        ...(credentials.refresh_token && {
          refreshTokenEnc: encrypt(credentials.refresh_token),
        }),
        status: GoogleAccountStatus.ACTIVE,
        lastRefreshedAt: new Date(),
        lastErrorMessage: null,
        lastErrorAt: null,
      },
    })
    
    log2.info('トークンリフレッシュ成功')
    return true
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log2.error({ err }, 'トークンリフレッシュ失敗')
    
    await prisma.googleAccount.update({
      where: { userId },
      data: {
        status: GoogleAccountStatus.TOKEN_EXPIRED,
        lastErrorMessage: errorMessage,
        lastErrorAt: new Date(),
      },
    }).catch(() => {})
    
    return false
  }
}
