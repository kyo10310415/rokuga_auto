import { PrismaClient, UserRole } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 シードデータ投入開始...')

  // 管理者ユーザーの作成
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345!'

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  })

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 12)
    
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: '管理者',
        role: UserRole.ADMIN,
        emailVerified: new Date(),
        accounts: {
          create: {
            type: 'credentials',
            provider: 'credentials',
            providerAccountId: adminEmail,
            // passwordはaccountsのaccess_tokenとして保存（カスタム認証用）
            access_token: hashedPassword,
          },
        },
      },
    })
    
    console.log(`✅ 管理者ユーザー作成完了: ${admin.email} (ID: ${admin.id})`)
    console.log(`   ⚠️  初回ログイン後、必ずパスワードを変更してください`)
  } else {
    console.log(`ℹ️  管理者ユーザーは既に存在します: ${adminEmail}`)
  }

  console.log('✅ シード完了')
}

main()
  .catch((e) => {
    console.error('❌ シードエラー:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
