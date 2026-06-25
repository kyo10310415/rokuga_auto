#!/usr/bin/env ts-node
/**
 * pre-check.ts
 * 
 * Render Cron Job: 5分ごとに実行
 * - 開始30分以内の会議を再確認
 * - 設定が狂っていれば再補正
 */

import 'dotenv/config'

async function main() {
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const apiKey = process.env.INTERNAL_API_KEY
  
  if (!apiKey) {
    console.error('INTERNAL_API_KEY が設定されていません')
    process.exit(1)
  }
  
  console.log(`[${new Date().toISOString()}] 開始前再確認ジョブ開始`)
  
  const response = await fetch(`${appUrl}/api/internal/pre-check`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })
  
  const result = await response.json()
  
  if (!response.ok) {
    console.error(`[${new Date().toISOString()}] 再確認失敗:`, result)
    process.exit(1)
  }
  
  console.log(`[${new Date().toISOString()}] 再確認完了:`, JSON.stringify(result, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] 予期しないエラー:`, err)
  process.exit(1)
})
