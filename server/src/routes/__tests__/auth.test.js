const mockVerifyIdToken = jest.fn()

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: mockVerifyIdToken })),
}))
jest.mock('../../db', () => ({
  prisma: {
    role: { findUnique: jest.fn() },
    $executeRawUnsafe: jest.fn(),
    $queryRawUnsafe: jest.fn(),
  },
}))

const express = require('express')
const { prisma } = require('../../db')
const { hashRefreshToken, verifyAppToken } = require('../../utils/appJwt')

describe('persistent auth sessions', () => {
  const originalClientId = process.env.GOOGLE_CLIENT_ID
  let server
  let baseUrl
  let sessions

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = 'test-client'
    const app = express()
    app.use(express.json())
    app.use('/auth', require('../auth'))
    server = app.listen(0, '127.0.0.1')
    await new Promise((resolve) => server.once('listening', resolve))
    baseUrl = `http://127.0.0.1:${server.address().port}/auth`
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    if (originalClientId === undefined) delete process.env.GOOGLE_CLIENT_ID
    else process.env.GOOGLE_CLIENT_ID = originalClientId
  })

  beforeEach(() => {
    jest.clearAllMocks()
    sessions = new Map()
    prisma.role.findUnique.mockResolvedValue({ role: 'scout' })
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({ email: 'scout@pascack.org', name: 'Scout', email_verified: true }),
    })
    prisma.$queryRawUnsafe.mockImplementation(async (_sql, tokenHash) => {
      const session = sessions.get(tokenHash)
      return session ? [session] : []
    })
    prisma.$executeRawUnsafe.mockImplementation(async (sql, ...args) => {
      if (sql.startsWith('INSERT')) {
        const [tokenHash, email, name, picture, createdAt, expiresAt] = args
        sessions.set(tokenHash, { email, name, picture, createdAt, expiresAt })
      } else if (sql.startsWith('DELETE')) {
        if (sql.includes('expires_at')) {
          for (const [hash, session] of sessions) {
            if (session.expiresAt < args[0]) sessions.delete(hash)
          }
        } else {
          sessions.delete(args[0])
        }
      }
      return 1
    })
  })

  const post = async (path, body) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: response.status, body: await response.json() }
  }

  it('issues a persistent session without deleting older sessions', async () => {
    sessions.set('older-device', { email: 'other@pascack.org', expiresAt: 1 })
    const { status, body } = await post('/session', { idToken: 'valid-google-token' })
    expect(status).toBe(200)
    expect(body.refreshTokenExpiresAt).toBeNull()
    expect(verifyAppToken(body.accessToken).email).toBe('scout@pascack.org')
    expect(sessions.has('older-device')).toBe(true)
    expect((await post('/refresh', { refreshToken: body.refreshToken })).status).toBe(200)
  })

  it.each([0, Date.now() - 365 * 24 * 60 * 60 * 1000])(
    'renews saved sessions regardless of legacy expiry %s', async (expiresAt) => {
      sessions.set(hashRefreshToken('saved-token'), { email: 'scout@pascack.org', expiresAt })
      const { status, body } = await post('/refresh', { refreshToken: 'saved-token' })
      expect(status).toBe(200)
      expect(verifyAppToken(body.accessToken).email).toBe('scout@pascack.org')
      expect(mockVerifyIdToken).not.toHaveBeenCalled()
    }
  )

  it('rejects a refresh token after logout', async () => {
    const { body } = await post('/session', { idToken: 'valid-google-token' })
    const credential = { refreshToken: body.refreshToken }
    expect((await post('/logout', credential)).status).toBe(200)
    expect((await post('/refresh', credential)).status).toBe(401)
  })

  it('rejects unknown tokens and blocked accounts', async () => {
    expect((await post('/refresh', { refreshToken: 'unknown' })).status).toBe(401)
    sessions.set(hashRefreshToken('blocked-token'), { email: 'scout@pascack.org', expiresAt: 0 })
    prisma.role.findUnique.mockResolvedValue({ role: 'blocked' })
    expect((await post('/refresh', { refreshToken: 'blocked-token' })).status).toBe(403)
    expect((await post('/session', { idToken: 'valid-google-token' })).status).toBe(403)
  })

  it('still requires a valid Google token for initial sign-in', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('invalid token'))
    expect((await post('/session', { idToken: 'invalid-token' })).status).toBe(401)
    expect(sessions.size).toBe(0)
  })
})
