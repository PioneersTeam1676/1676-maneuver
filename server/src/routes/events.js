const express = require("express")
const router = express.Router()
const { getSeasonPrisma, resolveSeasonSelector } = require("../seasonDb")
const asyncHandler = require("../utils/asyncHandler")
const { nowSeconds } = require("../utils/dbUtils")

const normalizeString = (value) => (typeof value === "string" ? value.trim() : "")

const ensureSettingsRow = async (prisma) => {
  const existing = await prisma.eventSetting.findUnique({ where: { id: 1 } })
  if (existing) return existing

  return prisma.eventSetting.create({
    data: {
      id: 1,
      currentEvent: null,
      eventsJson: "[]",
      updatedAt: nowSeconds(),
    }
  })
}

const parseEvents = (raw) => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []
  } catch {
    return []
  }
}

const sanitizeEvents = (events) => {
  const unique = new Map()
  for (const value of events) {
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (!unique.has(key)) {
      unique.set(key, trimmed)
    }
  }
  return Array.from(unique.values()).sort((a, b) => a.localeCompare(b))
}

const sanitizeEventName = (value) => {
  if (typeof value !== "string") return ""
  return value.trim()
}

const parseDisplayNames = (raw) => {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const result = {}
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof key === "string" && typeof value === "string") {
          const trimmedKey = key.trim()
          const trimmedValue = value.trim()
          if (trimmedKey && trimmedValue) {
            result[trimmedKey] = trimmedValue
          }
        }
      }
      return result
    }
    return {}
  } catch {
    return {}
  }
}

const formatResponse = (row) => {
  const currentEvent = sanitizeEventName(row.currentEvent)
  let events = sanitizeEvents(parseEvents(row.eventsJson))
  if (currentEvent && !events.some((eventName) => eventName.toLowerCase() === currentEvent.toLowerCase())) {
    events = [...events, currentEvent].sort((a, b) => a.localeCompare(b))
  }
  return {
    currentEvent,
    events,
    eventDisplayNames: parseDisplayNames(row.eventDisplayNamesJson),
    updatedAt: Number(row.updatedAt) || 0,
  }
}

router.get(
  "/settings",
  asyncHandler(async (_req, res) => {
    const { prisma } = await getSeasonPrisma()
    const row = await ensureSettingsRow(prisma)
    return res.json(formatResponse(row))
  })
)

router.put(
  "/settings",
  asyncHandler(async (req, res) => {
    const { currentEvent, events, eventDisplayNames } = req.body || {}

    if (events !== undefined && !Array.isArray(events)) {
      return res.status(400).json({ error: "events must be an array of strings" })
    }

    if (eventDisplayNames !== undefined && (typeof eventDisplayNames !== "object" || Array.isArray(eventDisplayNames) || eventDisplayNames === null)) {
      return res.status(400).json({ error: "eventDisplayNames must be an object mapping event codes to display names" })
    }

    const { prisma } = await getSeasonPrisma(resolveSeasonSelector({ year: req.body?.year, eventName: currentEvent }))
    const existing = await ensureSettingsRow(prisma)
    const normalizedEvents = events !== undefined ? sanitizeEvents(events) : sanitizeEvents(parseEvents(existing.eventsJson))
    const requestedCurrent = sanitizeEventName(currentEvent)
    const existingCurrent = sanitizeEventName(existing.currentEvent)
    const nextCurrent = requestedCurrent || (currentEvent === null ? "" : existingCurrent)

    if (nextCurrent && !normalizedEvents.some((eventName) => eventName.toLowerCase() === nextCurrent.toLowerCase())) {
      normalizedEvents.push(nextCurrent)
      normalizedEvents.sort((a, b) => a.localeCompare(b))
    }

    const existingDisplayNames = parseDisplayNames(existing.eventDisplayNamesJson)
    const nextDisplayNames = eventDisplayNames !== undefined
      ? { ...existingDisplayNames, ...eventDisplayNames }
      : existingDisplayNames

    const prunedDisplayNames = {}
    for (const eventCode of normalizedEvents) {
      if (nextDisplayNames[eventCode]) {
        prunedDisplayNames[eventCode] = nextDisplayNames[eventCode]
      }
    }

    await prisma.eventSetting.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        currentEvent: nextCurrent || null,
        eventsJson: JSON.stringify(normalizedEvents),
        eventDisplayNamesJson: JSON.stringify(prunedDisplayNames),
        updatedAt: nowSeconds(),
      },
      update: {
        currentEvent: nextCurrent || null,
        eventsJson: JSON.stringify(normalizedEvents),
        eventDisplayNamesJson: JSON.stringify(prunedDisplayNames),
        updatedAt: nowSeconds(),
      }
    })

    const updated = await ensureSettingsRow(prisma)
    return res.json(formatResponse(updated))
  })
)

module.exports = router
