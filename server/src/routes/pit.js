const express = require("express")
const { getSeasonPrisma, resolveSeasonSelector } = require("../seasonDb")
const asyncHandler = require("../utils/asyncHandler")
const { parseJsonValue, stringifyJsonValue, toMsBigInt, fromBigInt } = require("../utils/dbUtils")
const { replaceImageDataUrls } = require("../utils/imagePermalinkStore")
const { ensureEntryIdentitySchema, updatePitEntryEmail } = require("../utils/entryIdentity")
const { ensureScoutRegistration } = require("../utils/userRegistration")
const { requireLeadRole, isLeadEmail } = require("../utils/requireLeadRole")

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
    const scoutFilter = scoutName || req.query.scout_name
    const selector = resolveSeasonSelector({
      year: req.query.year,
      formId: req.query.formId,
      eventName,
    })
    const { prisma } = await getSeasonPrisma(selector)
    await ensureEntryIdentitySchema(prisma)
    const where = {}

    if (teamNumber) where.teamNumber = String(teamNumber)
    if (eventName) where.eventName = String(eventName)
    if (scoutFilter) where.scoutName = String(scoutFilter)

    const rows = await prisma.pitEntry.findMany({
      where,
      orderBy: { timestamp: "desc" }
    })
    res.json({ entries: rows.map(rowToEntry) })
  })
)

const seasonFromQuery = (req) =>
  resolveSeasonSelector({
    year: req.query?.year,
    formId: req.query?.formId,
    eventName: req.query?.eventName,
  })

router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const { prisma } = await getSeasonPrisma(seasonFromQuery(req))
    await ensureEntryIdentitySchema(prisma)
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
    await ensureEntryIdentitySchema(prisma)
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
    await updatePitEntryEmail(prisma, payload.id, req.user?.email)
    await ensureScoutRegistration({
      email: req.user?.email,
      displayName: req.user?.name,
      photoUrl: req.user?.picture,
    }).catch((error) => {
      console.warn("[pit] scout registration after upload failed:", error?.message || error)
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
    // Group by season so each entry lands in its own season database (see
    // the matching comment in routes/scouting.js).
    const groups = new Map()
    for (const entry of entries) {
      const selector = resolveSeasonSelector({
        year: req.body?.year,
        formId: req.body?.formId,
        eventName: entry?.eventName,
      })
      const key = `${selector.year || ""}|${selector.formId || ""}`
      if (!groups.has(key)) groups.set(key, { selector, items: [] })
      groups.get(key).items.push(entry)
    }

    for (const { selector, items } of groups.values()) {
      const { prisma } = await getSeasonPrisma(selector)
      await ensureEntryIdentitySchema(prisma)

      const preparedEntries = await Promise.all(
        items.map(async (entry) => {
          const data = await replaceImageDataUrls(buildEntryData(entry), {
            year: selector.year,
            eventCode: entry?.eventName,
            teamNumber: entry?.teamNumber,
            entryId: entry?.id,
          })
          return {
            id: entry.id,
            teamNumber: entry.teamNumber || null,
            eventName: entry.eventName || null,
            scoutName: entry.scoutName || null,
            data: stringifyJsonValue(data, {}),
            timestamp: toMsBigInt(entry.timestamp || Date.now())
          }
        })
      )

      if (!preparedEntries.length) continue
      await prisma.$transaction(
        preparedEntries.map((payload) =>
          prisma.pitEntry.upsert({ where: { id: payload.id }, create: payload, update: payload })
        )
      )
      if (req.user?.email) {
        await Promise.all(preparedEntries.map((payload) => updatePitEntryEmail(prisma, payload.id, req.user.email)))
      }
    }

    if (entries.length && req.user?.email) {
      await ensureScoutRegistration({
        email: req.user.email,
        displayName: req.user?.name,
        photoUrl: req.user?.picture,
      }).catch((error) => {
        console.warn("[pit] scout registration after bulk upload failed:", error?.message || error)
      })
    }

    res.status(201).json({ success: true, count: entries.length })
  })
)

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const selector = seasonFromQuery(req)
    const { prisma } = await getSeasonPrisma(selector)
    await ensureEntryIdentitySchema(prisma)
    if (!(await isLeadEmail(req.user?.email))) {
      const requester = String(req.user?.email || "").toLowerCase()
      const owned = requester
        ? await prisma.$queryRawUnsafe(
            "SELECT id FROM pit_entries WHERE id = ? AND scout_email = ? LIMIT 1",
            String(id),
            requester
          )
        : []
      if (!Array.isArray(owned) || owned.length === 0) {
        return res.status(403).json({ error: "Only leads can delete other scouts' entries" })
      }
    }
    const info = await prisma.pitEntry.deleteMany({ where: { id } })
    res.json({ success: info.count > 0 })
  })
)

// Wipes EVERY pit entry — lead+ only (see requireLeadRole for why).
router.delete(
  "/",
  requireLeadRole,
  asyncHandler(async (req, res) => {
    const { prisma } = await getSeasonPrisma(seasonFromQuery(req))
    await ensureEntryIdentitySchema(prisma)
    await prisma.pitEntry.deleteMany({})
    res.json({ success: true })
  })
)

module.exports = router
