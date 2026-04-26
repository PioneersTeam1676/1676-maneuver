'use strict'

jest.mock('../../db', () => ({
  prisma: {
    role: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    verifiedUser: {
      create: jest.fn(),
    },
  },
}))

jest.mock('../recentUserUtils', () => ({
  sanitizeString: (value) => (typeof value === 'string' ? value.trim() : ''),
  upsertRecentUser: jest.fn(),
}))

const { prisma } = require('../../db')
const { upsertRecentUser } = require('../recentUserUtils')
const { ensureScoutRegistration } = require('../userRegistration')

describe('ensureScoutRegistration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('auto-registers pascack.org users as scouts', async () => {
    prisma.role.findUnique.mockResolvedValue(null)
    prisma.role.create.mockResolvedValue({})
    prisma.verifiedUser.create.mockResolvedValue({})
    upsertRecentUser.mockResolvedValue({})

    const role = await ensureScoutRegistration({
      email: 'Student@Pascack.org',
      displayName: 'Student Scout',
      photoUrl: 'https://example.com/photo.png',
    })

    expect(role).toBe('scout')
    expect(prisma.role.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'student@pascack.org',
        role: 'scout',
      }),
    })
    expect(upsertRecentUser).toHaveBeenCalledWith(prisma, expect.objectContaining({
      email: 'student@pascack.org',
      acknowledged: true,
    }))
    expect(prisma.verifiedUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'student@pascack.org',
        role: 'scout',
      }),
    })
  })

  it('keeps non-pascack users pending until approved', async () => {
    prisma.role.findUnique.mockResolvedValue(null)
    prisma.role.create.mockResolvedValue({})
    upsertRecentUser.mockResolvedValue({})

    const role = await ensureScoutRegistration({
      email: 'partner@example.com',
      displayName: 'Partner Scout',
    })

    expect(role).toBe('pending')
    expect(prisma.role.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'partner@example.com',
        role: 'pending',
      }),
    })
    expect(upsertRecentUser).toHaveBeenCalledWith(prisma, expect.objectContaining({
      email: 'partner@example.com',
      acknowledged: false,
    }))
    expect(prisma.verifiedUser.create).not.toHaveBeenCalled()
  })

  it('upgrades existing pending pascack.org users to scouts', async () => {
    prisma.role.findUnique.mockResolvedValue({ role: 'pending' })
    prisma.role.update.mockResolvedValue({})
    prisma.verifiedUser.create.mockResolvedValue({})
    upsertRecentUser.mockResolvedValue({})

    const role = await ensureScoutRegistration({
      email: 'existing@pascack.org',
      displayName: 'Existing Scout',
    })

    expect(role).toBe('scout')
    expect(prisma.role.update).toHaveBeenCalledWith({
      where: { email: 'existing@pascack.org' },
      data: expect.objectContaining({ role: 'scout' }),
    })
    expect(upsertRecentUser).toHaveBeenCalledWith(prisma, expect.objectContaining({
      email: 'existing@pascack.org',
      acknowledged: true,
    }))
    expect(prisma.verifiedUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'existing@pascack.org',
        role: 'scout',
      }),
    })
  })
})
