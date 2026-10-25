import { NextRequest, NextResponse } from 'next/server'
import { createOAuthClient, GOOGLE_SCOPES } from '@/lib/google/oauth-client'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto/token-encrypt'
import { GoogleAccountStatus } from '@prisma/client'
import { createLogger } from '@/lib/logger'
import { google } from 'googleapis'
import { getAuthSession } from '@/lib/auth/permissions'
import { flowCookieOptions, verifyOAuthFlow } from '@/lib/google/oauth-flow'

const log = createLogger({ module: 'google-callback' })

/**
 * GET /api/google/callback
 * Google OAuth認証コールバック
 */
export async function GET(request: NextRequest) {
  const redirectResult = (path: string) => {
    const response = NextResponse.redirect(new URL(path, process.env.NEXTAUTH_URL!))
    response.cookies.set({ ...flowCookieOptions(), value: '', maxAge: 0 })
    response.headers.set('Cache-Control', 'no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')
  const session = await getAuthSession()
  if (!session?.user) return redirectResult('/login?error=invalid_callback')
  const flow = verifyOAuthFlow(request.cookies.get(flowCookieOptions().name)?.value, state, session.user.id)
  if (!flow) return redirectResult('/instructor?error=invalid_callback')

  
  if (error) {
    log.warn({ error }, 'OAuth認証エラー')
    return redirectResult('/instructor?error=google_auth_denied')
  }
  
  if (!code || !state) {
    return redirectResult('/instructor?error=invalid_callback')
  }
  
  const userId = session.user.id
  
  // ユーザー存在確認
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    log.error({ userId }, 'ユーザーが見つからない')
    return redirectResult('/login?error=user_not_found')
  }
  
  try {
    const client = createOAuthClient()
    
    // 認証コードをトークンに交換
    const { tokens } = await client.getToken({ code, codeVerifier: flow.verifier })
    
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('トークンの取得に失敗しました（refresh_tokenが含まれていません）')
    }
    
    // Googleアカウント情報を取得
    client.setCredentials(tokens)
    const oauth2 = google.oauth2({ version: 'v2', auth: client })
    const userInfo = await oauth2.userinfo.get()
    
    const googleEmail = userInfo.data.email!
    const googleAccountId = userInfo.data.id!
    
    // 既存アカウントの確認（別ユーザーが既に連携していないか）
    const existingAccount = await prisma.googleAccount.findUnique({
      where: { googleAccountId },
    })
    
    if (existingAccount && existingAccount.userId !== userId) {
      log.warn({ googleEmail, userId }, '別ユーザーが既にこのGoogleアカウントを連携中')
      return redirectResult('/instructor?error=google_account_already_linked')
    }
    
    // スコープ確認
    const grantedScopes = tokens.scope?.split(' ') || []
    const requiredScopes = GOOGLE_SCOPES.filter(s => !s.includes('userinfo'))
    const missingScopes = requiredScopes.filter(s => !grantedScopes.includes(s))
    
    if (missingScopes.length > 0) {
      log.warn({ missingScopes, googleEmail }, '必要なスコープが付与されていない')
      return redirectResult(`/instructor?error=insufficient_scopes&missing=${encodeURIComponent(missingScopes.join(','))}`)
    }
    
    // トークンを暗号化してDB保存
    await prisma.googleAccount.upsert({
      where: { userId },
      create: {
        userId,
        googleEmail,
        googleAccountId,
        accessTokenEnc: encrypt(tokens.access_token),
        refreshTokenEnc: encrypt(tokens.refresh_token),
        tokenExpiresAt: new Date(tokens.expiry_date!),
        scopes: grantedScopes,
        status: GoogleAccountStatus.ACTIVE,
      },
      update: {
        googleEmail,
        googleAccountId,
        accessTokenEnc: encrypt(tokens.access_token),
        refreshTokenEnc: encrypt(tokens.refresh_token),
        tokenExpiresAt: new Date(tokens.expiry_date!),
        scopes: grantedScopes,
        status: GoogleAccountStatus.ACTIVE,
        lastErrorMessage: null,
        lastErrorAt: null,
        lastRefreshedAt: new Date(),
      },
    })
    
    // 監査ログ
    await prisma.auditLog.create({
      data: {
        userId,
        action: 'google.connect',
        detail: { googleEmail, scopes: grantedScopes },
      },
    })
    
    log.info({ userId, googleEmail }, 'Google連携成功')
    
    return redirectResult('/instructor?success=google_connected')
  } catch (err) {
    const errorMessage = 'Google連携に失敗しました。もう一度連携してください。'
    log.error({ userId, err }, 'Google OAuth コールバック処理失敗')
    
    return redirectResult(`/instructor?error=connection_failed&message=${encodeURIComponent(errorMessage)}`)
  }
}
