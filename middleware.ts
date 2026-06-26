import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

/**
 * ミドルウェア:
 * 1. 未認証ユーザーを /login にリダイレクト
 * 2. mustChangePassword=true のユーザーを /change-password にリダイレクト
 *
 * auth() wrapper 方式だと Auth.js v5 beta で session callback が経由されず
 * mustChangePassword が req.auth.user に入らない問題があるため、
 * getToken() で JWT を直接デコードする方式に変更。
 * JWT callback で token.mustChangePassword をセットしているので確実に取得できる。
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 認証不要パスは素通り
  const publicPaths = ['/login', '/api/auth']
  const isPublic = publicPaths.some((p) => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  // JWT を直接デコード（session callback を経由しない）
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  })

  // 未認証（トークンなし）→ ログインへ
  if (!token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  const mustChange = token.mustChangePassword === true
  const isChangePwPage = pathname.startsWith('/change-password')

  // mustChangePassword=true → /change-password 以外はリダイレクト
  if (mustChange && !isChangePwPage) {
    return NextResponse.redirect(new URL('/change-password', request.url))
  }

  // 変更完了済みなのに /change-password にいる → ダッシュボードへ
  if (!mustChange && isChangePwPage) {
    const dest = token.role === 'ADMIN' ? '/admin' : '/instructor'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
