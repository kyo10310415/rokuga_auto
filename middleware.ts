import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

/**
 * ミドルウェア:
 * 1. 未認証ユーザーを /login にリダイレクト
 * 2. mustChangePassword=true のユーザーを /change-password にリダイレクト
 *
 * getToken() で JWT を直接デコード。
 * Render(HTTPS) 環境では cookie 名が __Secure-authjs.session-token になるため
 * cookieName を明示指定する。
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 認証不要パスは素通り
  const publicPaths = ['/login', '/api/auth']
  const isPublic = publicPaths.some((p) => pathname.startsWith(p))
  if (isPublic) return NextResponse.next()

  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET

  // HTTPS環境(本番)では __Secure- プレフィックス付きのcookie名になる
  // secureCookie: true を指定することで自動的に対応
  const token = await getToken({
    req: request,
    secret,
    secureCookie: true,
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
