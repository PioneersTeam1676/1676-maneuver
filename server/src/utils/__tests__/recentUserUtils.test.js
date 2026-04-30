'use strict'

const { upsertRecentUser } = require('../recentUserUtils')

const createPrisma = (existing = null) => ({
  recentUser: {
    findUnique: jest.fn().mockResolvedValue(existing),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
})

describe('upsertRecentUser', () => {
  it('stores signup profile details when creating a recent user', async () => {
    const prisma = createPrisma()

    await upsertRecentUser(prisma, {
      email: ' Scout@Example.com ',
      displayName: ' Scout Name ',
      firstName: ' Scout ',
      lastName: ' Name ',
      teamNumber: ' 1676 ',
    })

    expect(prisma.recentUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'scout@example.com',
        displayName: 'Scout Name',
        firstName: 'Scout',
        lastName: 'Name',
        teamNumber: '1676',
      }),
    })
  })

  it('preserves existing profile details when an update omits them', async () => {
    const prisma = createPrisma({
      email: 'scout@example.com',
      firstSeenAt: '2026-01-01T00:00:00.000Z',
      lastSeenAt: '2026-01-02T00:00:00.000Z',
      acknowledged: false,
      displayName: 'Scout Name',
      photoUrl: null,
      firstName: 'Scout',
      lastName: 'Name',
      teamNumber: '1676',
    })

    await upsertRecentUser(prisma, {
      email: 'scout@example.com',
      lastSeenAt: '2026-01-03T00:00:00.000Z',
    })

    expect(prisma.recentUser.update).toHaveBeenCalledWith({
      where: { email: 'scout@example.com' },
      data: expect.objectContaining({
        displayName: 'Scout Name',
        firstName: 'Scout',
        lastName: 'Name',
        teamNumber: '1676',
      }),
    })
  })
})
