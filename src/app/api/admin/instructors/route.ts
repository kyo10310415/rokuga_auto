import { NextRequest, NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

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
      where: { role: UserRole.INSTRUCTOR },
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
    prisma.user.count({ where: { role: UserRole.INSTRUCTOR } }),
  ])
  
  return NextResponse.json({
    instructors: users,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
}
