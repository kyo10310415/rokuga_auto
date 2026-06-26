'use client'

interface User {
  id: string
  name: string | null
  email: string | null
}

interface Props {
  users: User[]
  currentUserId?: string
  currentStatus?: string
}

/**
 * ユーザー絞り込みセレクト（Client Component）
 * 選択変更時にフォームを即時サブミットする
 */
export default function UserFilterSelect({ users, currentUserId, currentStatus }: Props) {
  return (
    <form method="GET" action="/admin/events" className="flex items-center gap-2">
      {currentStatus && (
        <input type="hidden" name="status" value={currentStatus} />
      )}
      <select
        name="userId"
        defaultValue={currentUserId ?? ''}
        onChange={(e) => {
          e.currentTarget.form?.submit()
        }}
        className="text-xs border border-gray-300 rounded-md py-1.5 pl-2 pr-7 bg-white
                   focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent
                   text-gray-700 cursor-pointer"
        style={{
          appearance: 'none',
          backgroundImage:
            "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 4px center',
          backgroundSize: '16px',
        }}
      >
        <option value="">すべてのユーザー</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name || u.email}
          </option>
        ))}
      </select>
    </form>
  )
}
