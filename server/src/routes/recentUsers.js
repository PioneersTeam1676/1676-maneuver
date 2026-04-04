const express = require("express")
const router = express.Router()
const { prisma } = require("../db")
const asyncHandler = require("../utils/asyncHandler")
const { sanitizeString, upsertRecentUser } = require("../utils/recentUserUtils")
const { ensureScoutRegistration } = require("../utils/userRegistration")

const MAX_RECENT_USERS = 200

const mapRowToRecord = (row) => ({
  email: row.email,
  firstSeenAt: row.firstSeenAt,
  lastSeenAt: row.lastSeenAt,
  acknowledged: row.acknowledged === true,
  displayName: row.displayName || null,
  photoUrl: row.photoUrl || null,
})

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.recentUser.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: MAX_RECENT_USERS,
    })

    res.json({ recentUsers: rows.map(mapRowToRecord) })
  })
)

router.put(
  "/:email",
  asyncHandler(async (req, res) => {
    const { email } = req.params
    const normalizedEmail = sanitizeString(email).toLowerCase()
    if (!normalizedEmail) {
      return res.status(400).json({ error: "Email is required" })
    }

    const {
      firstSeenAt,
      lastSeenAt,
      acknowledged = false,
      displayName,
      photoUrl,
    } = req.body || {}

    const existing = await prisma.recentUser.findUnique({ where: { email: normalizedEmail } })

    if (!existing) {
      const created = await upsertRecentUser(prisma, {
        email: normalizedEmail,
        firstSeenAt,
        lastSeenAt,
        acknowledged,
        displayName,
        photoUrl,
      })

      await ensureScoutRegistration({
        email: normalizedEmail,
        displayName,
        photoUrl,
      })

      return res.json({ recentUser: mapRowToRecord(created) })
    }

    const updated = await upsertRecentUser(prisma, {
      email: normalizedEmail,
      firstSeenAt,
      lastSeenAt,
      acknowledged,
      displayName,
      photoUrl,
    })

    await ensureScoutRegistration({
      email: normalizedEmail,
      displayName,
      photoUrl,
    })

    res.json({ recentUser: mapRowToRecord(updated) })
  })
)

router.post(
  "/self-register-role",
  asyncHandler(async (req, res) => {
    const normalizedEmail = sanitizeString(req.user?.email).toLowerCase()
    if (!normalizedEmail) {
      return res.status(401).json({ error: "Not authenticated" })
    }

    const existingRole = await prisma.role.findUnique({
      where: { email: normalizedEmail },
      select: { role: true },
    })

    const role = await ensureScoutRegistration({
      email: normalizedEmail,
      displayName: req.user?.name,
      photoUrl: req.user?.picture,
    })

    const registered = !existingRole || existingRole.role === "pending"

    res.json({ email: normalizedEmail, role, registered })
  })
)

router.patch(
  "/:email",
  asyncHandler(async (req, res) => {
    const { email } = req.params
    const normalizedEmail = sanitizeString(email).toLowerCase()
    if (!normalizedEmail) {
      return res.status(400).json({ error: "Email is required" })
    }

    const { acknowledged } = req.body || {}
    if (typeof acknowledged === "undefined") {
      return res.status(400).json({ error: "acknowledged field required" })
    }

    const ackValue = acknowledged === true || acknowledged === "true" || acknowledged === 1

    const info = await prisma.recentUser.updateMany({
      where: { email: normalizedEmail },
      data: {
        acknowledged: ackValue,
      }
    })

    if (info.count === 0) {
      return res.status(404).json({ error: "Record not found" })
    }

    const row = await prisma.recentUser.findUnique({ where: { email: normalizedEmail } })
    res.json({ recentUser: mapRowToRecord(row) })
  })
)

router.delete(
  "/:email",
  asyncHandler(async (req, res) => {
    const { email } = req.params
    const normalizedEmail = sanitizeString(email).toLowerCase()
    if (!normalizedEmail) {
      return res.status(400).json({ error: "Email is required" })
    }

    const info = await prisma.recentUser.deleteMany({
      where: { email: normalizedEmail },
    })

    res.json({ success: info.count > 0 })
  })
)

module.exports = router
