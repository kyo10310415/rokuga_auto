import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth.config'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/debug/session
 * セッション・JWT・DB の状態を確認するデバッグエンドポイント
 * ⚠️ 確認後に必ず削除すること
 */
export async function GET() {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: '未認証' }, { status: 401 })
  }

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

  return NextResponse.json({
    session_user: session.user,
    db_user: dbUser,
    match: {
      mustChangePassword_session: session.user.mustChangePassword,
      mustChangePassword_db: dbUser?.mustChangePassword,
      same: session.user.mustChangePassword === dbUser?.mustChangePassword,
    },
  })
}
