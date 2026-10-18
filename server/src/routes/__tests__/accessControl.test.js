'use strict'

// End-to-end authorization rules for the scouting and pit data routes: real
// auth middleware + real routers, only the database mocked.

const mockRoles = new Map()
// Who submitted each stored entry: table -> id -> scout_email
const mockOwners = { scouting_entries: new Map(), pit_entries: new Map() }

const mockSeasonPrisma = {
  scoutingEntry: { upsert: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
  pitEntry: { upsert: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
  eventSetting: { findUnique: jest.fn() },
  $queryRawUnsafe: jest.fn(async (sql, ...params) => {
    if (/^SHOW COLUMNS/i.test(sql)) return [{ Field: 'client_id' }]
    const table = /FROM (scouting_entries|pit_entries)/.exec(sql)?.[1]
    if (table && /scout_email/.test(sql)) {
      return params
        .filter((id) => mockOwners[table].has(id))
        .map((id) => ({ entry_id: id, scout_email: mockOwners[table].get(id) }))
    }
    return []
  }),
  $executeRawUnsafe: jest.fn(async () => 0),
  $transaction: jest.fn(async (ops) => Promise.all(ops)),
}

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({ verifyIdToken: jest.fn() })),
}))
jest.mock('../../db', () => ({
  prisma: {
    role: { findUnique: jest.fn(async ({ where }) => (mockRoles.has(where.email) ? { role: mockRoles.get(where.email) } : null)) },
  },
}))
jest.mock('../../utils/recentUserUtils', () => ({ upsertRecentUser: jest.fn(async () => {}) }))
jest.mock('../../seasonDb', () => ({
  getSeasonPrisma: jest.fn(async () => ({ prisma: mockSeasonPrisma })),
  resolveSeasonSelector: jest.fn((selector) => ({ year: 2026, ...selector })),
}))
jest.mock('../../utils/entryIdentity', () => ({
  ...jest.requireActual('../../utils/entryIdentity'),
  ensureEntryIdentitySchema: jest.fn(async () => {}),
  updateScoutingEntryEmail: jest.fn(async () => {}),
  updatePitEntryEmail: jest.fn(async () => {}),
}))
jest.mock('../../utils/userRegistration', () => ({ ensureScoutRegistration: jest.fn(async () => {}) }))
jest.mock('../../utils/imagePermalinkStore', () => ({ replaceImageDataUrls: jest.fn(async (data) => data) }))
jest.mock('../../services/outlierDetection', () => ({ detectOutliers: jest.fn(async () => []) }))

const express = require('express')
const { signAppToken } = require('../../utils/appJwt')

const SCOUT = 'scout.one@pascack.org'
const OTHER_SCOUT = 'scout.two@pascack.org'
const LEAD = 'lead.person@pascack.org'
const OUTSIDER = 'someone@gmail.com'
const PARTNER = 'partner.scout@gmail.com' // outside account a lead approved

const token = (email) => signAppToken({ email }).token

let server
let baseUrl
let rescueOpen = false

