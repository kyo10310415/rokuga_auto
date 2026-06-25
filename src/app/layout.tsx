import type { Metadata } from 'next'
import './globals.css'
import { SessionProvider } from 'next-auth/react'
import { auth } from '@/lib/auth/auth.config'

export const metadata: Metadata = {
  title: 'Meet補正システム - VTuberスクール',
  description: 'Google Meet録画・文字起こし自動補正システム',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 font-sans">
        <SessionProvider session={session}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
