const express = require("express")
const { getSeasonPrisma, resolveSeasonSelector } = require("../seasonDb")
const asyncHandler = require("../utils/asyncHandler")
const { toMsBigInt, fromBigInt } = require("../utils/dbUtils")
const { requireLeadRole } = require("../utils/requireLeadRole")

const router = express.Router()

const sanitizeString = (value) => (typeof value === "string" ? value.trim() : "")

const buildDefaultScout = (name) => {
  const timestamp = Date.now()
  return {
    name,
    pis: 0,
    pisFromPredictions: 0,
    totalPredictions: 0,
    correctPredictions: 0,
    currentStreak: 0,
    longestStreak: 0,
    createdAt: timestamp,
    lastUpdated: timestamp
  }
}

const ensureScoutRecord = async (prisma, name) => {
  const normalizedName = sanitizeString(name)
  if (!normalizedName) {
    return ""
  }

  const existing = await prisma.scout.findUnique({ where: { name: normalizedName } })
  if (existing) {
    return normalizedName
  }

  const placeholders = buildDefaultScout(normalizedName)

  try {
    await prisma.scout.create({
      data: {
        name: placeholders.name,
        pis: placeholders.pis,
        pisFromPredictions: placeholders.pisFromPredictions,
        totalPredictions: placeholders.totalPredictions,
        correctPredictions: placeholders.correctPredictions,
        currentStreak: placeholders.currentStreak,
        longestStreak: placeholders.longestStreak,
        createdAt: toMsBigInt(placeholders.createdAt),
        lastUpdated: toMsBigInt(placeholders.lastUpdated),
      }
    })
  } catch (error) {
    if (error?.code !== "P2002") {
      throw error
    }
  }

  return normalizedName
}

const rowToScout = (row) => ({
  name: row.name,
  pis: row.pis,
  pisFromPredictions: row.pisFromPredictions,
  totalPredictions: row.totalPredictions,
  correctPredictions: row.correctPredictions,
  currentStreak: row.currentStreak,
  longestStreak: row.longestStreak,
  createdAt: fromBigInt(row.createdAt, 0),
  lastUpdated: fromBigInt(row.lastUpdated, 0)
})

const rowToPrediction = (row) => ({
  id: row.id,
  scoutName: row.scoutName,
  eventName: row.eventName,
  matchNumber: row.matchNumber,
  predictedWinner: row.predictedWinner,
  wager: row.wager ?? undefined,
  actualWinner: row.actualWinner || undefined,
  isCorrect: row.isCorrect === null ? undefined : !!row.isCorrect,
  pointsAwarded: row.pointsAwarded ?? undefined,
  timestamp: fromBigInt(row.timestamp, 0),
  verified: row.verified === true
})

const rowToAchievement = (row) => ({
  scoutName: row.scoutName,
  achievementId: row.achievementId,
  unlockedAt: fromBigInt(row.unlockedAt, 0),
  progress: row.progress === null ? undefined : row.progress
})

router.get(
  "/scouts",
  asyncHandler(async (_req, res) => {
    const { prisma } = await getSeasonPrisma()
    const rows = await prisma.scout.findMany({
      orderBy: [{ pis: "desc" }, { name: "asc" }]
    })
    res.json({ scouts: rows.map(rowToScout) })
  })
)

router.get(
  "/scouts/:name",
  asyncHandler(async (req, res) => {
    const { name } = req.params
    const { prisma } = await getSeasonPrisma()
    const row = await prisma.scout.findUnique({ where: { name } })
    if (!row) {
      return res.status(404).json({ error: "Scout not found" })
    }
    res.json({ scout: rowToScout(row) })
  })
)