beforeAll(async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client'
  const { createApiAuthMiddleware, createScoutWriteAuthMiddleware } = require('../../middleware/apiAuth')
  const scoutDataAuth = createApiAuthMiddleware({ allowPendingRole: true })
  const scoutWriteAuth = createScoutWriteAuthMiddleware(scoutDataAuth, { isRescueOpen: () => rescueOpen })
  const app = express()
  app.use(express.json())
  app.use('/scouting', scoutWriteAuth, require('../scouting'))
  app.use('/pit', scoutDataAuth, require('../pit'))
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

beforeEach(() => {
  jest.clearAllMocks()
  rescueOpen = false
  mockRoles.clear()
  mockRoles.set(LEAD, 'lead')
  mockRoles.set(PARTNER, 'scout')
  mockOwners.scouting_entries.clear()
  mockOwners.pit_entries.clear()
  mockSeasonPrisma.scoutingEntry.findMany.mockResolvedValue([])
  mockSeasonPrisma.scoutingEntry.upsert.mockResolvedValue({})
  mockSeasonPrisma.scoutingEntry.deleteMany.mockResolvedValue({ count: 1 })
  mockSeasonPrisma.pitEntry.findMany.mockResolvedValue([])
  mockSeasonPrisma.pitEntry.upsert.mockResolvedValue({})
  mockSeasonPrisma.pitEntry.deleteMany.mockResolvedValue({ count: 1 })
  mockSeasonPrisma.eventSetting.findUnique.mockResolvedValue(null)
})

const request = async (method, path, { as, body } = {}) => {
  const headers = { 'content-type': 'application/json' }
  if (as) headers.authorization = `Bearer ${token(as)}`
  const res = await fetch(baseUrl + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  return res.status
}

const entry = (id) => ({ id, eventName: '2026njfla', data: { selectTeam: '1676', matchNumber: '3', eventName: '2026njfla' } })

describe('reading scouting and pit data', () => {
  it('is refused for an outside account no lead has approved', async () => {
    expect(await request('GET', '/scouting', { as: OUTSIDER })).toBe(403)
    expect(await request('POST', '/scouting/query', { as: OUTSIDER, body: { filters: {} } })).toBe(403)
    expect(await request('GET', '/scouting/export', { as: OUTSIDER })).toBe(403)
    expect(await request('GET', '/scouting/export/rebuilt', { as: OUTSIDER })).toBe(403)
    expect(await request('GET', '/pit', { as: OUTSIDER })).toBe(403)
    expect(mockSeasonPrisma.scoutingEntry.findMany).not.toHaveBeenCalled()
    expect(mockSeasonPrisma.pitEntry.findMany).not.toHaveBeenCalled()
  })

  it('is allowed for team accounts and approved outside accounts', async () => {
    expect(await request('GET', '/scouting', { as: SCOUT })).toBe(200)
    expect(await request('GET', '/scouting', { as: PARTNER })).toBe(200)
    expect(await request('GET', '/pit', { as: SCOUT })).toBe(200)
  })

  it('is refused without any credentials even when rescue mode is on', async () => {
    rescueOpen = true
    expect(await request('GET', '/scouting')).toBe(401)
  })
})

describe('submitting scouting data', () => {
  it('still works for an unapproved account, so no match gets stuck', async () => {
    expect(await request('POST', '/scouting', { as: OUTSIDER, body: { entry: entry('new-1') } })).toBe(201)
    expect(mockSeasonPrisma.scoutingEntry.upsert).toHaveBeenCalledTimes(1)
  })

  it("never lets an unapproved account overwrite someone else's entry", async () => {
    mockOwners.scouting_entries.set('taken-1', SCOUT)
    expect(await request('POST', '/scouting', { as: OUTSIDER, body: { entry: entry('taken-1') } })).toBe(403)
    expect(await request('POST', '/scouting/bulk', { as: OUTSIDER, body: { entries: [entry('new-2'), entry('taken-1')] } })).toBe(403)
    expect(mockSeasonPrisma.scoutingEntry.upsert).not.toHaveBeenCalled()
  })

  it('lets an unapproved account re-send its own entry (retries are upserts)', async () => {
    mockOwners.scouting_entries.set('mine-1', OUTSIDER)
    expect(await request('POST', '/scouting', { as: OUTSIDER, body: { entry: entry('mine-1') } })).toBe(201)
  })

  it('lets approved scouts re-upload entries they merged from the server', async () => {
    mockOwners.scouting_entries.set('taken-1', OTHER_SCOUT)
    expect(await request('POST', '/scouting/bulk', { as: SCOUT, body: { entries: [entry('taken-1')] } })).toBe(201)
  })

  it('in rescue mode accepts anonymous new entries but never anonymous overwrites', async () => {
    rescueOpen = true
    expect(await request('POST', '/scouting', { body: { entry: entry('anon-new') } })).toBe(201)
    mockOwners.scouting_entries.set('taken-1', SCOUT)
    expect(await request('POST', '/scouting', { body: { entry: entry('taken-1') } })).toBe(403)
    expect(await request('POST', '/scouting/bulk', { body: { entries: [entry('taken-1')] } })).toBe(403)
  })
})

describe('deleting data', () => {
  it('a single scouting entry can only be deleted by a lead', async () => {
    expect(await request('DELETE', '/scouting/abc', { as: OUTSIDER })).toBe(403)
    expect(await request('DELETE', '/scouting/abc', { as: SCOUT })).toBe(403)
    expect(await request('DELETE', '/scouting/abc', { as: LEAD })).toBe(200)
  })

  it('a pit entry can be deleted by the scout who submitted it or a lead', async () => {
    mockOwners.pit_entries.set('pit-1', SCOUT)
    expect(await request('DELETE', '/pit/pit-1', { as: OTHER_SCOUT })).toBe(403)
    expect(await request('DELETE', '/pit/pit-1', { as: OUTSIDER })).toBe(403)
    expect(await request('DELETE', '/pit/pit-1', { as: SCOUT })).toBe(200)
    expect(await request('DELETE', '/pit/pit-1', { as: LEAD })).toBe(200)
  })
})
