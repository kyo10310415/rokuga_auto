import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { getAuthUrl } from '@/lib/google/oauth-client'
import { flowCookieOptions, issueOAuthFlow } from '@/lib/google/oauth-flow'

/**
 * GET /api/google/connect
 * Google OAuth連携開始（講師が自分のGoogleアカウントを連携する）
 */
export async function GET() {
  const session = await getAuthSession()
  
  if (!session?.user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  
  const flow = issueOAuthFlow(session.user.id)
  const response = NextResponse.redirect(getAuthUrl(flow.state, flow.challenge))
  response.cookies.set({ ...flowCookieOptions(), value: flow.cookie })
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
