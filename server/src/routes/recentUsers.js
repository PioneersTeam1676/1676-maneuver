const express = require("express")
const router = express.Router()
const { prisma } = require("../db")
const asyncHandler = require("../utils/asyncHandler")
const { sendManualNotification } = require("../services/scheduleNotifications")

const MAX_RECENT_USERS = 200

const sanitizeString = (value) => {
  if (typeof value !== "string") return ""
  return value.trim()
}

const mapRowToRecord = (row) => ({
  email: row.email,
  firstSeenAt: row.firstSeenAt,
  lastSeenAt: row.lastSeenAt,
  acknowledged: row.acknowledged === true,
  displayName: row.displayName || null,
  photoUrl: row.photoUrl || null,
})

const parseIso = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

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

    const firstSeen = sanitizeString(firstSeenAt) || new Date().toISOString()
    const lastSeen = sanitizeString(lastSeenAt) || firstSeen
    const trimmedName = sanitizeString(displayName)
    const trimmedPhoto = sanitizeString(photoUrl)
    const ackValue = acknowledged === true || acknowledged === "true" || acknowledged === 1

    const existing = await prisma.recentUser.findUnique({ where: { email: normalizedEmail } })

    if (!existing) {
      const created = await prisma.recentUser.create({
        data: {
          email: normalizedEmail,
          firstSeenAt: firstSeen,
          lastSeenAt: lastSeen,
          acknowledged: ackValue,
          displayName: trimmedName || null,
          photoUrl: trimmedPhoto || null,
        }
      })

      // Notify admins of new unacknowledged users
      if (!ackValue) {
        try {
          const adminRoles = await prisma.role.findMany({
            where: { role: { in: ["lead", "tech_lead"] } },
          })
          const label = trimmedName || normalizedEmail
          await Promise.allSettled(
            adminRoles.map((r) =>
              sendManualNotification({
                email: r.email,
                title: "New Account Request",
                body: `${label} is requesting access`,
                url: "/verification-center",
                tag: `new-user-${normalizedEmail}`,
              })
            )
          )
        } catch (pushError) {
          console.warn("Failed to notify admins of new user:", pushError.message)
        }
      }

      return res.json({ recentUser: mapRowToRecord(created) })
    }

    const existingFirst = parseIso(existing.firstSeenAt) || new Date(firstSeen)
    const existingLast = parseIso(existing.lastSeenAt) || new Date(lastSeen)
    const incomingFirst = parseIso(firstSeen) || existingFirst
    const incomingLast = parseIso(lastSeen) || existingLast

    const nextFirst = existingFirst <= incomingFirst ? existing.firstSeenAt : firstSeen
    const nextLast = existingLast >= incomingLast ? existing.lastSeenAt : lastSeen
    const nextAck = existing.acknowledged || ackValue

    const updated = await prisma.recentUser.update({
      where: { email: normalizedEmail },
      data: {
        firstSeenAt: nextFirst,
        lastSeenAt: nextLast,
        acknowledged: nextAck,
        displayName: trimmedName ? trimmedName : existing.displayName,
        photoUrl: trimmedPhoto ? trimmedPhoto : existing.photoUrl,
      }
    })

    res.json({ recentUser: mapRowToRecord(updated) })
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

module.exports = router
