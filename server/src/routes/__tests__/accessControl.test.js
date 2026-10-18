'use strict'

// End-to-end authorization rules for the scouting and pit data routes: real
// auth middleware + real routers, only the database mocked.

const mockRoles = new Map()
// Who submitted each stored entry: table -> id -> scout_email
const mockOwners = { scouting_entries: new Map(), pit_entries: new Map() }
// Stored scouting rows by numeric primary key: id -> { clientId, scout_email }
const mockScoutingRows = new Map()

const mockSeasonPrisma = {
  scoutingEntry: { upsert: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
  pitEntry: { upsert: jest.fn(), findMany: jest.fn(), deleteMany: jest.fn() },
  eventSetting: { findUnique: jest.fn() },
  $queryRawUnsafe: jest.fn(async (sql, ...params) => {
    if (/^SHOW COLUMNS/i.test(sql)) return [{ Field: 'client_id' }]
    const table = /FROM (scouting_entries|pit_entries)/.exec(sql)?.[1]
    // Scouting delete: "... WHERE id IN (?, ...) AND scout_email = ?" over
    // resolved primary keys (email is the last param).
    if (table === 'scouting_entries' && /WHERE id IN \(/.test(sql)) {
      const email = params[params.length - 1]
      return params.slice(0, -1).filter((id) => mockScoutingRows.get(Number(id))?.scout_email === email).map((id) => ({ id }))
    }
    // "(client_id = ? OR id = ?) AND scout_email = ?" evaluated like SQL would.
    if (table === 'scouting_entries' && /client_id = \? OR id = \?/.test(sql)) {
      const [clientId, numericId, email] = params
      return [...mockScoutingRows.entries()]
        .filter(([id, row]) => (row.clientId === clientId || id === numericId) && row.scout_email === email)
        .map(([id]) => ({ id }))
    }
    // Delete routes' ownership check: "... WHERE <id match> AND scout_email = ?"
    // (id is the first param, the requester's email the last).
    if (table && /scout_email = \?/.test(sql)) {
      const id = String(params[0])
      const email = params[params.length - 1]
      return mockOwners[table].get(id) === email ? [{ id }] : []
    }
    // Owner lookup: "SELECT <id> AS entry_id, scout_email ... IN (?, ...)".
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
  mockScoutingRows.clear()
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

describe('rescue mode identity', () => {
  it('treats a blocked account as anonymous, so it cannot re-send entries it owned', async () => {
    rescueOpen = true
    const BLOCKED = 'kicked.out@pascack.org'
    mockRoles.set(BLOCKED, 'blocked')
    mockOwners.scouting_entries.set('blocked-own', BLOCKED)
    expect(await request('POST', '/scouting', { as: BLOCKED, body: { entry: entry('blocked-own') } })).toBe(403)
  })

  it('keeps the identity of a normal scout, so they can re-send their own entry', async () => {
    rescueOpen = true
    mockOwners.scouting_entries.set('mine-2', SCOUT)
    expect(await request('POST', '/scouting', { as: SCOUT, body: { entry: entry('mine-2') } })).toBe(201)
  })
})

describe('deleting data', () => {
  // findMany({ where: { clientId } | { OR: [{ clientId }, { id }] } }) over mockScoutingRows.
  const resolveRows = ({ where }) => {
    const clauses = where.OR || [where]
    return [...mockScoutingRows.entries()]
      .filter(([id, row]) => clauses.some((c) => (c.clientId !== undefined && c.clientId === row.clientId) || (c.id !== undefined && c.id === id)))
      .map(([id]) => ({ id }))
  }

  it("a scout cannot delete another scout's entry; a lead can", async () => {
    mockScoutingRows.set(5, { clientId: 'abc', scout_email: OTHER_SCOUT })
    mockSeasonPrisma.scoutingEntry.findMany.mockImplementation(async (args) => resolveRows(args))
    expect(await request('DELETE', '/scouting/abc', { as: OUTSIDER })).toBe(403)
    expect(await request('DELETE', '/scouting/abc', { as: SCOUT })).toBe(403)
    expect(mockSeasonPrisma.scoutingEntry.deleteMany).not.toHaveBeenCalled()
    expect(await request('DELETE', '/scouting/abc', { as: LEAD })).toBe(200)
  })

  it('a scout can delete their own entry, and only that row is deleted', async () => {
    mockScoutingRows.set(9, { clientId: 'mine-9', scout_email: SCOUT })
    mockSeasonPrisma.scoutingEntry.findMany.mockImplementation(async (args) => resolveRows(args))
    expect(await request('DELETE', '/scouting/mine-9', { as: SCOUT })).toBe(200)
    expect(mockSeasonPrisma.scoutingEntry.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [9] } } })
  })

  it("owning client id \"42\" does not let a scout delete someone else's row with numeric id 42", async () => {
    // The id in the URL matches the attacker's own row by client id AND the
    // victim's row by numeric primary key.
    mockScoutingRows.set(42, { clientId: 'victim-entry', scout_email: OTHER_SCOUT })
    mockScoutingRows.set(77, { clientId: '42', scout_email: SCOUT })
    mockSeasonPrisma.scoutingEntry.findMany.mockImplementation(async (args) => resolveRows(args))
    expect(await request('DELETE', '/scouting/42', { as: SCOUT })).toBe(403)
    expect(mockSeasonPrisma.scoutingEntry.deleteMany).not.toHaveBeenCalled()
  })

  it('a pit entry can be deleted by the scout who submitted it or a lead', async () => {
    mockOwners.pit_entries.set('pit-1', SCOUT)
    expect(await request('DELETE', '/pit/pit-1', { as: OTHER_SCOUT })).toBe(403)
    expect(await request('DELETE', '/pit/pit-1', { as: OUTSIDER })).toBe(403)
    expect(await request('DELETE', '/pit/pit-1', { as: SCOUT })).toBe(200)
    expect(await request('DELETE', '/pit/pit-1', { as: LEAD })).toBe(200)
  })
})
