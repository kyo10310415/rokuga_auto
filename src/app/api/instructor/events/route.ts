import { NextRequest, NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { addDays } from 'date-fns'

/**
 * GET /api/instructor/events
 * 自分の予定一覧を取得（今後7日間）
 */
export async function GET(request: NextRequest) {
  const session = await getAuthSession()
  
  if (!session?.user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  
  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') || '7', 10)
  
  const events = await prisma.calendarEvent.findMany({
    where: {
      userId: session.user.id,
      startTime: {
        gte: new Date(),
        lte: addDays(new Date(), days),
      },
    },
    include: {
      correctionJobs: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { startTime: 'asc' },
  })
  
  return NextResponse.json({ events })
}
