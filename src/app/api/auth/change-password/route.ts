import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/auth.config'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, '現在のパスワードを入力してください'),
  newPassword: z
    .string()
    .min(8, '新しいパスワードは8文字以上で入力してください')
    .max(100),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'パスワードが一致しません',
  path: ['confirmPassword'],
})

/**
 * POST /api/auth/change-password
 * パスワード変更（初回ログイン強制変更 & 任意変更の両方で使用）
 */
export async function POST(request: NextRequest) {
  const session = await auth()

  if (!session?.user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = changePasswordSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    )
  }

  const { currentPassword, newPassword } = parsed.data

  // credentials アカウントを取得
  const account = await prisma.account.findFirst({
    where: {
      provider: 'credentials',
      userId: session.user.id,
    },
  })

  if (!account || !account.access_token) {
    return NextResponse.json(
      { error: 'パスワード認証アカウントが見つかりません' },
      { status: 404 }
    )
  }

  // 現在のパスワード確認
  const isValid = await bcrypt.compare(currentPassword, account.access_token)
  if (!isValid) {
    return NextResponse.json(
      { error: '現在のパスワードが正しくありません' },
      { status: 400 }
    )
  }

  // 新パスワードが現在と同じでないか確認
  const isSame = await bcrypt.compare(newPassword, account.access_token)
  if (isSame) {
    return NextResponse.json(
      { error: '新しいパスワードは現在のパスワードと異なるものを設定してください' },
      { status: 400 }
    )
  }

  const hashedNewPassword = await bcrypt.hash(newPassword, 12)

  // トランザクションでパスワード更新 + mustChangePassword を false に
  await prisma.$transaction([
    prisma.account.update({
      where: { id: account.id },
      data: { access_token: hashedNewPassword },
    }),
    prisma.user.update({
      where: { id: session.user.id },
      data: { mustChangePassword: false },
    }),
  ])

  // 監査ログ
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'auth.change_password',
      detail: { mustChangePassword: session.user.mustChangePassword },
    },
  }).catch((err) => console.error('監査ログ記録失敗:', err))

  return NextResponse.json({ success: true })
}
