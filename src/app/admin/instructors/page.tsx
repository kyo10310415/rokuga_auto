import { requireAdmin } from '@/lib/auth/permissions'
import { prisma } from '@/lib/prisma'
import AppLayout from '@/components/layouts/AppLayout'
import StatusBadge from '@/components/ui/StatusBadge'
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
    orderBy: { name: 'asc' },
  })
  
  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">講師管理</h1>
            <p className="text-sm text-gray-500 mt-1">
              {instructors.length}名の講師
            </p>
          </div>
        </div>
        
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  講師名
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Google連携
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状態
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  予定数
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  補正数
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  最終更新
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {instructors.map((instructor) => (
                <tr key={instructor.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {instructor.name || '(未設定)'}
                      </p>
                      <p className="text-xs text-gray-500">{instructor.email}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {instructor.googleAccount ? (
                      <p className="text-xs text-gray-700">
                        {instructor.googleAccount.googleEmail}
                      </p>
                    ) : (
                      <span className="text-xs text-gray-400">未連携</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {instructor.googleAccount ? (
                      <StatusBadge status={instructor.googleAccount.status} type="google" />
                    ) : (
                      <span className="badge-gray">未連携</span>
                    )}
                    {instructor.googleAccount?.lastErrorMessage && (
                      <p className="text-xs text-danger-600 mt-1 max-w-48 truncate">
                        {instructor.googleAccount.lastErrorMessage}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {instructor._count.calendarEvents}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700">
                    {instructor._count.correctionJobs}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {instructor.googleAccount?.lastRefreshedAt
                      ? new Date(instructor.googleAccount.lastRefreshedAt).toLocaleDateString('ja-JP')
                      : '-'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {instructors.length === 0 && (
            <div className="text-center py-8 text-sm text-gray-500">
              講師が登録されていません
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
