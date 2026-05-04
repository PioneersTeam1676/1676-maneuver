'use strict'

const mockVerifyIdToken = jest.fn()

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}))

jest.mock('../db', () => ({
  prisma: {
    role: {
      findUnique: jest.fn(),
    },
  },
}))

jest.mock('../utils/recentUserUtils', () => ({
  upsertRecentUser: jest.fn(),
}))

jest.mock('../utils/authDomains', () => ({
  getAllowedEmailDomains: jest.fn(() => ['pascack.org']),
}))

const { prisma } = require('../db')
const { upsertRecentUser } = require('../utils/recentUserUtils')
const { createApiAuthMiddleware } = require('./apiAuth')

const createReq = (token = 'google-token') => ({
  method: 'GET',
  query: {},
  user: undefined,
  get: jest.fn((header) => {
    if (header.toLowerCase() === 'authorization') {
      return `Bearer ${token}`
    }
    return undefined
  }),
})

const createRes = () => {
  const res = {}
  res.status = jest.fn(() => res)
  res.json = jest.fn(() => res)
  return res
}

const runMiddleware = async (options = {}) => {
  const req = createReq()
  const res = createRes()
  const next = jest.fn()

  const middleware = createApiAuthMiddleware(options)
  await middleware(req, res, next)

  return { req, res, next }
}

describe('api auth middleware', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = {
      ...originalEnv,
      GOOGLE_CLIENT_ID: 'google-client-id',
      API_AUTH_TOKEN: '',
      API_AUTH_TOKENS: '',
      DISABLE_GOOGLE_ID_AUTH: '',
    }
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        email: 'partner@example.com',
        email_verified: true,
        name: 'Partner Scout',
        picture: 'https://example.com/avatar.png',
      }),
    })
    upsertRecentUser.mockResolvedValue({})
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('rejects off-domain pending Google users when domain checks are enabled', async () => {
    prisma.role.findUnique.mockResolvedValue(null)

    const { res, next } = await runMiddleware()

    expect(res.status).toHaveBeenCalledWith(403)
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' })
    expect(next).not.toHaveBeenCalled()
  })

  it('allows off-domain pending Google users when domain checks are skipped', async () => {
    prisma.role.findUnique.mockResolvedValue({ role: 'pending' })

    const { req, res, next } = await runMiddleware({ skipDomainCheck: true })

    expect(res.status).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
    expect(req.user).toEqual({
      email: 'partner@example.com',
      name: 'Partner Scout',
      picture: 'https://example.com/avatar.png',
    })
  })

  it('can authenticate blocked users for status-only routes when explicitly allowed', async () => {
    prisma.role.findUnique.mockResolvedValue({ role: 'blocked' })

    const { req, res, next } = await runMiddleware({ skipDomainCheck: true, allowBlocked: true })

    expect(res.status).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledTimes(1)
    expect(req.user.email).toBe('partner@example.com')
  })
})
