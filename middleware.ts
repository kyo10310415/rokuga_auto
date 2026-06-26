import { auth } from '@/lib/auth/auth.config'
import { NextResponse } from 'next/server'

/**
 * ミドルウェア:
 * 1. 未認証ユーザーを /login にリダイレクト
 * 2. mustChangePassword=true のユーザーを /change-password にリダイレクト
 *
 * next-auth v5 beta: req.auth の型は Session | null
 * session callback で session.user に詰めた値がそのまま入る
 */
export default auth((req) => {
  const { pathname } = req.nextUrl

  // 認証不要パスは素通り
  const publicPaths = ['/login', '/api/auth']
  const isPublic = publicPaths.some((p) => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  // 未認証 → ログインへ
  if (!req.auth) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const mustChange = req.auth.user?.mustChangePassword === true
  const isChangePwPage = pathname.startsWith('/change-password')

  // mustChangePassword=true → /change-password 以外はリダイレクト
  if (mustChange && !isChangePwPage) {
    return NextResponse.redirect(new URL('/change-password', req.url))
  }

  // 変更完了済みなのに /change-password にいる → ダッシュボードへ
  if (!mustChange && isChangePwPage) {
    const role = req.auth.user?.role
    const dest = role === 'ADMIN' ? '/admin' : '/instructor'
    return NextResponse.redirect(new URL(dest, req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: [
    /*
     * 以下を除くすべてのパスにマッチ:
     *  - _next/static  (静的ファイル)
     *  - _next/image   (画像最適化)
     *  - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
