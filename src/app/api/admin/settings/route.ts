import { NextRequest, NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { z } from 'zod'

const TRANSCRIPTION_FOLDER_KEY = 'transcriptionFolderId'
const SOURCE_FOLDER_KEY = 'sourceFolderId'

const updateSchema = z.object({
  transcriptionFolderUrl: z.string().optional().nullable(),
  sourceFolderUrl: z.string().optional().nullable(),
})

/**
 * GET /api/admin/settings
 * システム設定を取得
 */
export async function GET() {
  const session = await getAuthSession()
  if (!session?.user || session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const setting = await prisma.systemSetting.findUnique({
    where: { key: TRANSCRIPTION_FOLDER_KEY },
  })

  const sourceSetting = await prisma.systemSetting.findUnique({
    where: { key: SOURCE_FOLDER_KEY },
  })

  return NextResponse.json({
    transcriptionFolderUrl: setting?.value ?? null,
    sourceFolderUrl: sourceSetting?.value ?? null,
  })
}

/**
 * PATCH /api/admin/settings
 * システム設定を更新
 */
export async function PATCH(request: NextRequest) {
  const session = await getAuthSession()
  if (!session?.user || session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 })
  }

  const { transcriptionFolderUrl, sourceFolderUrl } = parsed.data

  await prisma.systemSetting.upsert({
    where: { key: TRANSCRIPTION_FOLDER_KEY },
    create: {
      key: TRANSCRIPTION_FOLDER_KEY,
      value: transcriptionFolderUrl ?? null,
    },
    update: {
      value: transcriptionFolderUrl ?? null,
    },
  })

  await prisma.systemSetting.upsert({
    where: { key: SOURCE_FOLDER_KEY },
    create: {
      key: SOURCE_FOLDER_KEY,
      value: sourceFolderUrl ?? null,
    },
    update: {
      value: sourceFolderUrl ?? null,
    },
  })

  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'admin.update_settings',
      detail: { transcriptionFolderUrl, sourceFolderUrl },
    },
  })

  return NextResponse.json({ success: true })
}
