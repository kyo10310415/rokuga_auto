import { NextRequest, NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { z } from 'zod'

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
}).refine((d) => d.isActive !== undefined || d.role !== undefined, {
  message: 'isActive または role のいずれかが必要です',
})

/**
 * PATCH /api/admin/instructors/[id]
 * 無効化/有効化 または 権限変更
 * body: { isActive?: boolean, role?: 'ADMIN' | 'USER' }
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
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  // 自分自身のロール変更は不可
  if (id === session.user.id) {
    return NextResponse.json({ error: '自分自身を操作することはできません' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({ where: { id } })
  if (!target) {
    return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })
  }

  const updateData: { isActive?: boolean; role?: UserRole } = {}
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive
  if (parsed.data.role !== undefined) updateData.role = parsed.data.role as UserRole

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: { id: true, name: true, email: true, isActive: true, role: true },
  })

  // 監査ログ
  let action = 'admin.update_user'
  if (parsed.data.isActive !== undefined) {
    action = parsed.data.isActive ? 'admin.activate_user' : 'admin.deactivate_user'
  }
  if (parsed.data.role !== undefined) {
    action = `admin.change_role_to_${parsed.data.role.toLowerCase()}`
  }

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action,
      targetType: 'User',
      targetId: id,
      detail: { email: target.email, changes: parsed.data },
    },
  })

  return NextResponse.json({ user: updated })
}
