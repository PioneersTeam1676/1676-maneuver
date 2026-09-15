'use strict'

const { isDatabaseUnavailableError, resolveErrorResponse } = require('../serviceErrors')

const prismaInitError = () => {
  const error = new Error("Can't reach database server at `72.61.78.51:3306`")
  error.name = 'PrismaClientInitializationError'
  return error
}

describe('serviceErrors', () => {
  it('recognises Prisma connection failures by name', () => {
    expect(isDatabaseUnavailableError(prismaInitError())).toBe(true)
  })

  it.each(['P1001', 'P1002', 'P1008', 'P1017', 'P2024'])('recognises Prisma code %s', (code) => {
    const error = new Error('db')
    error.code = code
    expect(isDatabaseUnavailableError(error)).toBe(true)
  })

  it('recognises socket-level failures', () => {
    for (const code of ['ECONNREFUSED', 'ETIMEDOUT', 'EHOSTUNREACH']) {
      const error = new Error('net')
      error.code = code
      expect(isDatabaseUnavailableError(error)).toBe(true)
    }
  })

  it('ignores ordinary errors and non-errors', () => {
    expect(isDatabaseUnavailableError(new Error('boom'))).toBe(false)
    expect(isDatabaseUnavailableError(null)).toBe(false)
    expect(isDatabaseUnavailableError('nope')).toBe(false)
    const known = new Error('unique')
    known.code = 'P2002'
    expect(isDatabaseUnavailableError(known)).toBe(false)
  })

  it('maps database outages to 503 and everything else to 500', () => {
    expect(resolveErrorResponse(prismaInitError())).toEqual({
      status: 503,
      body: { error: 'Service temporarily unavailable', reason: 'database_unavailable' },
    })
    expect(resolveErrorResponse(new Error('boom'))).toEqual({
      status: 500,
      body: { error: 'Internal server error' },
    })
  })
})
