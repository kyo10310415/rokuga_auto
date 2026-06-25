import { NextRequest, NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

/**
 * GET /api/admin/audit-logs
 * 監査ログ一覧
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
  const userId = searchParams.get('userId')
  const action = searchParams.get('action')
  
  const where = {
    ...(userId && { userId }),
    ...(action && { action: { contains: action } }),
  }
  
  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ])
  
  return NextResponse.json({
    logs,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  })
}
