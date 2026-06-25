import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/instructor/status
 * 自分のGoogle連携状態を取得
 */
export async function GET() {
  const session = await getAuthSession()
  
  if (!session?.user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  
  const googleAccount = await prisma.googleAccount.findUnique({
    where: { userId: session.user.id },
    select: {
      googleEmail: true,
      status: true,
      lastRefreshedAt: true,
      lastErrorMessage: true,
      lastErrorAt: true,
      scopes: true,
      createdAt: true,
    },
  })
  
  return NextResponse.json({
    connected: !!googleAccount,
    account: googleAccount,
  })
}
