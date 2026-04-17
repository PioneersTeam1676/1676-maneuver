const express = require("express")
const { prisma } = require("../db")
const asyncHandler = require("../utils/asyncHandler")
const { nowSeconds } = require("../utils/dbUtils")

const router = express.Router()

const HEARTBEAT_TTL_SECONDS = 60
const TECH_LEAD_ROLES = new Set(["tech_lead"])

const getActiveClaimsWhere = () => ({
  lastHeartbeat: {
    gte: new Date(Date.now() - HEARTBEAT_TTL_SECONDS * 1000),
  },
})

const requireTechLead = async (req, res) => {
  const email = req.user?.email
  if (!email) { res.status(401).json({ error: "Not authenticated" }); return false }
  const row = await prisma.role.findUnique({
    where: { email: String(email).trim().toLowerCase() },
    select: { role: true },
  })
  if (!row || !TECH_LEAD_ROLES.has(row.role)) {
    res.status(403).json({ error: "Forbidden" }); return false
  }
  return true
}

// GET /rescout/claims — all active claims
router.get(
  "/claims",
  asyncHandler(async (_req, res) => {
    const claims = await prisma.rescoutClaim.findMany({
      where: getActiveClaimsWhere(),
    })
    res.json({ claims })
  })
)

// POST /rescout/claims — create claim; 409 if slot already active
router.post(
  "/claims",
  asyncHandler(async (req, res) => {
    const { matchNumber, alliance, position, eventKey, scoutName } = req.body
    const scoutEmail = req.user?.email
    if (!matchNumber || !alliance || !position || !eventKey || !scoutName || !scoutEmail) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    const existing = await prisma.rescoutClaim.findFirst({
      where: {
        matchNumber: String(matchNumber),
        alliance: String(alliance),
        position: String(position),
        eventKey: String(eventKey),
        ...getActiveClaimsWhere(),
      },
    })

    if (existing) {
      return res.status(409).json({ error: "Slot already claimed", claim: existing })
    }

    // Delete any stale claims for same slot before creating new one
    await prisma.rescoutClaim.deleteMany({
      where: {
        matchNumber: String(matchNumber),
        alliance: String(alliance),
        position: String(position),
        eventKey: String(eventKey),
      },
    })

    const claim = await prisma.rescoutClaim.create({
      data: {
        matchNumber: String(matchNumber),
        alliance: String(alliance),
        position: String(position),
        eventKey: String(eventKey),
        scoutEmail: String(scoutEmail).trim().toLowerCase(),
        scoutName: String(scoutName),
      },
    })
    res.status(201).json({ claim })
  })
)

// PATCH /rescout/claims/:id/heartbeat — bump lastHeartbeat
router.patch(
  "/claims/:id/heartbeat",
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" })

    const claim = await prisma.rescoutClaim.update({
      where: { id },
      data: { lastHeartbeat: new Date() },
    })
    res.json({ claim })
  })
)

// DELETE /rescout/claims/:id — release claim
router.delete(
  "/claims/:id",
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" })

    await prisma.rescoutClaim.delete({ where: { id } }).catch(() => null)
    res.status(204).end()
  })
)

// GET /rescout/permissions — returns all explicit rescouter permission overrides
router.get(
  "/permissions",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.rescouterPermission.findMany()
    const permissions = rows.reduce((acc, row) => {
      acc[row.email] = row.enabled
      return acc
    }, {})
    res.json({ permissions })
  })
)

// PUT /rescout/permissions/:email — set rescouter permission (tech_lead only)
router.put(
  "/permissions/:email",
  asyncHandler(async (req, res) => {
    if (!(await requireTechLead(req, res))) return

    const email = String(req.params.email).trim().toLowerCase()
    const { enabled } = req.body
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be boolean" })
    }

    const row = await prisma.rescouterPermission.upsert({
      where: { email },
      update: { enabled, updatedAt: nowSeconds() },
      create: { email, enabled, updatedAt: nowSeconds() },
    })
    res.json({ permission: row })
  })
)

module.exports = router