router.post(
  "/scouts",
  asyncHandler(async (req, res) => {
    const { scout } = req.body
    if (!scout || !scout.name) {
      return res.status(400).json({ error: "scout with name is required" })
    }
    const payload = {
      name: sanitizeString(scout.name),
      pis: scout.pis ?? 0,
      pisFromPredictions: scout.pisFromPredictions ?? 0,
      totalPredictions: scout.totalPredictions ?? 0,
      correctPredictions: scout.correctPredictions ?? 0,
      currentStreak: scout.currentStreak ?? 0,
      longestStreak: scout.longestStreak ?? 0,
      createdAt: scout.createdAt ?? Date.now(),
      lastUpdated: scout.lastUpdated ?? Date.now()
    }
    if (!payload.name) {
      return res.status(400).json({ error: "scout with name is required" })
    }

    const { prisma } = await getSeasonPrisma(resolveSeasonSelector({ year: req.body?.year, formId: req.body?.formId }))
    await prisma.scout.upsert({
      where: { name: payload.name },
      create: {
        name: payload.name,
        pis: payload.pis,
        pisFromPredictions: payload.pisFromPredictions,
        totalPredictions: payload.totalPredictions,
        correctPredictions: payload.correctPredictions,
        currentStreak: payload.currentStreak,
        longestStreak: payload.longestStreak,
        createdAt: toMsBigInt(payload.createdAt),
        lastUpdated: toMsBigInt(payload.lastUpdated),
      },
      update: {
        pis: payload.pis,
        pisFromPredictions: payload.pisFromPredictions,
        totalPredictions: payload.totalPredictions,
        correctPredictions: payload.correctPredictions,
        currentStreak: payload.currentStreak,
        longestStreak: payload.longestStreak,
        lastUpdated: toMsBigInt(payload.lastUpdated),
      }
    })

    const row = await prisma.scout.findUnique({ where: { name: payload.name } })
    res.status(201).json({ scout: rowToScout(row) })
  })
)

router.patch(
  "/scouts/:name",
  asyncHandler(async (req, res) => {
    const { name } = req.params
    const { updates = {} } = req.body
    const { prisma } = await getSeasonPrisma(resolveSeasonSelector({ year: req.body?.year, formId: req.body?.formId }))
    const row = await prisma.scout.findUnique({ where: { name } })
    if (!row) {
      return res.status(404).json({ error: "Scout not found" })
    }
    const payload = {
      pis: updates.pis ?? row.pis,
      pisFromPredictions: updates.pisFromPredictions ?? row.pisFromPredictions,
      totalPredictions: updates.totalPredictions ?? row.totalPredictions,
      correctPredictions: updates.correctPredictions ?? row.correctPredictions,
      currentStreak: updates.currentStreak ?? row.currentStreak,
      longestStreak: updates.longestStreak ?? row.longestStreak,
      lastUpdated: Date.now()
    }

    await prisma.scout.update({
      where: { name },
      data: {
        pis: payload.pis,
        pisFromPredictions: payload.pisFromPredictions,
        totalPredictions: payload.totalPredictions,
        correctPredictions: payload.correctPredictions,
        currentStreak: payload.currentStreak,
        longestStreak: payload.longestStreak,
        lastUpdated: toMsBigInt(payload.lastUpdated),
      }
    })

    const updated = await prisma.scout.findUnique({ where: { name } })
    res.json({ scout: rowToScout(updated) })
  })
)

// Deleting a scout cascades to their predictions and achievements — lead+
// only (the UI only offers this from the lead-gated scout management page,
// but the API itself must enforce it too).
router.delete(
  "/scouts/:name",
  requireLeadRole,
  asyncHandler(async (req, res) => {
    const { name } = req.params
    const { prisma } = await getSeasonPrisma(resolveSeasonSelector({ year: req.query.year, formId: req.query.formId }))
    await prisma.$transaction([
      prisma.prediction.deleteMany({ where: { scoutName: name } }),
      prisma.scoutAchievement.deleteMany({ where: { scoutName: name } }),
      prisma.scout.deleteMany({ where: { name } })
    ])
    res.json({ success: true })
  })
)

