import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth.config'
import { getToken } from 'next-auth/jwt'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/debug/session
 * セッション・JWT・DB の状態を確認するデバッグエンドポイント
 * ⚠️ 確認後に必ず削除すること
 */
export async function GET(req: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

  // getToken で JWT を直接デコード（middleware と同じ方法）
  const tokenWithSecret1 = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  }).catch((e) => ({ error: String(e) }))

  const tokenWithSecret2 = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  }).catch((e) => ({ error: String(e) }))

  // DBから直接取得
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      mustChangePassword: true,
    },
  })

  // クッキー名の確認
  const cookieNames = req.cookies.getAll().map((c) => c.name)

  return NextResponse.json({
    session_user: session.user,
    db_user: dbUser,
    // getToken の結果（AUTH_SECRET 使用）
    getToken_AUTH_SECRET: tokenWithSecret1,
    // getToken の結果（NEXTAUTH_SECRET 使用）
    getToken_NEXTAUTH_SECRET: tokenWithSecret2,
    // 環境変数の存在確認（値は表示しない）
    env: {
      AUTH_SECRET_exists: !!process.env.AUTH_SECRET,
      NEXTAUTH_SECRET_exists: !!process.env.NEXTAUTH_SECRET,
    },
    // Cookieの一覧（名前のみ）
    cookie_names: cookieNames,
  })
}
