import { NextResponse } from 'next/server'
import { getAuthSession } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import { createLogger } from '@/lib/logger'

const log = createLogger({ module: 'google-disconnect' })

/**
 * DELETE /api/google/disconnect
 * Google連携解除
 */
export async function DELETE() {
  const session = await getAuthSession()
  
  if (!session?.user) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }
  
  const userId = session.user.id
  
  const googleAccount = await prisma.googleAccount.findUnique({ where: { userId } })
  
  if (!googleAccount) {
    return NextResponse.json({ error: '連携情報が見つかりません' }, { status: 404 })
  }
  
  await prisma.googleAccount.delete({ where: { userId } })
  
  await prisma.auditLog.create({
    data: {
      userId,
      action: 'google.disconnect',
      detail: { googleEmail: googleAccount.googleEmail },
    },
  })
  
  log.info({ userId, googleEmail: googleAccount.googleEmail }, 'Google連携解除')
  
  return NextResponse.json({ success: true, message: 'Google連携を解除しました' })
}
