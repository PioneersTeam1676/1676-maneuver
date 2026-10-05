const express = require("express")
const { prisma } = require("../db")
const {
  replaceScheduleAssignments,
  getScheduleState,
  getMyAssignments,
  notifyScheduleReleased,
  applyCoverageOverride,
  clearCoverageOverride,
  setMatchProgress,
} = require("../services/scheduleNotifications")
const asyncHandler = require("../utils/asyncHandler")

const router = express.Router()
const MANAGER_ROLES = new Set(["lead", "tech_lead"])
const TBA_POLL_INTERVAL_MS = 15_000
const DEFAULT_TBA_API_KEY = String(process.env.TBA_API_KEY || process.env.VITE_TBA_API_KEY || "").trim()

const requireScheduleManager = async (req, res) => {
  const email = req.user?.email
  if (!email) {
    res.status(401).json({ error: "Not authenticated" })
    return false
  }

  const roleRow = await prisma.role.findUnique({
    where: { email: String(email).trim().toLowerCase() },
    select: { role: true },
  })

  if (!roleRow || !MANAGER_ROLES.has(roleRow.role)) {
    res.status(403).json({ error: "Forbidden" })
    return false
  }

  return true
}

// In-memory TBA watch state (single active watch per server process)
let watchState = {
  eventKey: null,
  watching: false,
  released: false,
  matchCount: null,
  lastCompletedMatch: null,
  lastSyncedAt: null,
  intervalId: null,
  tbaApiKey: null,
}

const stopWatch = () => {
  if (watchState.intervalId) {
    clearInterval(watchState.intervalId)
    watchState.intervalId = null
  }
  watchState.watching = false
}

const buildWatchStatus = () => ({
  watching: watchState.watching,
  released: watchState.released,
  eventKey: watchState.eventKey,
  matchCount: watchState.matchCount,
  lastCompletedMatch: watchState.lastCompletedMatch,
  lastSyncedAt: watchState.lastSyncedAt,
})

const isCompletedQualificationMatch = (match) => {
  if (!match || match.comp_level !== "qm") {
    return false
  }

  if (Number(match.post_result_time) > 0) {
    return true
  }

  if (typeof match.winning_alliance === "string" && match.winning_alliance.trim()) {
    return true
  }

  const redScore = Number(match?.alliances?.red?.score)
  const blueScore = Number(match?.alliances?.blue?.score)
  return Number.isFinite(redScore) && Number.isFinite(blueScore) && redScore >= 0 && blueScore >= 0
}

const syncWatchState = async () => {
  const eventKey = watchState.eventKey
  const tbaApiKey = watchState.tbaApiKey || DEFAULT_TBA_API_KEY
  if (!eventKey || !tbaApiKey) {
    return buildWatchStatus()
  }

  const response = await fetch(
    `https://www.thebluealliance.com/api/v3/event/${eventKey}/matches/simple`,
    { headers: { "X-TBA-Auth-Key": tbaApiKey } }
  )
  if (!response.ok) {
    throw new Error(`TBA sync failed: ${response.status} ${response.statusText}`)
  }

  const matches = await response.json()
  if (!Array.isArray(matches)) {
    return buildWatchStatus()
  }

  const quals = matches.filter((match) => match?.comp_level === "qm")
  const lastCompletedMatch = quals.reduce((max, match) => {
    if (!isCompletedQualificationMatch(match)) {
      return max
    }
    const matchNumber = Number.parseInt(String(match.match_number ?? ""), 10)
    return Number.isFinite(matchNumber) ? Math.max(max, matchNumber) : max
  }, 0)

  watchState.released = quals.length > 0
  watchState.matchCount = quals.length
  watchState.lastCompletedMatch = lastCompletedMatch
  watchState.lastSyncedAt = Date.now()

  await setMatchProgress({
    eventKey,
    lastCompletedMatch,
    processNotifications: true,
  })

  return buildWatchStatus()
}

const startWatch = async ({ eventKey, tbaApiKey }) => {
  const normalizedEventKey = String(eventKey || "").trim()
  const resolvedApiKey = String(tbaApiKey || DEFAULT_TBA_API_KEY || "").trim()
  if (!normalizedEventKey) {
    throw new Error("eventKey required")
  }
  if (!resolvedApiKey) {
    throw new Error("tbaApiKey required")
  }

  stopWatch()
  watchState = {
    eventKey: normalizedEventKey,
    watching: true,
    released: false,
    matchCount: null,
    lastCompletedMatch: null,
    lastSyncedAt: null,
    intervalId: null,
    tbaApiKey: resolvedApiKey,
  }

  await syncWatchState()
  watchState.intervalId = setInterval(() => {
    syncWatchState().catch((err) => {
      console.warn("TBA progress poll failed", err?.message || err)
    })
  }, TBA_POLL_INTERVAL_MS)

  return buildWatchStatus()
}

