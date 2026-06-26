import { requireAdmin } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import AppLayout from '@/components/layouts/AppLayout'
import InstructorsClient from '@/components/admin/InstructorsClient'

export default async function InstructorsPage() {
  const session = await requireAdmin()

  // 管理者以外の全ユーザー（自分自身も含む全員表示）
  const users = await prisma.user.findMany({
    include: {
      googleAccount: {
        select: {
          googleEmail: true,
          status: true,
          lastRefreshedAt: true,
          lastErrorMessage: true,
          lastErrorAt: true,
        },
      },
      _count: {
        select: {
          calendarEvents: true,
          correctionJobs: true,
        },
      },
    },
    orderBy: [{ role: 'asc' }, { isActive: 'desc' }, { name: 'asc' }],
  })

  return (
    <AppLayout>
      <div className="space-y-6">
        <InstructorsClient users={users} currentUserId={session.user.id} />
      </div>
    </AppLayout>
  )
}
