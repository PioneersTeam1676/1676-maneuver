'use strict'

// Season database settings are lead-only, including reads. Express matches
// routes case-insensitively, so the guard must too.

const mockRoles = new Map()

jest.mock('../../db', () => ({
  prisma: {
    role: { findUnique: jest.fn(async ({ where }) => (mockRoles.has(where.email) ? { role: mockRoles.get(where.email) } : null)) },
    // Anything past the guard fails loudly, so a 403 can only come from the guard.
    seasonDbConfig: { findUnique: jest.fn(async () => { throw new Error('handler reached') }) },
    formDefinition: { findMany: jest.fn(async () => { throw new Error('handler reached') }) },
    $executeRawUnsafe: jest.fn(async () => 0),
    $queryRawUnsafe: jest.fn(async () => []),
  },
}))
jest.mock('../../utils/mysqlUtils', () => ({ runSql: jest.fn() }))

const express = require('express')
const formsRouter = require('../forms')

let server
let baseUrl

beforeAll(async () => {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = { email: req.get('x-test-user') }
    next()
  })
  app.use('/forms', formsRouter)
  app.use((err, _req, res, _next) => res.status(500).json({ error: String(err.message) }))
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  mockRoles.clear()
  mockRoles.set('lead@pascack.org', 'lead')
})

const get = (path, user) => fetch(baseUrl + path, { headers: { 'x-test-user': user } }).then((r) => r.status)

describe('season database settings', () => {
  it.each(['/forms/seasons/2026/db', '/forms/SEASONS/2026/db', '/forms/Seasons/2026/db'])(
    'refuses a non-lead at %s',
    async (path) => {
      expect(await get(path, 'scout@pascack.org')).toBe(403)
    }
  )

  it('lets a lead through the guard', async () => {
    // Past the guard the mocked handler blows up (500), proving it was reached.
    expect(await get('/forms/SEASONS/2026/db', 'lead@pascack.org')).not.toBe(403)
  })
})
