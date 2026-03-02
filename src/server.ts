import { env } from './config/env'
import app from './app'
import { prisma } from './config/database'
import { logger } from './utils/logger'
import fs from 'fs'
import path from 'path'

// Ensure upload directories exist
const ensureUploadDirs = () => {
  const dirs = [
    path.join(process.cwd(), 'uploads'),
    path.join(process.cwd(), 'uploads/temp'),
    path.join(process.cwd(), 'uploads/files'),
    path.join(process.cwd(), 'logs'),
  ]
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
      logger.info(`Created directory: ${dir}`)
    }
  })
}

const startServer = async () => {
  try {
    ensureUploadDirs()

    // Test DB connection
    await prisma.$connect()
    logger.info('Database connected successfully')

    app.listen(env.PORT, () => {
      logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`)
    })
  } catch (error) {
    logger.error('Failed to start server:', error)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully')
  await prisma.$disconnect()
  process.exit(0)
})

startServer()