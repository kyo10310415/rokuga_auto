import { requireAdmin } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import AppLayout from '@/components/layouts/AppLayout'
import InstructorsClient from '@/components/admin/InstructorsClient'
import { UserRole } from '@prisma/client'

export default async function InstructorsPage() {
  await requireAdmin()

  const instructors = await prisma.user.findMany({
    where: { role: UserRole.INSTRUCTOR },
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
    orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
  })

  return (
    <AppLayout>
      <div className="space-y-6">
        <InstructorsClient instructors={instructors} />
      </div>
    </AppLayout>
  )
}
