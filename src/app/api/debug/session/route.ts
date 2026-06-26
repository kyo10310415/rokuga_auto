import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth.config'
import { getToken } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/debug/session
 * ⚠️ 確認後に必ず削除すること
 */
export async function GET(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET

  // secureCookie: true（HTTPS環境用）
  const tokenSecure = await getToken({
    req,
    secret,
    secureCookie: true,
  }).catch((e) => ({ error: String(e) }))

  // secureCookie: false（HTTP環境用）
  const tokenInsecure = await getToken({
    req,
    secret,
    secureCookie: false,
  }).catch((e) => ({ error: String(e) }))

  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { mustChangePassword: true },
  })

  const cookieNames = req.cookies.getAll().map((c) => c.name)

  return NextResponse.json({
    session_mustChangePassword: session.user.mustChangePassword,
    db_mustChangePassword: dbUser?.mustChangePassword,
    getToken_secureCookie_true:  tokenSecure  ? { mustChangePassword: (tokenSecure as Record<string,unknown>).mustChangePassword } : null,
    getToken_secureCookie_false: tokenInsecure ? { mustChangePassword: (tokenInsecure as Record<string,unknown>).mustChangePassword } : null,
    env: {
      AUTH_SECRET_exists: !!process.env.AUTH_SECRET,
      NEXTAUTH_SECRET_exists: !!process.env.NEXTAUTH_SECRET,
    },
    cookie_names: cookieNames,
  })
}
