import { NextRequest, NextResponse } from 'next/server'
import { createOAuthClient, GOOGLE_SCOPES } from '@/lib/google/oauth-client'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/crypto/token-encrypt'
import { GoogleAccountStatus } from '@prisma/client'
import { createLogger } from '@/lib/logger'
import { google } from 'googleapis'

const log = createLogger({ module: 'google-callback' })

/**
 * GET /api/google/callback
 * Google OAuth認証コールバック
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')  // userId
  const error = searchParams.get('error')
  
  if (error) {
    log.warn({ error }, 'OAuth認証エラー')
    return NextResponse.redirect(
      new URL('/instructor?error=google_auth_denied', process.env.NEXTAUTH_URL!)
    )
  }
  
  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/instructor?error=invalid_callback', process.env.NEXTAUTH_URL!)
    )
  }
  
  const userId = state
  
  // ユーザー存在確認
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) {
    log.error({ userId }, 'ユーザーが見つからない')
    return NextResponse.redirect(
      new URL('/login?error=user_not_found', process.env.NEXTAUTH_URL!)
    )
  }
  
  try {
    const client = createOAuthClient()
    
    // 認証コードをトークンに交換
    const { tokens } = await client.getToken(code)
    
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
      return NextResponse.redirect(
        new URL('/instructor?error=google_account_already_linked', process.env.NEXTAUTH_URL!)
      )
    }
    
    // スコープ確認
    const grantedScopes = tokens.scope?.split(' ') || []
    const requiredScopes = GOOGLE_SCOPES.filter(s => !s.includes('userinfo'))
    const missingScopes = requiredScopes.filter(s => !grantedScopes.includes(s))
    
    if (missingScopes.length > 0) {
      log.warn({ missingScopes, googleEmail }, '必要なスコープが付与されていない')
      return NextResponse.redirect(
        new URL(`/instructor?error=insufficient_scopes&missing=${encodeURIComponent(missingScopes.join(','))}`, process.env.NEXTAUTH_URL!)
      )
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
    
    return NextResponse.redirect(
      new URL('/instructor?success=google_connected', process.env.NEXTAUTH_URL!)
    )
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.error({ userId, err }, 'Google OAuth コールバック処理失敗')
    
    return NextResponse.redirect(
      new URL(`/instructor?error=connection_failed&message=${encodeURIComponent(errorMessage)}`, process.env.NEXTAUTH_URL!)
    )
  }
}
