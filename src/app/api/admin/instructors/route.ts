import { NextRequest, NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

/**
 * GET /api/admin/instructors
 * 全講師の一覧とGoogle連携状態を取得
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession()
  
  if (!session?.user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  
  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }
  
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '50', 10)
  
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where: { role: UserRole.USER },
      include: {
        googleAccount: {
          select: {
            googleEmail: true,
            status: true,
            lastRefreshedAt: true,
            lastErrorMessage: true,
            lastErrorAt: true,
          },
        },
        _count: {
          select: {
            calendarEvents: true,
            correctionJobs: true,
          },
        },
      },
      orderBy: { name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where: { role: UserRole.USER } }),
  ])
  
  return NextResponse.json({
    instructors: users,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
}

/**
 * POST /api/admin/instructors
 * 講師アカウントを新規作成
 */
const createSchema = z.object({
  name: z.string().min(1, '名前は必須です').max(50),
  email: z.string().email('正しいメールアドレスを入力してください'),
  password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
  role: z.enum(['ADMIN', 'USER']).default('USER'),
})

export async function POST(request: NextRequest) {
  const session = await getAuthSession()

  if (!session?.user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0].message },
      { status: 400 }
    )
  }

  const { name, email, password, role } = parsed.data

  // メールアドレス重複チェック
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { error: 'このメールアドレスはすでに使用されています' },
      { status: 409 }
    )
  }

  const hashedPassword = await bcrypt.hash(password, 12)

  const user = await prisma.user.create({
    data: {
      name,
      email,
      role: role as UserRole,
      emailVerified: new Date(),
      accounts: {
        create: {
          type: 'credentials',
          provider: 'credentials',
          providerAccountId: email,
          access_token: hashedPassword,
        },
      },
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  })

  // 監査ログ
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'admin.create_instructor',
      targetType: 'User',
      targetId: user.id,
      detail: { email: user.email, name: user.name },
    },
  })

  return NextResponse.json({ instructor: user }, { status: 201 })
}
