'use strict'

const mockVerifyIdToken = jest.fn()

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: mockVerifyIdToken })),
}))
jest.mock('../../db', () => ({
  prisma: {
    role: { findUnique: jest.fn() },
    recentUser: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}))

const express = require('express')
const { prisma } = require('../../db')
const { signAppToken } = require('../../utils/appJwt')

// Mirrors what Prisma throws when MySQL is unreachable (P1001).
class PrismaClientInitializationError extends Error {
  constructor() {
    super("Can't reach database server at `db:3306`")
    this.name = 'PrismaClientInitializationError'
    this.errorCode = undefined
  }
}

describe('api auth middleware when the database is down', () => {
  const originalClientId = process.env.GOOGLE_CLIENT_ID
  let server
  let baseUrl

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client'
    const { createApiAuthMiddleware } = require('../apiAuth')
    const app = express()
    app.get('/protected', createApiAuthMiddleware(), (req, res) => res.json({ email: req.user.email }))
    server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID
    else process.env.GOOGLE_CLIENT_ID = originalClientId
  })

  beforeEach(() => {
    jest.clearAllMocks()
    prisma.role.findUnique.mockRejectedValue(new PrismaClientInitializationError())
    prisma.recentUser.findUnique.mockResolvedValue(null)
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'scout@pascack.org', name: 'Scout', email_verified: true }),
    })
  })

  const get = (token) =>
    fetch(`${baseUrl}/protected`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })

  it('answers 503 (not 401, not a hang) for a valid app token', async () => {
    const { token } = signAppToken({ email: 'scout@pascack.org' })
    const response = await get(token)
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ error: 'Service temporarily unavailable', reason: 'database_unavailable' })
  })

  it('answers 503 for a valid Google token', async () => {
    const response = await get('google-id-token')
    expect(mockVerifyIdToken).toHaveBeenCalled()
    expect(response.status).toBe(503)
  })

  it('still answers 401 for a token Google rejects', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('bad token'))
    const response = await get('garbage')
    expect(response.status).toBe(401)
    expect(prisma.role.findUnique).not.toHaveBeenCalled()
  })

  it('still answers 401 with no credentials at all', async () => {
    const response = await get(null)
    expect(response.status).toBe(401)
  })

  it('serves the request normally once the database is back', async () => {
    prisma.role.findUnique.mockResolvedValue({ role: 'scout' })
    const { token } = signAppToken({ email: 'scout@pascack.org' })
    const response = await get(token)
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ email: 'scout@pascack.org' })
  })
})

describe('api auth middleware 401 reasons', () => {
  let server
  let baseUrl
  const originalClientId = process.env.GOOGLE_CLIENT_ID

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client'
    const { createApiAuthMiddleware } = require('../apiAuth')
    const app = express()
    app.get('/protected', createApiAuthMiddleware(), (_req, res) => res.json({ ok: true }))
    server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID
    else process.env.GOOGLE_CLIENT_ID = originalClientId
  })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'warn').mockImplementation(() => {})
  })

  const get = (token) =>
    fetch(`${baseUrl}/protected`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })

  it('names a missing token', async () => {
    const response = await get(null)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized', reason: 'no_token' })
    expect(mockVerifyIdToken).not.toHaveBeenCalled()
  })

  it('names an expired/foreign-secret app token without asking Google', async () => {
    const { token } = signAppToken({ email: 'scout@pascack.org' }, { expiresInSeconds: -10 })
    const response = await get(token)
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized', reason: 'app_token_invalid' })
    expect(mockVerifyIdToken).not.toHaveBeenCalled()
  })

  it('names an expired Google token', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Token used too late, 1757970000 > 1757966400'))
    const response = await get('google-id-token')
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized', reason: 'google_token_expired' })
  })

  it('names a Google token that fails verification', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token signature'))
    const response = await get('google-id-token')
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized', reason: 'google_token_invalid' })
  })
})
