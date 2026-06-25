import { NextRequest, NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'

/**
 * PATCH /api/admin/instructors/[id]
 * 講師を無効化 or 再有効化する
 * body: { isActive: boolean }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getAuthSession()

  if (!session?.user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  if (session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json().catch(() => null)

  if (typeof body?.isActive !== 'boolean') {
    return NextResponse.json({ error: 'isActive (boolean) が必要です' }, { status: 400 })
  }

  // 自分自身は変更不可
  if (id === session.user.id) {
    return NextResponse.json({ error: '自分自身を操作することはできません' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target || target.role !== UserRole.INSTRUCTOR) {
    return NextResponse.json({ error: '講師が見つかりません' }, { status: 404 })
  }

  const updated = await prisma.user.update({
    where: { id },
    data: { isActive: body.isActive },
    select: { id: true, name: true, email: true, isActive: true },
  })

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: body.isActive ? 'admin.activate_instructor' : 'admin.deactivate_instructor',
      targetType: 'User',
      targetId: id,
      detail: { email: target.email },
    },
  })

  return NextResponse.json({ instructor: updated })
}
