const express = require("express")
const { getSeasonPrisma, resolveSeasonSelector } = require("../seasonDb")
const asyncHandler = require("../utils/asyncHandler")
const { parseJsonValue, stringifyJsonValue, toMsBigInt, fromBigInt } = require("../utils/dbUtils")

const router = express.Router()

const rowToEntry = (row) => ({
  id: row.id,
  teamNumber: row.teamNumber || undefined,
  eventName: row.eventName || undefined,
  scoutName: row.scoutName || undefined,
  data: parseJsonValue(row.data, {}),
  timestamp: fromBigInt(row.timestamp, 0)
})

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

    const payload = {
      id: entry.id,
      teamNumber: entry.teamNumber || null,
      eventName: entry.eventName || null,
      scoutName: entry.scoutName || null,
      data: stringifyJsonValue(entry.data, {}),
      timestamp: toMsBigInt(entry.timestamp || Date.now())
    }

    await prisma.pitEntry.upsert({
      where: { id: payload.id },
      create: payload,
      update: payload,
    })

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

    const operations = entries.map((entry) => {
      const payload = {
        id: entry.id,
        teamNumber: entry.teamNumber || null,
        eventName: entry.eventName || null,
        scoutName: entry.scoutName || null,
        data: stringifyJsonValue(entry.data, {}),
        timestamp: toMsBigInt(entry.timestamp || Date.now())
      }

      return prisma.pitEntry.upsert({
        where: { id: payload.id },
        create: payload,
        update: payload,
      })
    })

    if (operations.length) {
      await prisma.$transaction(operations)
    }

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
