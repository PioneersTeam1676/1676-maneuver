'use strict'

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
}))

jest.mock('../../db', () => ({
  prisma: {
    pushSubscription: {
      findMany: jest.fn(),
    },
  },
}))

jest.mock('../../seasonDb', () => ({
  getSeasonPrisma: jest.fn(),
  resolveSeasonSelector: jest.fn().mockReturnValue({}),
}))

const { getSeasonPrisma } = require('../../seasonDb')
const { getMyAssignments } = require('../scheduleNotifications')

function makeSeasonPrisma({ assignments = [], overrides = [] } = {}) {
  return {
    prisma: {
      scoutScheduleAssignment: {
        findMany: jest.fn().mockResolvedValue(assignments),
      },
      $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
      $queryRawUnsafe: jest.fn().mockResolvedValue(overrides),
    },
  }
}

describe('schedule notifications assignments', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('maps overlap previous-position assignments to the real player station', async () => {
    getSeasonPrisma.mockResolvedValue(makeSeasonPrisma({
      assignments: [
        {
          eventKey: '2026test',
          matchNumber: 'qm8',
          matchOrder: 8,
          position: 'red-2-prev',
          scoutEmail: 'scout@pascack.org',
          startTime: null,
        },
      ],
    }))

    const assignments = await getMyAssignments({
      eventKey: '2026test',
      email: 'Scout@Pascack.org',
    })

    expect(assignments).toEqual([
      {
        matchNumber: 'qm8',
        matchOrder: 8,
        position: 'red-2',
        alliance: 'red',
        slotIndex: 1,
      },
    ])
  })
})
