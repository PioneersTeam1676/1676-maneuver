const express = require("express")
const { prisma } = require("../db")
const asyncHandler = require("../utils/asyncHandler")
const { nowSeconds } = require("../utils/dbUtils")
const { getSeasonPrisma, resolveSeasonSelector } = require("../seasonDb")
const { sanitizeString, upsertRecentUser } = require("../utils/recentUserUtils")
const { ensureEntryIdentitySchema, normalizeEmail } = require("../utils/entryIdentity")
const { ensureScoutRegistration } = require("../utils/userRegistration")
const { emailMatchesAllowedDomain } = require("../utils/authDomains")
const { getConfiguredRole } = require("../utils/configuredAdmins")

const router = express.Router()

const validRoles = new Set(["blocked", "pending", "pit_scout", "drive_team", "scout_minus", "scout", "scout_plus", "lead", "tech_lead"])
const roleRank = {
  blocked: 0,
  pending: 0,
  pit_scout: 1,
  drive_team: 1,
  scout_minus: 2,
  scout: 2,
  scout_plus: 2,
  lead: 3,
  tech_lead: 4,
}
const elevatedRoles = new Set(["lead", "tech_lead"])

const getRequesterRole = async (email) => {
  const normalizedEmail = sanitizeString(email).toLowerCase()
  if (!normalizedEmail) return null
  const row = await prisma.role.findUnique({
    where: { email: normalizedEmail },
    select: { role: true },
  })
  return row?.role || null
}

