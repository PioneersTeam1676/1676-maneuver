const express = require("express")
const { prisma } = require("../db")
const asyncHandler = require("../utils/asyncHandler")
const { nowSeconds } = require("../utils/dbUtils")

const router = express.Router()

const validRoles = new Set(["pending", "scout", "lead", "form_maker", "admin", "ultra_admin"])

const parseIsoDate = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const upsertRecentUser = async ({ email, firstSeenAt, lastSeenAt, acknowledged }) => {
  const existing = await prisma.recentUser.findUnique({ where: { email } })
  if (!existing) {
    return prisma.recentUser.create({
      data: {
        email,
        firstSeenAt,
        lastSeenAt,
        acknowledged: acknowledged ? true : false,
      }
    })
  }

  const existingFirst = parseIsoDate(existing.firstSeenAt) || new Date(firstSeenAt)
  const existingLast = parseIsoDate(existing.lastSeenAt) || new Date(lastSeenAt)
  const nextFirst = parseIsoDate(firstSeenAt) || existingFirst
  const nextLast = parseIsoDate(lastSeenAt) || existingLast

  const first = existingFirst <= nextFirst ? existing.firstSeenAt : firstSeenAt
  const last = existingLast >= nextLast ? existing.lastSeenAt : lastSeenAt
  const nextAck = existing.acknowledged || acknowledged

  return prisma.recentUser.update({
    where: { email },
    data: {
      firstSeenAt: first,
      lastSeenAt: last,
      acknowledged: nextAck,
    }
  })
}

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.role.findMany({
      select: { email: true, role: true }
    })
    const roleAssignments = rows.reduce((acc, row) => {
      acc[row.email] = row.role
      return acc
    }, {})
    res.json({ roleAssignments })
  })
)

router.get(
  "/:email",
  asyncHandler(async (req, res) => {
    const { email } = req.params
    const row = await prisma.role.findUnique({ where: { email: email.toLowerCase() } })
    if (!row) {
      return res.status(404).json({ error: "Role not found" })
    }
    res.json({ email: row.email, role: row.role })
  })
)

router.put(
  "/:email",
  asyncHandler(async (req, res) => {
    const { email } = req.params
    const { role } = req.body

    console.log(`PUT /roles/${email}`, { body: req.body, role, validRoles: Array.from(validRoles) })

    if (!role) {
      return res.status(400).json({ error: "Role is required", received: req.body })
    }

    if (!validRoles.has(role)) {
      return res.status(400).json({
        error: "Invalid role",
        received: role,
        valid: Array.from(validRoles)
      })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const timestamp = nowSeconds()

    await prisma.role.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        role,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      update: {
        role,
        updatedAt: timestamp,
      }
    })

    const isoTimestamp = new Date().toISOString()
    const acknowledged = role === "pending" ? false : true
    await upsertRecentUser({
      email: normalizedEmail,
      firstSeenAt: isoTimestamp,
      lastSeenAt: isoTimestamp,
      acknowledged,
    })

    if (role !== "pending") {
      const verifiedAt = nowSeconds()
      await prisma.verifiedUser.create({
        data: {
          email: normalizedEmail,
          role,
          verifiedAt,
        }
      })
    }

    res.json({ success: true, email: normalizedEmail, role })
  })
)

router.delete(
  "/:email",
  asyncHandler(async (req, res) => {
    const { email } = req.params
    const normalizedEmail = email.trim().toLowerCase()
    const info = await prisma.role.deleteMany({ where: { email: normalizedEmail } })
    res.json({ success: info.count > 0 })
  })
)

module.exports = router
