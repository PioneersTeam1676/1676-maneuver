const express = require("express")
const { prisma } = require("../db")
const asyncHandler = require("../utils/asyncHandler")
const { nowSeconds } = require("../utils/dbUtils")
const { getSeasonPrisma, resolveSeasonSelector } = require("../seasonDb")
const { sanitizeString, upsertRecentUser } = require("../utils/recentUserUtils")
const { ensureEntryIdentitySchema, normalizeEmail } = require("../utils/entryIdentity")

const router = express.Router()

const validRoles = new Set(["pending", "pit_scout", "drive_team", "scout_minus", "scout", "scout_plus", "lead", "tech_lead"])

const normalizeName = (value) =>
  sanitizeString(value)
    .replace(/['’.-]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()

const matchScoutNameFromEmail = (email, scoutNames) => {
  const localPart = String(email || "").split("@")[0]?.toLowerCase() || ""
  if (!localPart) return null

  const normalizedLocal = localPart.replace(/\d+/g, "")
  const compactLocal = normalizedLocal.replace(/[^a-z]/g, "")
  if (!compactLocal) return null

  const matches = scoutNames.filter((name) => {
    const parts = normalizeName(name).split(" ").filter(Boolean)
    if (parts.length < 2) return false

    const first = parts[0]
    const last = parts[parts.length - 1]
    const compactName = parts.join("")
    const patterns = new Set([
      compactName,
      `${first}${last}`,
      `${first[0]}${last}`,
      `${first}${last[0]}`,
    ])

    return patterns.has(compactLocal)
  })

  return matches.length === 1 ? matches[0] : null
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
    await upsertRecentUser(prisma, {
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

// Self-registration: assigns "scout" role to the authenticated user only if they
// have no existing role. Safe to call on every login — never downgrades a role.
router.post(
  "/self-register",
  asyncHandler(async (req, res) => {
    const email = req.user?.email
    if (!email) {
      return res.status(401).json({ error: "Not authenticated" })
    }

    const existing = await prisma.role.findUnique({ where: { email } })
    if (existing) {
      return res.json({ email, role: existing.role, registered: false })
    }

    const timestamp = nowSeconds()
    await prisma.role.create({
      data: { email, role: "scout", createdAt: timestamp, updatedAt: timestamp },
    })
    await upsertRecentUser(prisma, {
      email,
      lastSeenAt: new Date().toISOString(),
      acknowledged: true,
    })

    return res.json({ email, role: "scout", registered: true })
  })
)

// Sync scouts from scouting/pit entries into the roles system.
// Matches scoutName (display name) against RecentUser.displayName.
// Only assigns "scout" role to users who have logged in but have no role.
router.post(
  "/sync-from-entries",
  asyncHandler(async (req, res) => {
    const selector = resolveSeasonSelector({
      year: req.body?.year || req.query?.year,
      formId: req.body?.formId || req.query?.formId,
      eventName: req.body?.eventName || req.query?.eventName,
      eventKey: req.body?.eventKey || req.query?.eventKey,
    })
    const { prisma: seasonPrisma } = await getSeasonPrisma(selector)
    await ensureEntryIdentitySchema(seasonPrisma)

    const [scoutingRows, pitRows, recentUsers, existingRoles] = await Promise.all([
      seasonPrisma.$queryRawUnsafe(
        "SELECT DISTINCT scout_name AS scoutName, scout_email AS scoutEmail FROM scouting_entries WHERE scout_name IS NOT NULL OR scout_email IS NOT NULL"
      ),
      seasonPrisma.$queryRawUnsafe(
        "SELECT DISTINCT scout_name AS scoutName, scout_email AS scoutEmail FROM pit_entries WHERE scout_name IS NOT NULL OR scout_email IS NOT NULL"
      ),
      prisma.recentUser.findMany({ select: { email: true, displayName: true } }),
      prisma.role.findMany({ select: { email: true, role: true } }),
    ])

    const identityRows = [...scoutingRows, ...pitRows]
    const uniqueScoutNames = Array.from(
      new Set(
      identityRows
        .map((r) => (r.scoutName || "").trim())
        .filter(Boolean)
      )
    )

    const rolesByEmail = new Map(existingRoles.map((r) => [r.email, r.role]))

    const entryNameToEmailCandidates = new Map()

    identityRows.forEach((row) => {
      const normalizedScoutName = normalizeName(row?.scoutName)
      const scoutEmail = normalizeEmail(row?.scoutEmail)
      if (!normalizedScoutName || !scoutEmail) return
      if (!entryNameToEmailCandidates.has(normalizedScoutName)) {
        entryNameToEmailCandidates.set(normalizedScoutName, new Set())
      }
      entryNameToEmailCandidates.get(normalizedScoutName).add(scoutEmail)
    })

    // Build a map: normalized displayName -> recentUser email
    const displayNameToEmail = new Map(
      Array.from(entryNameToEmailCandidates.entries())
        .filter(([, emails]) => emails.size === 1)
        .map(([name, emails]) => [name, Array.from(emails)[0]])
    )

    recentUsers
      .filter((u) => u.displayName)
      .forEach((u) => {
        const normalizedDisplayName = normalizeName(u.displayName)
        if (!normalizedDisplayName || displayNameToEmail.has(normalizedDisplayName)) return
        displayNameToEmail.set(normalizedDisplayName, u.email)
      })

    recentUsers.forEach((user) => {
      if (displayNameToEmail.has(normalizeName(user.displayName))) return
      const matchedScoutName = matchScoutNameFromEmail(user.email, uniqueScoutNames)
      if (matchedScoutName) {
        displayNameToEmail.set(normalizeName(matchedScoutName), user.email)
      }
    })

    const synced = []
    const alreadyHaveRole = []
    const unmatched = []
    const timestamp = nowSeconds()

    for (const scoutName of uniqueScoutNames) {
      const email = displayNameToEmail.get(normalizeName(scoutName))
      if (!email) {
        unmatched.push(scoutName)
        continue
      }
      if (rolesByEmail.has(email)) {
        alreadyHaveRole.push({ email, role: rolesByEmail.get(email), displayName: scoutName })
        await upsertRecentUser(prisma, {
          email,
          lastSeenAt: new Date().toISOString(),
          displayName: scoutName,
        })
        continue
      }
      // Assign "scout" role
      await prisma.role.upsert({
        where: { email },
        create: { email, role: "scout", createdAt: timestamp, updatedAt: timestamp },
        update: { role: "scout", updatedAt: timestamp },
      })
      await prisma.recentUser.updateMany({
        where: { email },
        data: { acknowledged: true },
      })
      await upsertRecentUser(prisma, {
        email,
        lastSeenAt: new Date().toISOString(),
        acknowledged: true,
        displayName: scoutName,
      })
      if (rolesByEmail.get(email) !== "pending") {
        await prisma.verifiedUser.create({
          data: { email, role: "scout", verifiedAt: timestamp },
        })
      }
      synced.push({ email, displayName: scoutName })
    }

    res.json({ synced, alreadyHaveRole, unmatched })
  })
)

module.exports = router
