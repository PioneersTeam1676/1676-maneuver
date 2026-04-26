'use strict'

jest.mock('../../db', () => ({
  prisma: {
    role: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    verifiedUser: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    recentUser: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    rescouterPermission: {
      deleteMany: jest.fn(),
    },
    pushSubscription: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((operations) => Promise.all(operations)),
  },
}))

jest.mock('../../seasonDb', () => ({
  getSeasonPrisma: jest.fn(),
  resolveSeasonSelector: jest.fn().mockReturnValue({}),
}))

const express = require('express')
const http = require('http')
const rolesRouter = require('../roles')
const { prisma } = require('../../db')

const createApp = (user) => {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => {
    req.user = user
    next()
  })
  app.use('/roles', rolesRouter)
  return app
}

const request = async (app, path, options = {}) => {
  const server = http.createServer(app)
  await new Promise((resolve) => server.listen(0, resolve))
  const { port } = server.address()
  try {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    })
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

describe('roles routes', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('rejects role assignment listing for authenticated users below lead', async () => {
    prisma.role.findUnique.mockResolvedValue({ role: 'pending' })
    prisma.role.findMany.mockResolvedValue([{ email: 'admin@example.com', role: 'tech_lead' }])

    const response = await request(createApp({ email: 'scout@example.com' }), '/roles')

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'Lead access required' })
    expect(prisma.role.findMany).not.toHaveBeenCalled()
  })

  it('allows lead users to list role assignments', async () => {
    prisma.role.findUnique.mockResolvedValue({ role: 'lead' })
    prisma.role.findMany.mockResolvedValue([
      { email: 'lead@example.com', role: 'lead' },
      { email: 'scout@example.com', role: 'scout' },
    ])

    const response = await request(createApp({ email: 'lead@example.com' }), '/roles')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      roleAssignments: {
        'lead@example.com': 'lead',
        'scout@example.com': 'scout',
      },
    })
  })

  it('rejects role changes from authenticated users below lead', async () => {
    prisma.role.findUnique.mockResolvedValue({ role: 'scout' })

    const response = await request(createApp({ email: 'scout@example.com' }), '/roles/scout@example.com', {
      method: 'PUT',
      body: JSON.stringify({ role: 'scout' }),
    })

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'Lead access required' })
    expect(prisma.role.upsert).not.toHaveBeenCalled()
  })

  it('allows lead users to grant scout access', async () => {
    prisma.role.findUnique
      .mockResolvedValueOnce({ role: 'lead' })
      .mockResolvedValueOnce(null)
    prisma.role.upsert.mockResolvedValue({})
    prisma.recentUser.findUnique.mockResolvedValue(null)
    prisma.recentUser.create.mockResolvedValue({})
    prisma.verifiedUser.create.mockResolvedValue({})

    const response = await request(createApp({ email: 'lead@example.com' }), '/roles/scout@example.com', {
      method: 'PUT',
      body: JSON.stringify({ role: 'scout' }),
    })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ success: true, email: 'scout@example.com', role: 'scout' })
    expect(prisma.role.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { email: 'scout@example.com' },
      create: expect.objectContaining({ email: 'scout@example.com', role: 'scout' }),
      update: expect.objectContaining({ role: 'scout' }),
    }))
  })

  it('rejects lead users demoting another lead', async () => {
    prisma.role.findUnique
      .mockResolvedValueOnce({ role: 'lead' })
      .mockResolvedValueOnce({ role: 'lead' })

    const response = await request(createApp({ email: 'lead@example.com' }), '/roles/other-lead@example.com', {
      method: 'PUT',
      body: JSON.stringify({ role: 'blocked' }),
    })

    expect(response.status).toBe(403)
    expect(response.body).toEqual({ error: 'Tech lead access required' })
    expect(prisma.role.upsert).not.toHaveBeenCalled()
  })

  it('hard-deletes account records when removing a user', async () => {
    prisma.role.findUnique
      .mockResolvedValueOnce({ role: 'tech_lead' })
      .mockResolvedValueOnce({ role: 'scout' })
    prisma.role.deleteMany.mockResolvedValue({ count: 1 })
    prisma.verifiedUser.deleteMany.mockResolvedValue({ count: 2 })
    prisma.recentUser.deleteMany.mockResolvedValue({ count: 1 })
    prisma.rescouterPermission.deleteMany.mockResolvedValue({ count: 1 })
    prisma.pushSubscription.deleteMany.mockResolvedValue({ count: 3 })

    const response = await request(createApp({ email: 'admin@example.com' }), '/roles/scout@example.com', {
      method: 'DELETE',
    })

    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      success: true,
      email: 'scout@example.com',
      deleted: {
        roles: 1,
        verifiedUsers: 2,
        recentUsers: 1,
        rescouterPermissions: 1,
        pushSubscriptions: 3,
      },
    })
    expect(prisma.recentUser.updateMany).not.toHaveBeenCalled()
  })
})
