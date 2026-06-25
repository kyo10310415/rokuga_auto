import { NextRequest, NextResponse } from 'next/server'
import { scanAndQueueJobs, executePendingJobs } from '@/lib/google/correction-engine'
import { createLogger } from '@/lib/logger'

const log = createLogger({ module: 'internal-scan-events' })

/**
 * POST /api/internal/scan-events
 * イベントスキャンジョブ（Cronから呼ばれる）
 * 
 * 認証: INTERNAL_API_KEY (Authorization: Bearer {key})
 */
export async function POST(request: NextRequest) {
  // 内部APIキー認証
  const authHeader = request.headers.get('Authorization')
  const expectedKey = process.env.INTERNAL_API_KEY
  
  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    log.warn({ ip: request.headers.get('x-forwarded-for') }, '内部API不正アクセス')
    return NextResponse.json({ error: '認証失敗' }, { status: 401 })
  }
  
  log.info('イベントスキャン開始')
  
  try {
    // Step 1: イベントをスキャンしてジョブをキューに投入
    const scanResult = await scanAndQueueJobs()
    
    // Step 2: キューに入ったジョブを実行
    const execResult = await executePendingJobs()
    
    log.info({ scanResult, execResult }, 'イベントスキャン・補正完了')
    
    return NextResponse.json({
      success: true,
      scan: scanResult,
      execution: execResult,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.error({ err }, 'イベントスキャン失敗')
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}
