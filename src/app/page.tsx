import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/auth.config'
import { UserRole } from '@prisma/client'

export default async function HomePage() {
  const session = await auth()
  
  if (!session?.user) {
    redirect('/login')
  }
  
  if (session.user.role === UserRole.ADMIN) {
    redirect('/admin')
  }
  
  redirect('/instructor')
}
