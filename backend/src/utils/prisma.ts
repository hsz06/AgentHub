import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

let initialization: Promise<void> | undefined

export function initializeDatabase() {
  if (!initialization) {
    initialization = (async () => {
      if (!process.env.DATABASE_URL?.startsWith('file:')) return
      await withDatabaseRetry(() => prisma.$queryRawUnsafe('PRAGMA busy_timeout = 10000'))
      await withDatabaseRetry(() => prisma.$queryRawUnsafe('PRAGMA journal_mode = WAL'))
      await withDatabaseRetry(() => prisma.$queryRawUnsafe('PRAGMA synchronous = NORMAL'))
    })().catch(error => {
      initialization = undefined
      throw error
    })
  }
  return initialization
}

export async function withDatabaseRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      if (!isTransientDatabaseError(error) || attempt === attempts - 1) throw error
      await new Promise(resolve => setTimeout(resolve, 150 * (2 ** attempt)))
    }
  }
  throw lastError
}

function isTransientDatabaseError(error: unknown) {
  const value = error as { code?: string; message?: string }
  return value.code === 'P1008'
    || value.code === 'P2024'
    || /operations timed out|database is locked|database is busy/i.test(value.message || '')
}

export default prisma
