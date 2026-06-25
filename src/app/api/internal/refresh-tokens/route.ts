import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { refreshToken } from '@/lib/google/oauth-client'
import { GoogleAccountStatus } from '@prisma/client'
import { createLogger } from '@/lib/logger'
import { subMinutes } from 'date-fns'

const log = createLogger({ module: 'internal-refresh-tokens' })

/**
 * POST /api/internal/refresh-tokens
 * トークン一括リフレッシュジョブ（Cronから呼ばれる）
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const expectedKey = process.env.INTERNAL_API_KEY
  
  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    return NextResponse.json({ error: '認証失敗' }, { status: 401 })
  }
  
  log.info('トークンリフレッシュ開始')
  
  // 60分以内に期限切れになるトークンを対象
  const expiresThreshold = new Date(Date.now() + 60 * 60 * 1000)
  
  const accountsToRefresh = await prisma.googleAccount.findMany({
    where: {
      status: { in: [GoogleAccountStatus.ACTIVE, GoogleAccountStatus.TOKEN_EXPIRED] },
      tokenExpiresAt: { lte: expiresThreshold },
    },
    select: { userId: true, googleEmail: true },
  })
  
  log.info({ count: accountsToRefresh.length }, 'リフレッシュ対象アカウント数')
  
  let refreshed = 0
  let failed = 0
  
  for (const account of accountsToRefresh) {
    const success = await refreshToken(account.userId)
    if (success) {
      refreshed++
      log.info({ userId: account.userId, email: account.googleEmail }, 'リフレッシュ成功')
    } else {
      failed++
      log.warn({ userId: account.userId, email: account.googleEmail }, 'リフレッシュ失敗')
    }
  }
  
  return NextResponse.json({
    success: true,
    result: { total: accountsToRefresh.length, refreshed, failed },
    timestamp: new Date().toISOString(),
  })
}