// Wipes ALL scouts/predictions/achievements — lead+ only.
router.delete(
  "/scouts",
  requireLeadRole,
  asyncHandler(async (_req, res) => {
    const { prisma } = await getSeasonPrisma()
    await prisma.$transaction([
      prisma.prediction.deleteMany({}),
      prisma.scoutAchievement.deleteMany({}),
      prisma.scout.deleteMany({})
    ])
    res.json({ success: true })
  })
)

router.post(
  "/predictions",
  asyncHandler(async (req, res) => {
    const { prediction } = req.body
    if (!prediction || !prediction.id) {
      return res.status(400).json({ error: "prediction with id required" })
    }

    const selector = resolveSeasonSelector({
      year: req.body?.year,
      formId: req.body?.formId,
      eventName: prediction.eventName,
    })
    const { prisma } = await getSeasonPrisma(selector)
    const normalizedScout = await ensureScoutRecord(prisma, prediction.scoutName)
    if (!normalizedScout) {
      return res.status(400).json({ error: "scoutName is required" })
    }

    const eventName = sanitizeString(prediction.eventName)
    const matchNumber = sanitizeString(prediction.matchNumber)
    const predictedWinner = sanitizeString(prediction.predictedWinner)
    if (!eventName || !matchNumber || !predictedWinner) {
      return res.status(400).json({ error: "eventName, matchNumber, and predictedWinner are required" })
    }

    const payload = {
      id: prediction.id,
      scoutName: normalizedScout,
      eventName,
      matchNumber,
      predictedWinner,
      wager: typeof prediction.wager === "number" ? prediction.wager : null,
      actualWinner: prediction.actualWinner ?? null,
      isCorrect: typeof prediction.isCorrect === "boolean" ? prediction.isCorrect : null,
      pointsAwarded: prediction.pointsAwarded ?? null,
      timestamp: toMsBigInt(prediction.timestamp ?? Date.now()),
      verified: prediction.verified ? true : false
    }

    await prisma.prediction.upsert({
      where: { id: payload.id },
      create: payload,
      update: payload,
    })

    const row = await prisma.prediction.findUnique({ where: { id: payload.id } })
    res.status(201).json({ prediction: rowToPrediction(row) })
  })
)

router.get(
  "/predictions",
  asyncHandler(async (req, res) => {
    const { scoutName, eventName, matchNumber } = req.query
    const { prisma } = await getSeasonPrisma(resolveSeasonSelector({ year: req.query.year, formId: req.query.formId, eventName }))
    const where = {}
    if (scoutName) where.scoutName = String(scoutName)
    if (eventName) where.eventName = String(eventName)
    if (matchNumber) where.matchNumber = String(matchNumber)

    const rows = await prisma.prediction.findMany({
      where,
      orderBy: { timestamp: "desc" }
    })
    res.json({ predictions: rows.map(rowToPrediction) })
  })
)

router.get(
  "/predictions/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { prisma } = await getSeasonPrisma(resolveSeasonSelector({ year: req.query.year, formId: req.query.formId }))
    const row = await prisma.prediction.findUnique({ where: { id } })
    if (!row) {
      return res.status(404).json({ error: "Prediction not found" })
    }
    res.json({ prediction: rowToPrediction(row) })
  })
)

router.patch(
  "/predictions/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { updates = {} } = req.body
    const { prisma } = await getSeasonPrisma(resolveSeasonSelector({ year: req.body?.year, formId: req.body?.formId }))
    const row = await prisma.prediction.findUnique({ where: { id } })
    if (!row) {
      return res.status(404).json({ error: "Prediction not found" })
    }

    const payload = {
      wager: updates.wager === undefined ? row.wager : updates.wager,
      actualWinner: updates.actualWinner ?? row.actualWinner,
      isCorrect: updates.isCorrect === undefined ? row.isCorrect : !!updates.isCorrect,
      pointsAwarded: updates.pointsAwarded ?? row.pointsAwarded,
      timestamp: toMsBigInt(updates.timestamp ?? fromBigInt(row.timestamp, Date.now())),
      verified: updates.verified === undefined ? row.verified : !!updates.verified
    }

    await prisma.prediction.update({
      where: { id },
      data: payload,
    })

    const updated = await prisma.prediction.findUnique({ where: { id } })
    res.json({ prediction: rowToPrediction(updated) })
  })
)