router.post(
  "/watch",
  asyncHandler(async (req, res) => {
    if (!(await requireScheduleManager(req, res))) {
      return
    }
    const { eventKey, tbaApiKey } = req.body || {}
    if (!eventKey?.trim()) return res.status(400).json({ error: "eventKey required" })
    const status = await startWatch({ eventKey: eventKey.trim(), tbaApiKey })
    res.json(status)
  })
)

router.delete(
  "/watch",
  asyncHandler(async (req, res) => {
    if (!(await requireScheduleManager(req, res))) {
      return
    }
    stopWatch()
    watchState = {
      eventKey: null,
      watching: false,
      released: false,
      matchCount: null,
      lastCompletedMatch: null,
      lastSyncedAt: null,
      intervalId: null,
      tbaApiKey: null,
    }
    res.json({ success: true })
  })
)

router.get(
  "/watch-status",
  asyncHandler(async (_req, res) => {
    res.json(buildWatchStatus())
  })
)

router.get(
  "/assignments",
  asyncHandler(async (req, res) => {
    const { eventKey } = req.query
    const state = await getScheduleState(eventKey)
    res.json(state)
  })
)

router.post(
  "/progress",
  asyncHandler(async (req, res) => {
    if (!(await requireScheduleManager(req, res))) {
      return
    }

    const { eventKey, lastCompletedMatch, clearNotifications } = req.body || {}
    if (!eventKey || typeof eventKey !== "string" || !eventKey.trim()) {
      return res.status(400).json({ error: "eventKey is required" })
    }

    const parsedLastCompletedMatch = Number.parseInt(String(lastCompletedMatch ?? ""), 10)
    if (!Number.isFinite(parsedLastCompletedMatch) || parsedLastCompletedMatch < 0) {
      return res.status(400).json({ error: "lastCompletedMatch must be a non-negative integer" })
    }

    const result = await setMatchProgress({
      eventKey: eventKey.trim(),
      lastCompletedMatch: parsedLastCompletedMatch,
      clearNotifications: clearNotifications === true,
      processNotifications: false,
    })

    if (watchState.eventKey === eventKey.trim()) {
      watchState.lastCompletedMatch = parsedLastCompletedMatch
      watchState.lastSyncedAt = Date.now()
    }

    res.json({
      success: true,
      eventKey: eventKey.trim(),
      lastCompletedMatch: result.lastCompletedMatch,
      changed: result.changed,
    })
  })
)

// Replacing the schedule (and optionally notifying every scout) is
// lead-only, like the other schedule writes.
router.post(
  "/assignments",
  asyncHandler(async (req, res) => {
    if (!(await requireScheduleManager(req, res))) {
      return
    }
    const { eventKey, assignments, matches, aliases, notify } = req.body || {}
    if (!eventKey || typeof eventKey !== "string" || !eventKey.trim()) {
      return res.status(400).json({ error: "eventKey is required" })
    }

    const existingState = await getScheduleState(eventKey)
    const isUpdate = Array.isArray(existingState?.assignments) && existingState.assignments.length > 0

    await replaceScheduleAssignments({
      eventKey,
      assignments: Array.isArray(assignments) ? assignments : [],
      matches: Array.isArray(matches) ? matches : [],
      aliases: aliases && typeof aliases === "object" ? aliases : {},
    })

    // Fire-and-forget — do not block the response
    if (notify === true) {
      notifyScheduleReleased({ eventKey, isUpdate }).catch((err) =>
        console.error("Failed to send schedule notification", err)
      )
    }

    res.json({ success: true })
  })
)

router.post(
  "/coverage-overrides",
  asyncHandler(async (req, res) => {
    if (!(await requireScheduleManager(req, res))) {
      return
    }

    const { eventKey, matchNumbers, position, overrideScoutEmail, reason } = req.body || {}
    const result = await applyCoverageOverride({
      eventKey,
      matchNumbers: Array.isArray(matchNumbers) ? matchNumbers : [],
      position,
      overrideScoutEmail,
      reason,
      createdByEmail: req.user?.email || null,
    })

    res.json(result)
  })
)

router.delete(
  "/coverage-overrides",
  asyncHandler(async (req, res) => {
    if (!(await requireScheduleManager(req, res))) {
      return
    }

    const { eventKey, matchNumbers, position } = req.body || {}
    const result = await clearCoverageOverride({
      eventKey,
      matchNumbers: Array.isArray(matchNumbers) ? matchNumbers : [],
      position,
    })

    res.json(result)
  })
)

router.get(
  "/my-assignments",
  asyncHandler(async (req, res) => {
    const { eventKey } = req.query
    if (!eventKey) return res.status(400).json({ error: "eventKey required" })
    // req.user is only set when Google OAuth is configured; token-auth callers cannot use this endpoint
    const email = req.user?.email
    if (!email) return res.status(401).json({ error: "not authenticated" })
    const assignments = await getMyAssignments({ eventKey, email })
    res.json({ assignments })
  })
)

module.exports = router
