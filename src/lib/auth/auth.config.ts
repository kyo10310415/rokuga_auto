import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      role: UserRole
    }
  }
  
  interface User {
    role: UserRole
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),

  // Render / Vercel 等のリバースプロキシ環境でホスト検証エラーを防ぐ
  // AUTH_TRUST_HOST=true を環境変数で設定するか、ここで直接有効化する
  trustHost: true,
  
  providers: [
    // Googleサインイン（Auth.jsログイン用 - スコープ最小限）
    // checks: ["state"] に限定することで、リバースプロキシ環境での
    // "iss (issuer) missing" エラーを回避する（PKCEを無効化）
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile',
        },
      },
      checks: ['state'],
    }),
    
    // メール＋パスワードログイン（管理者の初期ログイン用）
    Credentials({
      name: 'メール・パスワード',
      credentials: {
        email: { label: 'メールアドレス', type: 'email' },
        password: { label: 'パスワード', type: 'password' },
      },
      async authorize(credentials) {
        const schema = z.object({
          email: z.string().email(),
          password: z.string().min(8),
        })
        
        const parsed = schema.safeParse(credentials)
        if (!parsed.success) return null
        
        const { email, password } = parsed.data
        
        // credentialsプロバイダーのアカウントを検索
        const account = await prisma.account.findFirst({
          where: {
            provider: 'credentials',
            user: { email },
          },
          include: { user: true },
        })
        
        if (!account || !account.access_token) return null
        if (!account.user.isActive) return null
        
        const isValid = await bcrypt.compare(password, account.access_token)
        if (!isValid) return null
        
        return {
          id: account.user.id,
          email: account.user.email!,
          name: account.user.name,
          role: account.user.role,
        }
      },
    }),
  ],
  
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24時間
  },
  
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
        token.id = user.id
      }
      
      // DBからロールを最新化（セッション更新時）
      if (token.id && !token.role) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, isActive: true },
        })
        if (dbUser) {
          token.role = dbUser.role
        }
      }
      
      return token
    },
    
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as UserRole
      }
      return session
    },
  },
  
  pages: {
    signIn: '/login',
    error: '/login',
  },
  
  events: {
    async signIn({ user }) {
      // サインインログ
      await prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'auth.signin',
          detail: { email: user.email },
        },
      }).catch((err) => console.error('監査ログ記録失敗:', err))
    },
    async signOut(message) {
      // サインアウトログ
      const tokenId = 'token' in message ? message.token?.id : undefined
      if (tokenId) {
        await prisma.auditLog.create({
          data: {
            userId: tokenId as string,
            action: 'auth.signout',
          },
        }).catch((err) => console.error('監査ログ記録失敗:', err))
      }
    },
  },
})
