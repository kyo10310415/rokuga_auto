// 環境変数の型定義と検証
export const env = {
  // データベース
  DATABASE_URL: process.env.DATABASE_URL!,
  
  // NextAuth
  NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET!,
  
  // Google OAuth（アプリ全体用）
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET!,
  
  // 暗号化キー（トークン暗号化用、32文字）
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY!,
  
  // 内部APIキー（CronジョブからWebサーバーを叩く際の認証）
  INTERNAL_API_KEY: process.env.INTERNAL_API_KEY!,
  
  // Node環境
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  // ジョブ設定
  SCAN_INTERVAL_MINUTES: parseInt(process.env.SCAN_INTERVAL_MINUTES || '5', 10),
  PRE_CHECK_MINUTES_BEFORE: parseInt(process.env.PRE_CHECK_MINUTES_BEFORE || '30', 10),
  MAX_RETRY_ATTEMPTS: parseInt(process.env.MAX_RETRY_ATTEMPTS || '5', 10),
  
  // アプリURL（ジョブからAPIを呼ぶ際に使用）
  APP_URL: process.env.APP_URL || 'http://localhost:3000',
}

export function validateEnv(): void {
  const required = [
    'DATABASE_URL',
    'NEXTAUTH_SECRET',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'ENCRYPTION_KEY',
    'INTERNAL_API_KEY',
  ]
  
  const missing = required.filter((key) => !process.env[key])
  
  if (missing.length > 0) {
    throw new Error(`必須環境変数が設定されていません: ${missing.join(', ')}`)
  }
  
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) {
    throw new Error('ENCRYPTION_KEY は32文字以上必要です')
  }
}
