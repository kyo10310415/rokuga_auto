import { auth } from '@/lib/auth/auth.config'
import { UserRole } from '@prisma/client'
import { redirect } from 'next/navigation'

/**
 * サーバーコンポーネント用 - 認証チェック
 */
export async function requireAuth() {
  const session = await auth()
  if (!session?.user) {
    redirect('/login')
  }
  return session
}

/**
 * サーバーコンポーネント用 - 管理者権限チェック
 */
export async function requireAdmin() {
  const session = await requireAuth()
  if (session.user.role !== UserRole.ADMIN) {
    redirect('/instructor')
  }
  return session
}

/**
 * API Route用 - 認証チェック（リダイレクトなし）
 */
export async function getAuthSession() {
  return auth()
}

/**
 * ロール確認ヘルパー
 */
export function isAdmin(role: UserRole): boolean {
  return role === UserRole.ADMIN
}

export function isInstructor(role: UserRole): boolean {
  return role === UserRole.INSTRUCTOR
}
