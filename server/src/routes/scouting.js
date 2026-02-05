const express = require("express")
const { getSeasonPrisma, resolveSeasonSelector } = require("../seasonDb")
const asyncHandler = require("../utils/asyncHandler")
const { parseJsonValue, stringifyJsonValue, toMsBigInt, fromBigInt } = require("../utils/dbUtils")
const { updateMatchProgress } = require("../services/scheduleNotifications")

const router = express.Router()

const schemaReady = new WeakMap()

const ensureScoutingIdSchema = async (prisma) => {
  if (schemaReady.has(prisma)) {
    await schemaReady.get(prisma)
    return
  }

  const promise = (async () => {
    try {
      const columns = await prisma.$queryRawUnsafe(
        "SHOW COLUMNS FROM scouting_entries LIKE 'client_id'"
      )
      if (Array.isArray(columns) && columns.length) {
        return
      }

      await prisma.$executeRawUnsafe("ALTER TABLE scouting_entries DROP PRIMARY KEY")
      await prisma.$executeRawUnsafe(
        "ALTER TABLE scouting_entries CHANGE COLUMN id client_id VARCHAR(255) NOT NULL"
      )
      await prisma.$executeRawUnsafe(
        "ALTER TABLE scouting_entries ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST"
      )
      await prisma.$executeRawUnsafe(
        "ALTER TABLE scouting_entries ADD UNIQUE KEY uniq_scouting_client_id (client_id)"
      )
    } catch (error) {
      console.warn("Failed to ensure scouting_entries id schema", error)
    }
  })()

  schemaReady.set(prisma, promise)
  await promise
}

const resetAutoIncrementIfEmpty = async (prisma) => {
  try {
    const rows = await prisma.$queryRawUnsafe("SELECT COUNT(*) as count FROM scouting_entries")
    const count = Array.isArray(rows) ? Number(rows[0]?.count ?? 0) : 0
    if (count === 0) {
      await prisma.$executeRawUnsafe("ALTER TABLE scouting_entries AUTO_INCREMENT = 1")
    }
  } catch (error) {
    console.warn("Failed to reset scouting_entries AUTO_INCREMENT", error)
  }
}

const normalizeDbId = (value) =>
  typeof value === "bigint" ? Number(value) : value

const rowToEntry = (row) => ({
  id: normalizeDbId(row.id),
  clientId: row.clientId || undefined,
  teamNumber: row.teamNumber || undefined,
  matchNumber: row.matchNumber || undefined,
  alliance: row.alliance || undefined,
  scoutName: row.scoutName || undefined,
  eventName: row.eventName || undefined,
  data: parseJsonValue(row.data, {}),
  timestamp: fromBigInt(row.timestamp, 0)
})

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { teamNumber, matchNumber, eventName, scoutName, alliance } = req.query
    const selector = resolveSeasonSelector({
      year: req.query.year,
      formId: req.query.formId,
      eventName,
    })
    const { prisma } = await getSeasonPrisma(selector)
    const where = {}

    if (teamNumber) where.teamNumber = String(teamNumber)
    if (matchNumber) where.matchNumber = String(matchNumber)
    if (eventName) where.eventName = String(eventName)
    if (scoutName) where.scoutName = String(scoutName)
    if (alliance) where.alliance = String(alliance)

    await ensureScoutingIdSchema(prisma)

    const rows = await prisma.scoutingEntry.findMany({
      where,
      orderBy: { timestamp: "asc" }
    })

    res.json({ entries: rows.map(rowToEntry) })
  })
)

router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const { prisma } = await getSeasonPrisma()
    await ensureScoutingIdSchema(prisma)

    const rows = await prisma.scoutingEntry.findMany({
      select: {
        teamNumber: true,
        matchNumber: true,
        scoutName: true,
        eventName: true,
        timestamp: true,
      }
    })

    const teams = new Set()
    const matches = new Set()
    const scouts = new Set()
    const events = new Set()
    let oldest
    let newest

    rows.forEach((row) => {
      if (row.teamNumber) teams.add(row.teamNumber)
      if (row.matchNumber) matches.add(row.matchNumber)
      if (row.scoutName) scouts.add(row.scoutName)
      if (row.eventName) events.add(row.eventName)
      const ts = fromBigInt(row.timestamp, 0)
      oldest = oldest ? Math.min(oldest, ts) : ts
      newest = newest ? Math.max(newest, ts) : ts
    })

    res.json({
      totalEntries: rows.length,
      teams: Array.from(teams).sort((a, b) => Number(a) - Number(b)),
      matches: Array.from(matches).sort((a, b) => Number(a) - Number(b)),
      scouts: Array.from(scouts).sort(),
      events: Array.from(events).sort(),
      oldestEntry: oldest,
      newestEntry: newest,
    })
  })
)

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { entry } = req.body
    if (!entry || !entry.id) {
      return res.status(400).json({ error: "Entry with id is required" })
    }
    const selector = resolveSeasonSelector({
      year: req.body?.year,
      formId: req.body?.formId,
      eventName: entry.eventName,
    })
    const { prisma } = await getSeasonPrisma(selector)

    await ensureScoutingIdSchema(prisma)
    await resetAutoIncrementIfEmpty(prisma)

    const payload = {
      clientId: entry.id,
      teamNumber: entry.teamNumber || null,
      matchNumber: entry.matchNumber || null,
      alliance: entry.alliance || null,
      scoutName: entry.scoutName || null,
      eventName: entry.eventName || null,
      data: stringifyJsonValue(entry.data, {}),
      timestamp: toMsBigInt(Date.now())
    }

    await prisma.scoutingEntry.upsert({
      where: { clientId: payload.clientId },
      create: payload,
      update: payload,
    })

    if (entry.eventName && entry.matchNumber) {
      Promise.resolve(updateMatchProgress(entry.eventName, entry.matchNumber)).catch((error) => {
        console.warn("Failed to update match progress", error)
      })
    }

    res.status(201).json({ success: true })
  })
)

