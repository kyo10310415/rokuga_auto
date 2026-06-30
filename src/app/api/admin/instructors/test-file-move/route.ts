import { NextRequest, NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { runFileMoveForUser } from '@/lib/google/file-moving-engine'
import { extractFolderIdFromUrl } from '@/lib/google/drive-service'

/**
 * POST /api/admin/instructors/test-file-move
 * 特定ユーザーのファイル移動をテスト実行（管理者のみ）
 */
export async function POST(request: NextRequest) {
  const session = await getAuthSession()
  if (!session?.user || session.user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: '権限がありません' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const { userId } = body ?? {}

  if (!userId) {
    return NextResponse.json({ error: 'userId が必要です' }, { status: 400 })
  }

  // ユーザー情報取得
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, recordingFolderId: true, fileMovingEnabled: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 })
  }

  if (!user.recordingFolderId) {
    return NextResponse.json({ error: '録画保存先フォルダが設定されていません' }, { status: 400 })
  }

  // 文字起こし共通フォルダIDをシステム設定から取得
  const transcriptionSetting = await prisma.systemSetting.findUnique({
    where: { key: 'transcriptionFolderId' },
  })
  const transcriptionFolderId = transcriptionSetting?.value
    ? extractFolderIdFromUrl(transcriptionSetting.value)
    : null

  try {
    const result = await runFileMoveForUser(
      userId,
      user.recordingFolderId,
      transcriptionFolderId
    )

    return NextResponse.json({
      success: true,
      userName: user.name || user.email,
      ...result,
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    return NextResponse.json({
      success: false,
      error: errorMessage,
    }, { status: 500 })
  }
}
