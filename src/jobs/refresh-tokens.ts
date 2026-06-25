#!/usr/bin/env ts-node
/**
 * refresh-tokens.ts
 * 
 * Render Cron Job: 1時間ごとに実行
 * - 期限切れ前のOAuthトークンを一括リフレッシュ
 */

import 'dotenv/config'

async function main() {
  const appUrl = process.env.APP_URL || 'http://localhost:3000'
  const apiKey = process.env.INTERNAL_API_KEY
  
  if (!apiKey) {
    console.error('INTERNAL_API_KEY が設定されていません')
    process.exit(1)
  }
  
  console.log(`[${new Date().toISOString()}] トークンリフレッシュ開始`)
  
  const response = await fetch(`${appUrl}/api/internal/refresh-tokens`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })
  
  const result = await response.json()
  
  if (!response.ok) {
    console.error(`[${new Date().toISOString()}] リフレッシュ失敗:`, result)
    process.exit(1)
  }
  
  console.log(`[${new Date().toISOString()}] リフレッシュ完了:`, JSON.stringify(result, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] 予期しないエラー:`, err)
  process.exit(1)
})
