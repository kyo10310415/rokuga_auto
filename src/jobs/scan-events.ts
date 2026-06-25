#!/usr/bin/env ts-node
/**
 * scan-events.ts
 * 
 * Render Cron Job: 5分ごとに実行
 * - 全講師のCalendarイベントをスキャン
 * - Meet付き予定を補正ジョブとしてキュー投入
 * - キュー内のPendingジョブを実行
 * 
 * 実行方法:
 *   ts-node --project tsconfig.jobs.json src/jobs/scan-events.ts
 * 
 * または Internal APIを叩く方式（Render Cron Jobで推奨）:
 *   curl -X POST ${APP_URL}/api/internal/scan-events -H "Authorization: Bearer ${INTERNAL_API_KEY}"
 */

import 'dotenv/config'

async function main() {
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const apiKey = process.env.INTERNAL_API_KEY
  
  if (!apiKey) {
    console.error('INTERNAL_API_KEY が設定されていません')
    process.exit(1)
  }
  
  console.log(`[${new Date().toISOString()}] イベントスキャン開始: ${appUrl}`)
  
  const response = await fetch(`${appUrl}/api/internal/scan-events`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })
  
  const result = await response.json()
  
  if (!response.ok) {
    console.error(`[${new Date().toISOString()}] スキャン失敗:`, result)
    process.exit(1)
  }
  
  console.log(`[${new Date().toISOString()}] スキャン完了:`, JSON.stringify(result, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] 予期しないエラー:`, err)
  process.exit(1)
})
