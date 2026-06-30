'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserRole } from '@prisma/client'

interface NavItem {
  href: string
  label: string
  icon: string
}

const adminNav: NavItem[] = [
  { href: '/admin', label: 'ダッシュボード', icon: '📊' },
  { href: '/admin/instructors', label: '講師管理', icon: '👥' },
  { href: '/admin/events', label: '予定一覧', icon: '📅' },
  { href: '/admin/corrections', label: '補正履歴', icon: '🔧' },
  { href: '/admin/audit-logs', label: '監査ログ', icon: '📋' },
  { href: '/admin/settings', label: 'システム設定', icon: '⚙️' },
]

const instructorNav: NavItem[] = [
  { href: '/instructor', label: 'マイページ', icon: '🏠' },
  { href: '/instructor/events', label: '予定一覧', icon: '📅' },
  { href: '/instructor/corrections', label: '補正履歴', icon: '🔧' },
]

export default function Sidebar() {
  const { data: session } = useSession()
  const pathname = usePathname()
  
  if (!session?.user) return null
  
  const isAdmin = session.user.role === UserRole.ADMIN
  const navItems = isAdmin ? adminNav : instructorNav
  
  return (
    <aside className="w-56 bg-white border-r border-gray-200 flex flex-col min-h-screen">
      <div className="p-4 border-b border-gray-200">
        <h1 className="text-sm font-bold text-gray-900 leading-tight">
          🎥 Meet補正システム
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">VTuberスクール</p>
      </div>
      
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/admin' && item.href !== '/instructor' && pathname.startsWith(item.href))
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
      
      <div className="p-3 border-t border-gray-200 space-y-2">
        <div className="px-3 py-2">
          <p className="text-xs font-medium text-gray-900 truncate">
            {session.user.name || session.user.email}
          </p>
          <p className="text-xs text-gray-500">
            {isAdmin ? '管理者' : '講師'}
          </p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-md transition-colors"
        >
          ログアウト
        </button>
      </div>
    </aside>
  )
}
