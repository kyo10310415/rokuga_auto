import { NextRequest, NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { z } from 'zod'

const patchSchema = z.object({
  isActive: z.boolean().optional(),
  role: z.enum(['ADMIN', 'USER']).optional(),
  recordingFolderUrl: z.string().optional().nullable(),
  sourceFolderUrl: z.string().optional().nullable(),
  fileMovingEnabled: z.boolean().optional(),
}).refine((d) =>
  d.isActive !== undefined ||
  d.role !== undefined ||
  d.recordingFolderUrl !== undefined ||
  d.sourceFolderUrl !== undefined ||
  d.fileMovingEnabled !== undefined,
  { message: '変更するフィールドが必要です' }
)

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

  const updateData: {
    isActive?: boolean
    role?: UserRole
    recordingFolderId?: string | null
    sourceFolderId?: string | null
    fileMovingEnabled?: boolean
  } = {}
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive
  if (parsed.data.role !== undefined) updateData.role = parsed.data.role as UserRole
  if (parsed.data.recordingFolderUrl !== undefined) {
    updateData.recordingFolderId = parsed.data.recordingFolderUrl ?? null
  }
  if (parsed.data.sourceFolderUrl !== undefined) {
    updateData.sourceFolderId = parsed.data.sourceFolderUrl ?? null
  }
  if (parsed.data.fileMovingEnabled !== undefined) updateData.fileMovingEnabled = parsed.data.fileMovingEnabled

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: { id: true, name: true, email: true, isActive: true, role: true, recordingFolderId: true, sourceFolderId: true, fileMovingEnabled: true },
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

/**
 * DELETE /api/admin/instructors/[id]
 * ユーザーを完全削除（関連データも含む）
 *
 * 削除順序（外部キー制約のため手動で制御）:
 *   correctionJobs → calendarEvents → User
 *   accounts / sessions / googleAccount は onDelete:Cascade で自動削除
 *   auditLogs は userId が nullable なので NULLに更新してから削除
 */
export async function DELETE(
  _request: NextRequest,
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

  // 自分自身は削除不可
  if (id === session.user.id) {
    return NextResponse.json(
      { error: '自分自身を削除することはできません' },
      { status: 400 }
    )
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      _count: { select: { calendarEvents: true, correctionJobs: true } },
    },
  })

  if (!target) {
    return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })
  }

  // ADMIN ユーザーは削除不可（誤操作防止）
  if (target.role === UserRole.ADMIN) {
    return NextResponse.json(
      { error: '管理者アカウントは削除できません。先にロールを「ユーザー」に変更してください。' },
      { status: 400 }
    )
  }

  // トランザクションで関連データをすべて削除
  await prisma.$transaction(async (tx) => {
    // 1. auditLogs の userId を NULL に（ログ自体は残す）
    await tx.auditLog.updateMany({
      where: { userId: id },
      data: { userId: null },
    })

    // 2. correctionJobs 削除（calendarEvent に紐づいているため先に削除）
    await tx.correctionJob.deleteMany({ where: { userId: id } })

    // 3. calendarEvents 削除
    await tx.calendarEvent.deleteMany({ where: { userId: id } })

    // 4. User 削除（accounts / sessions / googleAccount は Cascade で自動削除）
    await tx.user.delete({ where: { id } })
  })

  // 削除実行者の監査ログを記録（操作者のIDで残す）
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'admin.delete_user',
      targetType: 'User',
      targetId: id,
      detail: {
        deletedEmail: target.email,
        deletedName: target.name,
        calendarEventsDeleted: target._count.calendarEvents,
        correctionJobsDeleted: target._count.correctionJobs,
      },
    },
  }).catch((err) => console.error('監査ログ記録失敗:', err))

  return NextResponse.json({ success: true })
}

