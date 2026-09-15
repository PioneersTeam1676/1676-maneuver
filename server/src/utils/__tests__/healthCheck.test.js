'use strict'

const { checkDatabaseHealth } = require('../healthCheck')

describe('checkDatabaseHealth', () => {
  it('reports ok when SELECT 1 succeeds', async () => {
    const prisma = { $queryRawUnsafe: jest.fn().mockResolvedValue([{ ok: 1 }]) }
    await expect(checkDatabaseHealth(prisma, { timeoutMs: 100 })).resolves.toEqual({ status: 'ok' })
    expect(prisma.$queryRawUnsafe).toHaveBeenCalledWith('SELECT 1')
  })

  it('reports unreachable when the query rejects', async () => {
    const error = new Error("Can't reach database server")
    error.name = 'PrismaClientInitializationError'
    const prisma = { $queryRawUnsafe: jest.fn().mockRejectedValue(error) }
    await expect(checkDatabaseHealth(prisma, { timeoutMs: 100 })).resolves.toEqual({
      status: 'unreachable',
      error: "Can't reach database server",
    })
  })

  it('reports unreachable when the query hangs past the timeout', async () => {
    const prisma = { $queryRawUnsafe: jest.fn(() => new Promise(() => {})) }
    await expect(checkDatabaseHealth(prisma, { timeoutMs: 20 })).resolves.toEqual({
      status: 'unreachable',
      error: 'Database health check timed out after 20ms',
    })
  })
})
