import { NextRequest, NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

/**
 * GET /api/admin/corrections
 * 全補正履歴を取得
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
  const limit = parseInt(searchParams.get('limit') || '30', 10)
  const status = searchParams.get('status')
  const userId = searchParams.get('userId')
  
  const where = {
    ...(status && { status: status as never }),
    ...(userId && { userId }),
  }
  
  const [jobs, total] = await Promise.all([
    prisma.correctionJob.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
        calendarEvent: {
          select: {
            eventTitle: true,
            startTime: true,
            meetLink: true,
            detectionStatus: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.correctionJob.count({ where }),
  ])
  
  return NextResponse.json({
    jobs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
}
