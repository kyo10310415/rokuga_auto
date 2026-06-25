import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { getAuthUrl } from '@/lib/google/oauth-client'

/**
 * GET /api/google/connect
 * Google OAuth連携開始（講師が自分のGoogleアカウントを連携する）
 */
export async function GET() {
  const session = await getAuthSession()
  
  if (!session?.user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  
  const authUrl = getAuthUrl(session.user.id)
  
  return NextResponse.redirect(authUrl)
}
