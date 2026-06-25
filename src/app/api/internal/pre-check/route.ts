import { NextRequest, NextResponse } from 'next/server'
import { runPreCheckJobs } from '@/lib/google/correction-engine'
import { createLogger } from '@/lib/logger'

const log = createLogger({ module: 'internal-pre-check' })

/**
 * POST /api/internal/pre-check
 * 開始前再確認ジョブ（Cronから呼ばれる）
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  const expectedKey = process.env.INTERNAL_API_KEY
  
  if (!expectedKey || authHeader !== `Bearer ${expectedKey}`) {
    log.warn({ ip: request.headers.get('x-forwarded-for') }, '内部API不正アクセス')
    return NextResponse.json({ error: '認証失敗' }, { status: 401 })
  }
  
  log.info('開始前再確認ジョブ開始')
  
  try {
    const result = await runPreCheckJobs(30)
    
    log.info({ result }, '開始前再確認完了')
    
    return NextResponse.json({
      success: true,
      result,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    log.error({ err }, '開始前再確認失敗')
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      timestamp: new Date().toISOString(),
    }, { status: 500 })
  }
}