const requireRoleAtLeast = async (req, res, minimumRole) => {
  const requesterEmail = sanitizeString(req.user?.email).toLowerCase()
  if (!requesterEmail) {
    res.status(401).json({ error: "Not authenticated" })
    return null
  }

  const requesterRole = await getRequesterRole(requesterEmail)
  if ((roleRank[requesterRole] ?? 0) < roleRank[minimumRole]) {
    const label = minimumRole === "tech_lead" ? "Tech lead access required" : "Lead access required"
    res.status(403).json({ error: label })
    return null
  }

  return { email: requesterEmail, role: requesterRole }
}

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
  asyncHandler(async (req, res) => {
    if (!(await requireRoleAtLeast(req, res, "lead"))) {
      return
    }

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
  "/me",
  asyncHandler(async (req, res) => {
    const requesterEmail = sanitizeString(req.user?.email).toLowerCase()
    if (!requesterEmail) {
      return res.status(401).json({ error: "Not authenticated" })
    }

    const row = await prisma.role.findUnique({
      where: { email: requesterEmail },
      select: { role: true },
    })
    const role = row?.role || (emailMatchesAllowedDomain(requesterEmail) ? "scout" : "pending")

    return res.json({ email: requesterEmail, role })
  })
)

router.get(
  "/:email",
  asyncHandler(async (req, res) => {
    const { email } = req.params
    const normalizedEmail = email.trim().toLowerCase()
    const requesterEmail = sanitizeString(req.user?.email).toLowerCase()
    if (requesterEmail !== normalizedEmail && !(await requireRoleAtLeast(req, res, "lead"))) {
      return
    }

    const row = await prisma.role.findUnique({ where: { email: normalizedEmail } })
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

    const requester = await requireRoleAtLeast(req, res, elevatedRoles.has(role) ? "tech_lead" : "lead")
    if (!requester) {
      return
    }

    const normalizedEmail = email.trim().toLowerCase()
    const configuredRole = getConfiguredRole(normalizedEmail)
    if (configuredRole && roleRank[role] < roleRank[configuredRole]) {
      return res.status(409).json({ error: "This account is configured as an admin on the server and cannot be demoted here." })
    }
    const existingTarget = await prisma.role.findUnique({
      where: { email: normalizedEmail },
      select: { role: true },
    })
    if (elevatedRoles.has(existingTarget?.role) && requester.role !== "tech_lead") {
      return res.status(403).json({ error: "Tech lead access required" })
    }

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

    if (role !== "pending" && role !== "blocked") {
      const verifiedAt = nowSeconds()
      await prisma.verifiedUser.create({
        data: {
          email: normalizedEmail,
          role,
          verifiedAt,
        }
      })
    } else {
      await prisma.verifiedUser.deleteMany({
        where: { email: normalizedEmail },
      })
    }

    res.json({ success: true, email: normalizedEmail, role })
  })
)

router.delete(
  "/:email",
  asyncHandler(async (req, res) => {
    if (!(await requireRoleAtLeast(req, res, "lead"))) {
      return
    }

    const { email } = req.params
    const normalizedEmail = email.trim().toLowerCase()
    if (getConfiguredRole(normalizedEmail)) {
      return res.status(409).json({ error: "This account is configured as an admin on the server and cannot be removed here." })
    }
    const existingTarget = await prisma.role.findUnique({
      where: { email: normalizedEmail },
      select: { role: true },
    })
    if (elevatedRoles.has(existingTarget?.role)) {
      const requester = await getRequesterRole(req.user?.email)
      if (requester !== "tech_lead") {
        return res.status(403).json({ error: "Tech lead access required" })
      }
    }

    const [
      roleDelete,
      verifiedUserDelete,
      recentUserDelete,
      rescouterPermissionDelete,
      pushSubscriptionDelete,
    ] = await prisma.$transaction([
      prisma.role.deleteMany({ where: { email: normalizedEmail } }),
      prisma.verifiedUser.deleteMany({ where: { email: normalizedEmail } }),
      prisma.recentUser.deleteMany({ where: { email: normalizedEmail } }),
      prisma.rescouterPermission.deleteMany({ where: { email: normalizedEmail } }),
      prisma.pushSubscription.deleteMany({ where: { email: normalizedEmail } }),
    ])
    res.json({
      success: roleDelete.count > 0 || recentUserDelete.count > 0,
      email: normalizedEmail,
      deleted: {
        roles: roleDelete.count,
        verifiedUsers: verifiedUserDelete.count,
        recentUsers: recentUserDelete.count,
        rescouterPermissions: rescouterPermissionDelete.count,
        pushSubscriptions: pushSubscriptionDelete.count,
      },
    })
  })
)

router.post(
  "/rename-scout",
  asyncHandler(async (req, res) => {
    if (!(await requireRoleAtLeast(req, res, "lead"))) {
      return
    }

    const oldName = sanitizeString(req.body?.oldName)
    const newName = sanitizeString(req.body?.newName)
    const normalizedEmail = normalizeEmail(req.body?.email)

    if (!newName) {
      return res.status(400).json({ error: "newName is required" })
    }
    if (!oldName && !normalizedEmail) {
      return res.status(400).json({ error: "oldName or email is required" })
    }

    const emptyCounts = {
      scoutingEntries: 0,
      pitEntries: 0,
      predictions: 0,
      achievements: 0,
      scoutProfile: 0,
    }
    let seasonCounts = emptyCounts

    if (oldName && oldName !== newName) {
      const selector = resolveSeasonSelector({
        year: req.body?.year || req.query?.year,
        formId: req.body?.formId || req.query?.formId,
        eventName: req.body?.eventName || req.query?.eventName,
        eventKey: req.body?.eventKey || req.query?.eventKey,
      })
      const { prisma: seasonPrisma } = await getSeasonPrisma(selector)

      const [targetScout, oldScout] = await Promise.all([
        seasonPrisma.scout.findUnique({ where: { name: newName } }),
        seasonPrisma.scout.findUnique({ where: { name: oldName } }),
      ])

      if (oldScout && targetScout) {
        return res.status(409).json({ error: "A scout profile already exists with that name" })
      }

      const seasonOperations = [
        seasonPrisma.scoutingEntry.updateMany({
          where: { scoutName: oldName },
          data: { scoutName: newName },
        }),
        seasonPrisma.pitEntry.updateMany({
          where: { scoutName: oldName },
          data: { scoutName: newName },
        }),
      ]

      if (oldScout) {
        seasonOperations.unshift(
          seasonPrisma.scout.create({
            data: {
              name: newName,
              pis: oldScout.pis,
              pisFromPredictions: oldScout.pisFromPredictions,
              totalPredictions: oldScout.totalPredictions,
              correctPredictions: oldScout.correctPredictions,
              currentStreak: oldScout.currentStreak,
              longestStreak: oldScout.longestStreak,
              createdAt: oldScout.createdAt,
              lastUpdated: oldScout.lastUpdated,
            },
          }),
          seasonPrisma.prediction.updateMany({
            where: { scoutName: oldName },
            data: { scoutName: newName },
          }),
          seasonPrisma.scoutAchievement.updateMany({
            where: { scoutName: oldName },
            data: { scoutName: newName },
          }),
          seasonPrisma.scout.delete({ where: { name: oldName } })
        )
      }

      const results = await seasonPrisma.$transaction(seasonOperations)
      const resultOffset = oldScout ? 4 : 0
      seasonCounts = {
        scoutingEntries: results[resultOffset]?.count || 0,
        pitEntries: results[resultOffset + 1]?.count || 0,
        predictions: oldScout ? results[1]?.count || 0 : 0,
        achievements: oldScout ? results[2]?.count || 0 : 0,
        scoutProfile: oldScout ? 1 : 0,
      }
    }

    const recentUserUpdate = normalizedEmail
      ? await prisma.recentUser.updateMany({
          where: { email: normalizedEmail },
          data: { displayName: newName },
        })
      : { count: 0 }

    res.json({
      success: true,
      oldName: oldName || null,
      newName,
      counts: {
        ...seasonCounts,
        recentUsers: recentUserUpdate.count || 0,
      },
    })
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

    const existing = await prisma.role.findUnique({
      where: { email },
      select: { role: true },
    })
    const role = await ensureScoutRegistration({
      email,
      displayName: req.user?.name,
      photoUrl: req.user?.picture,
    })

    return res.json({ email, role, registered: !existing || existing.role === "pending" })
  })
)

// Sync scouts from scouting/pit entries into the roles system.
// Matches scoutName (display name) against RecentUser.displayName.
// Only assigns "scout" role to users who have logged in but have no role.
router.post(
  "/sync-from-entries",
  asyncHandler(async (req, res) => {
    if (!(await requireRoleAtLeast(req, res, "lead"))) {
      return
    }

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
