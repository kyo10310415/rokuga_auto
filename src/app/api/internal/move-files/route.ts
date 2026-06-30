import { NextRequest, NextResponse } from 'next/server'
import { runFileMoveForAllUsers } from '@/lib/google/file-moving-engine'
import { createLogger } from '@/lib/logger'

const log = createLogger({ module: 'internal-move-files' })

/**
 * POST /api/internal/move-files
 * ファイル移動Cron Job（Renderから呼ばれる）
 * 認証: INTERNAL_API_KEY (Authorization: Bearer {key})
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const expectedKey = process.env.INTERNAL_API_KEY

  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    log.warn({ ip: request.headers.get('x-forwarded-for') }, '内部API不正アクセス')
    return NextResponse.json({ error: '認証失敗' }, { status: 401 })
  }

  log.info('ファイル移動ジョブ開始')

  try {
    const result = await runFileMoveForAllUsers()

    log.info(result, 'ファイル移動ジョブ完了')

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.error({ err }, 'ファイル移動ジョブ失敗')

    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}
