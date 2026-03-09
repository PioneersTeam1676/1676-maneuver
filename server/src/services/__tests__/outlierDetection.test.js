'use strict'

// jest, describe, it, expect, beforeEach are globals injected by Jest in CJS mode.
// We do not need to import them from @jest/globals.

// Mock the seasonDb module (path is relative to outlierDetection.js, but jest.mock
// resolves relative to the test file's directory — use the module path as seen from
// outlierDetection.js, which lives one directory up from __tests__)
jest.mock('../../seasonDb', () => ({
  getSeasonPrisma: jest.fn(),
  resolveSeasonSelector: jest.fn().mockReturnValue({}),
}))

const { detectOutliers } = require('../outlierDetection')
const { getSeasonPrisma, resolveSeasonSelector } = require('../../seasonDb')

// Helper: build a mock { prisma } object matching what getSeasonPrisma resolves to
function makePrisma({ entries = [], assignments = [] } = {}) {
  return {
    prisma: {
      scoutingEntry: {
        findMany: jest.fn().mockResolvedValue(entries),
      },
      scoutScheduleAssignment: {
        findMany: jest.fn().mockResolvedValue(assignments),
      },
    },
  }
}

describe('detectOutliers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // resolveSeasonSelector is synchronous; reset to return a plain selector object
    resolveSeasonSelector.mockReturnValue({})
  })

  it('returns empty array when there are no entries', async () => {
    getSeasonPrisma.mockResolvedValue(makePrisma())
    const result = await detectOutliers({ eventKey: '2025test' })
    expect(result).toEqual([])
  })

  it('returns empty array when scout submitted correct match', async () => {
    getSeasonPrisma.mockResolvedValue(makePrisma({
      entries: [{
        id: 'e1',
        scoutName: 'alice@team.com',
        matchNumber: '5',
        alliance: 'red',
        timestamp: 1000,
      }],
      assignments: [{
        scoutEmail: 'alice@team.com',
        matchNumber: 'qm5',
        matchOrder: 5,
      }],
    }))
    const result = await detectOutliers({ eventKey: '2025test' })
    expect(result).toHaveLength(0)
  })

  it('handles "qm5" vs "5" digit normalization correctly — should NOT be flagged', async () => {
    getSeasonPrisma.mockResolvedValue(makePrisma({
      entries: [{
        id: 'e1',
        scoutName: 'alice@team.com',
        matchNumber: '5',
        alliance: 'red',
        timestamp: 1000,
      }],
      assignments: [{
        scoutEmail: 'alice@team.com',
        matchNumber: 'qm5',
        matchOrder: 5,
      }],
    }))
    const result = await detectOutliers({ eventKey: '2025test' })
    expect(result).toHaveLength(0)
  })

  it('flags entry when scout submitted wrong match number', async () => {
    getSeasonPrisma.mockResolvedValue(makePrisma({
      entries: [{
        id: 'e1',
        scoutName: 'alice@team.com',
        matchNumber: '7',
        alliance: 'red',
        timestamp: 1000,
      }],
      assignments: [{
        scoutEmail: 'alice@team.com',
        matchNumber: 'qm5',
        matchOrder: 5,
      }],
    }))
    const result = await detectOutliers({ eventKey: '2025test' })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      entryId: 'e1',
      scoutEmail: 'alice@team.com',
      reportedMatch: '7',
      expectedMatches: ['qm5'],
      likelyCorrectMatch: 'qm5',
    })
  })

  it('skips entries where scout has no schedule assignment', async () => {
    getSeasonPrisma.mockResolvedValue(makePrisma({
      entries: [{
        id: 'e1',
        scoutName: 'unknown@team.com',
        matchNumber: '3',
        alliance: 'blue',
        timestamp: 1000,
      }],
      assignments: [{
        scoutEmail: 'alice@team.com',
        matchNumber: 'qm3',
        matchOrder: 3,
      }],
    }))
    const result = await detectOutliers({ eventKey: '2025test' })
    expect(result).toHaveLength(0)
  })

  it('picks likelyCorrectMatch with lowest matchOrder when multiple assignments', async () => {
    getSeasonPrisma.mockResolvedValue(makePrisma({
      entries: [{
        id: 'e1',
        scoutName: 'alice@team.com',
        matchNumber: '99',
        alliance: 'red',
        timestamp: 1000,
      }],
      assignments: [
        { scoutEmail: 'alice@team.com', matchNumber: 'qm10', matchOrder: 10 },
        { scoutEmail: 'alice@team.com', matchNumber: 'qm3', matchOrder: 3 },
        { scoutEmail: 'alice@team.com', matchNumber: 'qm7', matchOrder: 7 },
      ],
    }))
    const result = await detectOutliers({ eventKey: '2025test' })
    expect(result).toHaveLength(1)
    expect(result[0].likelyCorrectMatch).toBe('qm3') // lowest matchOrder
  })

  it('includes timestamp in flagged entries', async () => {
    getSeasonPrisma.mockResolvedValue(makePrisma({
      entries: [{
        id: 'e1',
        scoutName: 'alice@team.com',
        matchNumber: '99',
        alliance: 'red',
        timestamp: 1710000000,
      }],
      assignments: [
        { scoutEmail: 'alice@team.com', matchNumber: 'qm5', matchOrder: 5 },
      ],
    }))
    const result = await detectOutliers({ eventKey: '2025test' })
    expect(result[0].timestamp).toBe(1710000000)
  })

  it('flags multiple wrong-match entries independently', async () => {
    getSeasonPrisma.mockResolvedValue(makePrisma({
      entries: [
        { id: 'e1', scoutName: 'alice@team.com', matchNumber: '99', alliance: 'red', timestamp: 100 },
        { id: 'e2', scoutName: 'bob@team.com', matchNumber: '99', alliance: 'blue', timestamp: 200 },
      ],
      assignments: [
        { scoutEmail: 'alice@team.com', matchNumber: 'qm5', matchOrder: 5 },
        { scoutEmail: 'bob@team.com', matchNumber: 'qm6', matchOrder: 6 },
      ],
    }))
    const result = await detectOutliers({ eventKey: '2025test' })
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.entryId).sort()).toEqual(['e1', 'e2'])
  })

  it('does not flag an entry that matches one of multiple assigned matches', async () => {
    getSeasonPrisma.mockResolvedValue(makePrisma({
      entries: [{
        id: 'e1',
        scoutName: 'alice@team.com',
        matchNumber: '7',
        alliance: 'red',
        timestamp: 1000,
      }],
      assignments: [
        { scoutEmail: 'alice@team.com', matchNumber: 'qm5', matchOrder: 5 },
        { scoutEmail: 'alice@team.com', matchNumber: 'qm7', matchOrder: 7 },
      ],
    }))
    const result = await detectOutliers({ eventKey: '2025test' })
    expect(result).toHaveLength(0)
  })

  it('passes eventKey through resolveSeasonSelector', async () => {
    getSeasonPrisma.mockResolvedValue(makePrisma())
    await detectOutliers({ eventKey: '2026testEvent' })
    expect(resolveSeasonSelector).toHaveBeenCalledWith({ eventKey: '2026testEvent' })
  })
})