router.post(
  "/bulk",
  asyncHandler(async (req, res) => {
    const { entries } = req.body
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: "entries array required" })
    }
    const firstEvent = entries.find((item) => item?.eventName)?.eventName
    const selector = resolveSeasonSelector({
      year: req.body?.year,
      formId: req.body?.formId,
      eventName: firstEvent,
    })
    const { prisma } = await getSeasonPrisma(selector)

    await ensureScoutingIdSchema(prisma)
    await resetAutoIncrementIfEmpty(prisma)

    const operations = entries.map((entry) => {
      const payload = {
        clientId: entry.id,
        teamNumber: entry.teamNumber || null,
        matchNumber: entry.matchNumber || null,
        alliance: entry.alliance || null,
        scoutName: entry.scoutName || null,
        eventName: entry.eventName || null,
        data: stringifyJsonValue(entry.data, {}),
        timestamp: toMsBigInt(Date.now())
      }

      return prisma.scoutingEntry.upsert({
        where: { clientId: payload.clientId },
        create: payload,
        update: payload,
      })
    })

    if (operations.length) {
      await prisma.$transaction(operations)
    }

    entries.forEach((entry) => {
      if (entry?.eventName && entry?.matchNumber) {
        Promise.resolve(updateMatchProgress(entry.eventName, entry.matchNumber)).catch((error) => {
          console.warn("Failed to update match progress", error)
        })
      }
    })

    res.status(201).json({ success: true, count: entries.length })
  })
)

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const selector = resolveSeasonSelector({
      year: req.query.year,
      formId: req.query.formId,
    })
    const { prisma } = await getSeasonPrisma(selector)
    const parsedId = Number(id)
    const where = Number.isFinite(parsedId)
      ? { OR: [{ clientId: id }, { id: parsedId }] }
      : { clientId: id }
    await ensureScoutingIdSchema(prisma)
    const info = await prisma.scoutingEntry.deleteMany({ where })
    res.json({ success: info.count > 0 })
  })
)

router.delete(
  "/",
  asyncHandler(async (_req, res) => {
    const { prisma } = await getSeasonPrisma()
    await ensureScoutingIdSchema(prisma)
    await prisma.scoutingEntry.deleteMany({})
    res.json({ success: true })
  })
)

router.post(
  "/query",
  asyncHandler(async (req, res) => {
    const { filters = {} } = req.body
    const selector = resolveSeasonSelector({
      year: req.body?.year,
      formId: req.body?.formId,
      eventName: Array.isArray(filters.eventNames) ? filters.eventNames[0] : undefined,
    })
    const { prisma } = await getSeasonPrisma(selector)
    const where = {}

    if (filters.teamNumbers?.length) {
      where.teamNumber = { in: filters.teamNumbers }
    }
    if (filters.matchNumbers?.length) {
      where.matchNumber = { in: filters.matchNumbers }
    }
    if (filters.eventNames?.length) {
      where.eventName = { in: filters.eventNames }
    }
    if (filters.alliances?.length) {
      where.alliance = { in: filters.alliances }
    }
    if (filters.scoutName?.length) {
      where.scoutName = { in: filters.scoutName }
    }
    if (filters.dateRange?.start && filters.dateRange?.end) {
      where.timestamp = {
        gte: toMsBigInt(filters.dateRange.start),
        lte: toMsBigInt(filters.dateRange.end),
      }
    }

    await ensureScoutingIdSchema(prisma)

    const rows = await prisma.scoutingEntry.findMany({
      where,
      orderBy: { timestamp: "asc" }
    })

    res.json({ entries: rows.map(rowToEntry) })
  })
)

router.get(
  "/export",
  asyncHandler(async (_req, res) => {
    const { prisma } = await getSeasonPrisma()
    await ensureScoutingIdSchema(prisma)

    const rows = await prisma.scoutingEntry.findMany({
      orderBy: { timestamp: "asc" }
    })
    res.json({
      entries: rows.map(rowToEntry),
      exportedAt: Date.now(),
      version: "2.0-mysql"
    })
  })
)

router.post(
  "/import",
  asyncHandler(async (req, res) => {
    const { entries, mode = "append" } = req.body
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: "entries array required" })
    }
    const firstEvent = entries.find((item) => item?.eventName)?.eventName
    const selector = resolveSeasonSelector({
      year: req.body?.year,
      formId: req.body?.formId,
      eventName: firstEvent,
    })
    const { prisma } = await getSeasonPrisma(selector)
    await ensureScoutingIdSchema(prisma)

    if (mode === "overwrite") {
      await prisma.scoutingEntry.deleteMany({})
    }

    await resetAutoIncrementIfEmpty(prisma)

    const operations = entries.map((entry) => {
      const payload = {
        clientId: entry.id,
        teamNumber: entry.teamNumber || null,
        matchNumber: entry.matchNumber || null,
        alliance: entry.alliance || null,
        scoutName: entry.scoutName || null,
        eventName: entry.eventName || null,
        data: stringifyJsonValue(entry.data, {}),
        timestamp: toMsBigInt(entry.timestamp || Date.now())
      }

      return prisma.scoutingEntry.upsert({
        where: { clientId: payload.clientId },
        create: payload,
        update: payload,
      })
    })

    if (operations.length) {
      await prisma.$transaction(operations)
    }

    res.json({ success: true, importedCount: entries.length })
  })
)

module.exports = router
