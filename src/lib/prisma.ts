import { PrismaClient } from '@prisma/client'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
}

// 開発環境でホットリロードのたびに新しいインスタンスが作られるのを防ぐ
export const prisma = globalThis.__prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'error', 'warn']
    : ['error'],
})

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma
}
