const express = require("express")
const { getSeasonPrisma, resolveSeasonSelector } = require("../seasonDb")
const asyncHandler = require("../utils/asyncHandler")
const { parseJsonValue, stringifyJsonValue, toMsBigInt, fromBigInt } = require("../utils/dbUtils")
const { replaceImageDataUrls } = require("../utils/imagePermalinkStore")

const router = express.Router()

const rowToEntry = (row) => ({
  id: row.id,
  teamNumber: row.teamNumber || undefined,
  eventName: row.eventName || undefined,
  scoutName: row.scoutName || undefined,
  data: parseJsonValue(row.data, {}),
  timestamp: fromBigInt(row.timestamp, 0)
})

const payloadToEntry = (payload, data) => ({
  id: payload.id,
  teamNumber: payload.teamNumber || undefined,
  eventName: payload.eventName || undefined,
  scoutName: payload.scoutName || undefined,
  data,
  timestamp: fromBigInt(payload.timestamp, 0),
})

const buildEntryData = (entry) => {
  const parsed = parseJsonValue(entry?.data, null)
  if (parsed && typeof parsed === "object") {
    return parsed
  }
  const { data: _ignored, ...fallback } = entry || {}
  return fallback
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { teamNumber, eventName, scoutName } = req.query
    const selector = resolveSeasonSelector({
      year: req.query.year,
      formId: req.query.formId,
      eventName,
    })
    const { prisma } = await getSeasonPrisma(selector)
    const where = {}

    if (teamNumber) where.teamNumber = String(teamNumber)
    if (eventName) where.eventName = String(eventName)
    if (scoutName) where.scoutName = String(scoutName)

    const rows = await prisma.pitEntry.findMany({
      where,
      orderBy: { timestamp: "desc" }
    })
    res.json({ entries: rows.map(rowToEntry) })
  })
)

router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const { prisma } = await getSeasonPrisma()
    const rows = await prisma.pitEntry.findMany({
      select: {
        teamNumber: true,
        eventName: true,
        scoutName: true,
      }
    })
    const teams = new Set()
    const events = new Set()
    const scouts = new Set()

    rows.forEach((row) => {
      if (row.teamNumber) teams.add(row.teamNumber)
      if (row.eventName) events.add(row.eventName)
      if (row.scoutName) scouts.add(row.scoutName)
    })

    res.json({
      totalEntries: rows.length,
      teams: Array.from(teams).sort((a, b) => Number(a) - Number(b)),
      events: Array.from(events).sort(),
      scouts: Array.from(scouts).sort()
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
    const data = await replaceImageDataUrls(buildEntryData(entry), {
      year: selector.year,
      eventCode: entry.eventName,
      teamNumber: entry.teamNumber,
      entryId: entry.id,
    })

    const payload = {
      id: entry.id,
      teamNumber: entry.teamNumber || null,
      eventName: entry.eventName || null,
      scoutName: entry.scoutName || null,
      data: stringifyJsonValue(data, {}),
      timestamp: toMsBigInt(entry.timestamp || Date.now())
    }

    await prisma.pitEntry.upsert({
      where: { id: payload.id },
      create: payload,
      update: payload,
    })

    res.status(201).json({ success: true, entry: payloadToEntry(payload, data) })
  })
)

router.post(
  "/bulk",
  asyncHandler(async (req, res) => {
    const { entries } = req.body
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: "entries array required" })
    }
    if (entries.some((item) => !item || !item.id)) {
      return res.status(400).json({ error: "Each entry must include an id" })
    }
    const firstEvent = entries.find((item) => item?.eventName)?.eventName
    const selector = resolveSeasonSelector({
      year: req.body?.year,
      formId: req.body?.formId,
      eventName: firstEvent,
    })
    const { prisma } = await getSeasonPrisma(selector)

    const preparedEntries = await Promise.all(
      entries.map(async (entry) => {
        const data = await replaceImageDataUrls(buildEntryData(entry), {
          year: selector.year,
          eventCode: entry?.eventName,
          teamNumber: entry?.teamNumber,
          entryId: entry?.id,
        })
        const payload = {
          id: entry.id,
          teamNumber: entry.teamNumber || null,
          eventName: entry.eventName || null,
          scoutName: entry.scoutName || null,
          data: stringifyJsonValue(data, {}),
          timestamp: toMsBigInt(entry.timestamp || Date.now())
        }
        return { payload, data }
      })
    )

    const operations = preparedEntries.map(({ payload }) => {
      return prisma.pitEntry.upsert({
        where: { id: payload.id },
        create: payload,
        update: payload,
      })
    })

    if (operations.length) {
      await prisma.$transaction(operations)
    }

    res.status(201).json({
      success: true,
      count: entries.length,
      entries: preparedEntries.map(({ payload, data }) => payloadToEntry(payload, data))
    })
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
    const info = await prisma.pitEntry.deleteMany({ where: { id } })
    res.json({ success: info.count > 0 })
  })
)

router.delete(
  "/",
  asyncHandler(async (_req, res) => {
    const { prisma } = await getSeasonPrisma()
    await prisma.pitEntry.deleteMany({})
    res.json({ success: true })
  })
)

module.exports = router
