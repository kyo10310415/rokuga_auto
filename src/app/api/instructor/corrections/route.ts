import { NextRequest, NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/instructor/corrections
 * 自分の補正履歴を取得
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession()
  
  if (!session?.user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1', 10)
  const limit = parseInt(searchParams.get('limit') || '20', 10)
  const status = searchParams.get('status')
  
  const where = {
    userId: session.user.id,
    ...(status && { status: status as never }),
  }
  
  const [jobs, total] = await Promise.all([
    prisma.correctionJob.findMany({
      where,
      include: {
        calendarEvent: {
          select: {
            eventTitle: true,
            startTime: true,
            meetLink: true,
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
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  })
}