router.delete(
  "/predictions/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const { prisma } = await getSeasonPrisma(resolveSeasonSelector({ year: req.query.year, formId: req.query.formId }))
    const info = await prisma.prediction.deleteMany({ where: { id } })
    res.json({ success: info.count > 0 })
  })
)

router.get(
  "/achievements",
  asyncHandler(async (req, res) => {
    const { scoutName } = req.query
    const { prisma } = await getSeasonPrisma(resolveSeasonSelector({ year: req.query.year, formId: req.query.formId }))
    const where = scoutName ? { scoutName: String(scoutName) } : {}
    const rows = await prisma.scoutAchievement.findMany({ where })
    res.json({ achievements: rows.map(rowToAchievement) })
  })
)

router.post(
  "/achievements",
  asyncHandler(async (req, res) => {
    const { achievement } = req.body
    if (!achievement) {
      return res.status(400).json({ error: "invalid achievement payload" })
    }

    const selector = resolveSeasonSelector({
      year: req.body?.year,
      formId: req.body?.formId,
      eventName: achievement.eventName,
    })
    const { prisma } = await getSeasonPrisma(selector)
    const normalizedScout = await ensureScoutRecord(prisma, achievement.scoutName)
    const achievementId = sanitizeString(achievement.achievementId)
    if (!normalizedScout || !achievementId) {
      return res.status(400).json({ error: "scoutName and achievementId are required" })
    }

    await prisma.scoutAchievement.upsert({
      where: {
        scoutName_achievementId: {
          scoutName: normalizedScout,
          achievementId,
        }
      },
      create: {
        scoutName: normalizedScout,
        achievementId,
        unlockedAt: toMsBigInt(achievement.unlockedAt ?? Date.now()),
        progress: achievement.progress ?? null,
      },
      update: {
        unlockedAt: toMsBigInt(achievement.unlockedAt ?? Date.now()),
        progress: achievement.progress ?? null,
      }
    })

    const row = await prisma.scoutAchievement.findUnique({
      where: {
        scoutName_achievementId: {
          scoutName: normalizedScout,
          achievementId,
        }
      }
    })

    res.status(201).json({ achievement: rowToAchievement(row) })
  })
)

router.delete(
  "/achievements",
  asyncHandler(async (req, res) => {
    const { scoutName } = req.body || {}
    const { prisma } = await getSeasonPrisma(resolveSeasonSelector({ year: req.body?.year, formId: req.body?.formId }))
    if (scoutName) {
      await prisma.scoutAchievement.deleteMany({ where: { scoutName } })
    } else {
      await prisma.scoutAchievement.deleteMany({})
    }
    res.json({ success: true })
  })
)

// Remove a single achievement from a scout
router.delete(
  "/achievements/:scoutName/:achievementId",
  asyncHandler(async (req, res) => {
    const { scoutName, achievementId } = req.params
    if (!scoutName || !achievementId) {
      return res.status(400).json({ error: "scoutName and achievementId required" })
    }
    const { prisma } = await getSeasonPrisma(resolveSeasonSelector({ year: req.query.year, formId: req.query.formId }))
    const info = await prisma.scoutAchievement.deleteMany({
      where: {
        scoutName: sanitizeString(scoutName),
        achievementId: sanitizeString(achievementId),
      }
    })
    res.json({ success: info.count > 0 })
  })
)

module.exports = router
