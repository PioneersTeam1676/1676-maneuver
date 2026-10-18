'use strict'

const mockPrisma = {
  scoutingEntry: {
    upsert: jest.fn(),
    findMany: jest.fn(),
  },
  eventSetting: {
    findUnique: jest.fn(),
  },
  // ensureScoutingIdSchema: report client_id as present so no ALTERs run.
  $queryRawUnsafe: jest.fn(),
  $executeRawUnsafe: jest.fn(),
  $transaction: jest.fn(),
}

jest.mock('../../db', () => ({ prisma: mockPrisma }))
jest.mock('../../seasonDb', () => ({
  getSeasonPrisma: jest.fn(async () => ({ prisma: mockPrisma })),
  resolveSeasonSelector: jest.fn((selector) => ({ year: 2026, ...selector })),
}))
jest.mock('../../utils/entryIdentity', () => ({
  ensureEntryIdentitySchema: jest.fn(async () => {}),
  updateScoutingEntryEmail: jest.fn(async () => {}),
}))
jest.mock('../../utils/userRegistration', () => ({
  ensureScoutRegistration: jest.fn(async () => {}),
}))
jest.mock('../../services/outlierDetection', () => ({
  detectOutliers: jest.fn(async () => []),
}))

const express = require('express')
const http = require('http')
const scoutingRouter = require('../scouting')

const createApp = () => {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    // What apiAuth sets for a signed-in team scout.
    req.user = { email: 'scout@example.com', name: 'Scout' }
    req.authz = { approved: true }
    next()
  })
  app.use('/scouting', scoutingRouter)
  return app
}

const request = async (app, path, options = {}) => {
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, resolve))
  const { port } = server.address()
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

// A submission from a form the server's REBUILT field mapping has never seen
// (e.g. next season's form): every answer lives under an unknown field id.
const unknownFormEntry = (id = 'entry-2027-a') => ({
  id,
  teamNumber: '1676',
  matchNumber: '12',
  alliance: 'red',
  scoutName: 'Alex',
  eventName: '2027njfla',
  timestamp: 1767225600000,
  data: {
    matchNumber: '12',
    alliance: 'red',
    scoutName: 'Alex',
    selectTeam: '1676',
    eventName: '2027njfla',
    recordedAt: '2027-03-01T15:00:00.000Z',
    field_new_game_piece_count: 7,
    field_new_endgame_choice: 'High Rung',
    field_new_notes: 'fast cycles, tipped once',
  },
})

const storedDataFromUpsert = (callIndex = 0) =>
  JSON.parse(mockPrisma.scoutingEntry.upsert.mock.calls[callIndex][0].create.data)

describe('scouting routes keep every submitted field', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.$queryRawUnsafe.mockResolvedValue([{ Field: 'client_id', count: 1 }])
    mockPrisma.$executeRawUnsafe.mockResolvedValue(0)
    mockPrisma.scoutingEntry.upsert.mockResolvedValue({})
    mockPrisma.scoutingEntry.findMany.mockResolvedValue([])
    mockPrisma.$transaction.mockImplementation(async (ops) => Promise.all(ops))
    mockPrisma.eventSetting.findUnique.mockResolvedValue(null)
  })

  it('POST /scouting stores answers to fields outside the REBUILT mapping', async () => {
    const response = await request(createApp(), '/scouting', {
      method: 'POST',
      body: JSON.stringify({ entry: unknownFormEntry() }),
    })

    expect(response.status).toBe(201)
    const stored = storedDataFromUpsert()
    expect(stored.field_new_game_piece_count).toBe(7)
    expect(stored.field_new_endgame_choice).toBe('High Rung')
    expect(stored.field_new_notes).toBe('fast cycles, tipped once')
    // The REBUILT export columns are still written alongside.
    expect(stored['Team Number']).toBe('1676')
    expect(stored['Match Number']).toBe('12')
  })

  it('POST /scouting/bulk stores answers to fields outside the REBUILT mapping', async () => {
    const response = await request(createApp(), '/scouting/bulk', {
      method: 'POST',
      body: JSON.stringify({ entries: [unknownFormEntry('b1'), unknownFormEntry('b2')] }),
    })

    expect(response.status).toBe(201)
    expect(mockPrisma.scoutingEntry.upsert).toHaveBeenCalledTimes(2)
    expect(storedDataFromUpsert(0).field_new_game_piece_count).toBe(7)
    expect(storedDataFromUpsert(1).field_new_notes).toBe('fast cycles, tipped once')
  })

  it('re-uploading a stored entry does not change what is stored', async () => {
    await request(createApp(), '/scouting', {
      method: 'POST',
      body: JSON.stringify({ entry: unknownFormEntry() }),
    })
    const firstStored = storedDataFromUpsert(0)

    // Clients merge server rows back into their cache and can re-send them.
    await request(createApp(), '/scouting', {
      method: 'POST',
      body: JSON.stringify({ entry: { ...unknownFormEntry(), data: firstStored } }),
    })

    expect(storedDataFromUpsert(1)).toEqual(firstStored)
  })

  it('the REBUILT export is identical whether or not raw fields were kept', async () => {
    await request(createApp(), '/scouting', {
      method: 'POST',
      body: JSON.stringify({ entry: unknownFormEntry() }),
    })
    const stored = storedDataFromUpsert()
    const exportResponse = await request(createApp(), '/scouting/export/rebuilt')
    expect(exportResponse.status).toBe(200)
    const headers = exportResponse.body.headers
    // What the old code stored: the REBUILT columns only.
    const rebuiltOnly = Object.fromEntries(headers.filter((h) => h in stored).map((h) => [h, stored[h]]))

    const row = (data) => ({
      id: 1,
      clientId: 'x',
      teamNumber: '1676',
      matchNumber: '12',
      alliance: 'red',
      scoutName: 'Alex',
      eventName: '2027njfla',
      data: JSON.stringify(data),
      timestamp: BigInt(1767225600000),
    })
    mockPrisma.scoutingEntry.findMany.mockResolvedValueOnce([row(stored), row(rebuiltOnly)])
    const both = await request(createApp(), '/scouting/export/rebuilt')

    expect(both.body.rows).toHaveLength(2)
    expect(both.body.rows[0]).toEqual(both.body.rows[1])
  })
})
