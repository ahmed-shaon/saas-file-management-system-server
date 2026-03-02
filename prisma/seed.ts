import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'
import bcrypt from 'bcryptjs'

const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

// ─────────────────────────────────────────────
// DEFAULT PACKAGE DEFINITIONS
// ─────────────────────────────────────────────

const defaultPackages = [
  {
    name: 'Free',
    maxFolders: 5,
    maxNestingLevel: 2,
    maxFileSizeMb: 5,
    totalFileLimit: 10,
    filesPerFolder: 5,
    allowedFileTypes: ['IMAGE', 'PDF'],
    durationDays: null,
    isDefault: true,
    isActive: true,
  },
  {
    name: 'Silver',
    maxFolders: 20,
    maxNestingLevel: 3,
    maxFileSizeMb: 25,
    totalFileLimit: 100,
    filesPerFolder: 20,
    allowedFileTypes: ['IMAGE', 'PDF', 'AUDIO'],
    durationDays: 30,
    isDefault: false,
    isActive: true,
  },
  {
    name: 'Gold',
    maxFolders: 50,
    maxNestingLevel: 5,
    maxFileSizeMb: 100,
    totalFileLimit: 500,
    filesPerFolder: 100,
    allowedFileTypes: ['IMAGE', 'PDF', 'AUDIO', 'VIDEO'],
    durationDays: 30,
    isDefault: false,
    isActive: true,
  },
  {
    name: 'Diamond',
    maxFolders: 9999,
    maxNestingLevel: 10,
    maxFileSizeMb: 500,
    totalFileLimit: 9999,
    filesPerFolder: 500,
    allowedFileTypes: ['IMAGE', 'PDF', 'AUDIO', 'VIDEO'],
    durationDays: 30,
    isDefault: false,
    isActive: true,
  },
]

// ─────────────────────────────────────────────
// SEED FUNCTION
// ─────────────────────────────────────────────

async function main() {
  console.log('🌱 Starting seed...')

  // ── 1. Seed Packages ──────────────────────────────────

  console.log('📦 Seeding subscription packages...')

  for (const pkg of defaultPackages) {
    await prisma.subscriptionPackage.upsert({
      where: { name: pkg.name },
      update: {
        maxFolders: pkg.maxFolders,
        maxNestingLevel: pkg.maxNestingLevel,
        maxFileSizeMb: pkg.maxFileSizeMb,
        totalFileLimit: pkg.totalFileLimit,
        filesPerFolder: pkg.filesPerFolder,
        allowedFileTypes: pkg.allowedFileTypes,
        durationDays: pkg.durationDays,
        isActive: pkg.isActive,
      },
      create: pkg,
    })
    console.log(`  ✔ Package "${pkg.name}" ready`)
  }

  // ── 2. Seed Admin User ────────────────────────────────

  console.log('👤 Seeding admin user...')

  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  const adminName = process.env.ADMIN_FULL_NAME

  if (!adminEmail || !adminPassword) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env')
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 12)

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash: hashedPassword,
      fullName: adminName ?? 'System Admin',
    },
    create: {
      email: adminEmail,
      passwordHash: hashedPassword,
      fullName: adminName ?? 'System Admin',
      role: 'ADMIN',
      isActive: true,
    },
  })

  console.log(`  ✔ Admin user "${admin.email}" ready`)

  // ── 3. Summary ────────────────────────────────────────

  const packageCount = await prisma.subscriptionPackage.count()
  const userCount = await prisma.user.count()

  console.log('')
  console.log('✅ Seed complete!')
  console.log(`   Packages : ${packageCount}`)
  console.log(`   Users    : ${userCount}`)
  console.log('')
  console.log('Admin credentials:')
  console.log(`   Email    : ${adminEmail}`)
  console.log(`   Password : ${adminPassword}`)
}

// ─────────────────────────────────────────────
// RUN
// ─────────────────────────────────────────────

main()
  .catch(e => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })