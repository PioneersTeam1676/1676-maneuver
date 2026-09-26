const express = require("express")
const router = express.Router()
const { prisma } = require("../db")
const asyncHandler = require("../utils/asyncHandler")
const { sanitizeString, upsertRecentUser } = require("../utils/recentUserUtils")
const { ensureScoutRegistration } = require("../utils/userRegistration")

const MAX_RECENT_USERS = 200
const LEAD_ROLES = new Set(["lead", "tech_lead"])

const mapRowToRecord = (row) => ({
  email: row.email,
  firstSeenAt: row.firstSeenAt,
  lastSeenAt: row.lastSeenAt,
  acknowledged: row.acknowledged === true,
  displayName: row.displayName || null,
  photoUrl: row.photoUrl || null,
  firstName: row.firstName || null,
  lastName: row.lastName || null,
  teamNumber: row.teamNumber || null,
})

const getRequesterRole = async (email) => {
  const normalizedEmail = sanitizeString(email).toLowerCase()
  if (!normalizedEmail) return null
  const row = await prisma.role.findUnique({
    where: { email: normalizedEmail },
    select: { role: true },
  })
  return row?.role || null
}

const requireLeadAccess = async (req, res) => {
  const requesterRole = await getRequesterRole(req.user?.email)
  if (!LEAD_ROLES.has(requesterRole)) {
    res.status(403).json({ error: "Lead access required" })
    return false
  }
  return true
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    if (!(await requireLeadAccess(req, res))) {
      return
    }

    const rows = await prisma.recentUser.findMany({
      orderBy: { lastSeenAt: "desc" },
      take: MAX_RECENT_USERS,
    })

    res.json({ recentUsers: rows.map(mapRowToRecord) })
  })
)

// A pending user's own request as the server sees it. Their device only
// has its local copy otherwise, which goes stale if a lead resets or
// removes the request, leaving them on "request sent" indefinitely.
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const email = sanitizeString(req.user?.email).toLowerCase()
    if (!email) {
      return res.status(401).json({ error: "Not authenticated" })
    }
    const row = await prisma.recentUser.findUnique({ where: { email } })
    res.json({ recentUser: row ? mapRowToRecord(row) : null })
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

    const requesterEmail = sanitizeString(req.user?.email).toLowerCase()
    const requesterRole = await getRequesterRole(requesterEmail)
    const isLead = LEAD_ROLES.has(requesterRole)
    if (!requesterEmail) {
      return res.status(401).json({ error: "Not authenticated" })
    }
    if (!isLead && requesterEmail !== normalizedEmail) {
      return res.status(403).json({ error: "You can only update your own verification request" })
    }

    const {
      firstSeenAt,
      lastSeenAt,
      acknowledged,
      displayName,
      photoUrl,
      firstName,
      lastName,
      teamNumber,
    } = req.body || {}

    const resolvedAcknowledged = typeof acknowledged === "undefined"
      ? (isLead ? undefined : false)
      : (isLead ? acknowledged : false)

    const existing = await prisma.recentUser.findUnique({ where: { email: normalizedEmail } })

    if (!existing) {
      await upsertRecentUser(prisma, {
        email: normalizedEmail,
        firstSeenAt,
        lastSeenAt,
        acknowledged: resolvedAcknowledged,
        displayName,
        photoUrl,
        firstName,
        lastName,
        teamNumber,
      })

      await ensureScoutRegistration({
        email: normalizedEmail,
        displayName,
        photoUrl,
        firstName,
        lastName,
        teamNumber,
      })

      const row = await prisma.recentUser.findUnique({ where: { email: normalizedEmail } })
      return res.json({ recentUser: mapRowToRecord(row) })
    }

    await upsertRecentUser(prisma, {
      email: normalizedEmail,
      firstSeenAt,
      lastSeenAt,
      acknowledged: resolvedAcknowledged,
      displayName,
      photoUrl,
      firstName,
      lastName,
      teamNumber,
    })

    await ensureScoutRegistration({
      email: normalizedEmail,
      displayName,
      photoUrl,
      firstName,
      lastName,
      teamNumber,
    })

    const row = await prisma.recentUser.findUnique({ where: { email: normalizedEmail } })
    res.json({ recentUser: mapRowToRecord(row) })
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

    if (!(await requireLeadAccess(req, res))) {
      return
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

    if (!(await requireLeadAccess(req, res))) {
      return
    }

    const info = await prisma.recentUser.deleteMany({
      where: { email: normalizedEmail },
    })

    res.json({ success: info.count > 0 })
  })
)

module.exports = router
