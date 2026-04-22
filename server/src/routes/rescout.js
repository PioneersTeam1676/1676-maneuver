const express = require("express")
const { prisma } = require("../db")
const { sendManualNotification } = require("../services/scheduleNotifications")
const asyncHandler = require("../utils/asyncHandler")
const { nowSeconds } = require("../utils/dbUtils")

const router = express.Router()

const HEARTBEAT_TTL_SECONDS = 60
const TECH_LEAD_ROLES = new Set(["tech_lead"])
const RESCOUTER_DEFAULT_ROLES = new Set(["scout_plus", "lead", "tech_lead"])
const schemaReady = new WeakMap()

const normalizeEmail = (value) => String(value || "").trim().toLowerCase()

const getActiveClaimsWhere = () => ({
  lastHeartbeat: {
    gte: new Date(Date.now() - HEARTBEAT_TTL_SECONDS * 1000),
  },
})

const ensureRescoutSchema = async (prismaClient) => {
  if (schemaReady.has(prismaClient)) {
    await schemaReady.get(prismaClient)
    return
  }

  const promise = (async () => {
    await prismaClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS rescouter_permissions (
        email VARCHAR(255) PRIMARY KEY,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        updated_at INT NOT NULL
      )
    `)

    await prismaClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS rescout_assignments (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        event_key VARCHAR(255) NOT NULL,
        match_number VARCHAR(255) NOT NULL,
        alliance VARCHAR(16) NOT NULL,
        position VARCHAR(16) NOT NULL,
        original_scout VARCHAR(255) NOT NULL,
        assignee_email VARCHAR(255) NOT NULL,
        assignee_name VARCHAR(255) NOT NULL,
        assigned_by_email VARCHAR(255) NOT NULL,
        note VARCHAR(500) NULL,
        assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_rescout_assignment_slot (event_key, match_number, position),
        KEY idx_rescout_assignment_email (event_key, assignee_email)
      )
    `)

    await prismaClient.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS rescout_claims (
        id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
        match_number VARCHAR(255) NOT NULL,
        alliance VARCHAR(16) NOT NULL,
        position VARCHAR(16) NOT NULL,
        event_key VARCHAR(255) NOT NULL,
        scout_email VARCHAR(255) NOT NULL,
        scout_name VARCHAR(255) NOT NULL,
        claimed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_heartbeat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_rescout_slot (event_key, match_number, position),
        KEY idx_rescout_heartbeat (last_heartbeat)
      )
    `)
  })().catch((error) => {
    schemaReady.delete(prismaClient)
    throw error
  })

  schemaReady.set(prismaClient, promise)
  await promise
}

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

const canUserRescout = async (email) => {
  const normalized = normalizeEmail(email)
  if (!normalized) return false
  await ensureRescoutSchema(prisma)

  const [roleRow, permissionRow] = await Promise.all([
    prisma.role.findUnique({
      where: { email: normalized },
      select: { role: true },
    }),
    prisma.rescouterPermission.findUnique({
      where: { email: normalized },
      select: { enabled: true },
    }),
  ])

  if (permissionRow && typeof permissionRow.enabled === "boolean") {
    return permissionRow.enabled
  }

  return roleRow ? RESCOUTER_DEFAULT_ROLES.has(roleRow.role) : false
}

// GET /rescout/claims — all active claims
router.get(
  "/claims",
  asyncHandler(async (_req, res) => {
    await ensureRescoutSchema(prisma)
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
    await ensureRescoutSchema(prisma)
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
    await ensureRescoutSchema(prisma)
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
    await ensureRescoutSchema(prisma)
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
    await ensureRescoutSchema(prisma)
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
    await ensureRescoutSchema(prisma)
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

// GET /rescout/assignments?eventKey=X — all persisted rescout assignments for an event
router.get(
  "/assignments",
  asyncHandler(async (req, res) => {
    await ensureRescoutSchema(prisma)
    const eventKey = String(req.query.eventKey || "").trim()
    if (!eventKey) {
      return res.status(400).json({ error: "eventKey is required" })
    }

    const assignments = await prisma.rescoutAssignment.findMany({
      where: { eventKey },
      orderBy: [{ assignedAt: "desc" }, { matchNumber: "asc" }, { position: "asc" }],
    })
    res.json({ assignments })
  })
)

// POST /rescout/assignments — create or update persisted rescout assignments (tech_lead only)
router.post(
  "/assignments",
  asyncHandler(async (req, res) => {
    await ensureRescoutSchema(prisma)
    if (!(await requireTechLead(req, res))) return

    const assignedByEmail = normalizeEmail(req.user?.email)
    const eventKey = String(req.body?.eventKey || "").trim()
    const assigneeEmail = normalizeEmail(req.body?.assigneeEmail)
    const assigneeName = String(req.body?.assigneeName || "").trim() || assigneeEmail
    const noteRaw = typeof req.body?.note === "string" ? req.body.note.trim() : ""
    const matches = Array.isArray(req.body?.matches) ? req.body.matches : []

    if (!assignedByEmail) {
      return res.status(401).json({ error: "Not authenticated" })
    }
    if (!eventKey) {
      return res.status(400).json({ error: "eventKey is required" })
    }
    if (!assigneeEmail) {
      return res.status(400).json({ error: "assigneeEmail is required" })
    }
    if (!matches.length) {
      return res.status(400).json({ error: "matches must be a non-empty array" })
    }
    if (noteRaw.length > 500) {
      return res.status(400).json({ error: "note must be 500 characters or fewer" })
    }
    if (!(await canUserRescout(assigneeEmail))) {
      return res.status(400).json({ error: "Assignee does not have rescouter access" })
    }

    const dedupedMatches = new Map()
    for (const rawMatch of matches) {
      const matchNumber = String(rawMatch?.matchNumber || "").trim()
      const alliance = String(rawMatch?.alliance || "").trim()
      const position = String(rawMatch?.position || "").trim()
      const originalScout = String(rawMatch?.originalScout || "").trim()

      if (!matchNumber || !alliance || !position || !originalScout) {
        return res.status(400).json({ error: "Each match must include matchNumber, alliance, position, and originalScout" })
      }

      dedupedMatches.set(`${matchNumber}::${position}`, {
        matchNumber,
        alliance,
        position,
        originalScout,
      })
    }

    const assignedAt = new Date()
    const note = noteRaw || null

    const assignments = await Promise.all(
      [...dedupedMatches.values()].map((match) =>
        prisma.rescoutAssignment.upsert({
          where: {
            eventKey_matchNumber_position: {
              eventKey,
              matchNumber: match.matchNumber,
              position: match.position,
            },
          },
          update: {
            alliance: match.alliance,
            originalScout: match.originalScout,
            assigneeEmail,
            assigneeName,
            assignedByEmail,
            note,
            assignedAt,
          },
          create: {
            eventKey,
            matchNumber: match.matchNumber,
            alliance: match.alliance,
            position: match.position,
            originalScout: match.originalScout,
            assigneeEmail,
            assigneeName,
            assignedByEmail,
            note,
            assignedAt,
          },
        })
      )
    )

    const matchNumbers = [...new Set(assignments.map((assignment) => String(assignment.matchNumber).replace(/\D/g, "") || assignment.matchNumber))]
      .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
    const matchLabel = matchNumbers.length === 1 ? "Match" : "Matches"
    const noteSuffix = note ? ` ${note}` : ""
    const notification = await sendManualNotification({
      email: assigneeEmail,
      title: "You've been assigned rescout matches",
      body: `${matchLabel} ${matchNumbers.join(", ")} at ${eventKey} - tap to view.${noteSuffix}`,
      url: "/rescout",
      tag: `rescout-assignment-${eventKey}-${assigneeEmail}-${Date.now()}`,
    })

    res.status(201).json({
      assignments,
      notified: Boolean(notification?.success),
      notification,
    })
  })
)

// DELETE /rescout/assignments/:id — remove persisted rescout assignment (tech_lead only)
router.delete(
  "/assignments/:id",
  asyncHandler(async (req, res) => {
    await ensureRescoutSchema(prisma)
    if (!(await requireTechLead(req, res))) return

    const id = Number.parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid id" })
    }

    await prisma.rescoutAssignment.delete({ where: { id } }).catch(() => null)
    res.status(204).end()
  })
)

module.exports = router
