const express = require("express")
const {
  replaceScheduleAssignments,
  getScheduleState,
  getMyAssignments,
  notifyScheduleReleased,
} = require("../services/scheduleNotifications")
const asyncHandler = require("../utils/asyncHandler")

const router = express.Router()

// In-memory TBA watch state (single active watch per server process)
let watchState = { eventKey: null, watching: false, released: false, matchCount: null, intervalId: null }

const stopWatch = () => {
  if (watchState.intervalId) {
    clearInterval(watchState.intervalId)
    watchState.intervalId = null
  }
  watchState.watching = false
}

router.post(
  "/watch",
  asyncHandler(async (req, res) => {
    const { eventKey, tbaApiKey } = req.body || {}
    if (!eventKey?.trim()) return res.status(400).json({ error: "eventKey required" })
    if (!tbaApiKey?.trim()) return res.status(400).json({ error: "tbaApiKey required" })

    stopWatch()
    watchState = { eventKey: eventKey.trim(), watching: true, released: false, matchCount: null, intervalId: null }

    const checkSchedule = async () => {
      try {
        const response = await fetch(
          `https://www.thebluealliance.com/api/v3/event/${watchState.eventKey}/matches/simple`,
          { headers: { "X-TBA-Auth-Key": tbaApiKey } }
        )
        if (!response.ok) return
        const matches = await response.json()
        if (!Array.isArray(matches)) return
        const quals = matches.filter((m) => m.comp_level === "qm")
        if (quals.length > 0) {
          stopWatch()
          watchState.released = true
          watchState.matchCount = quals.length
          notifyScheduleReleased({ eventKey: watchState.eventKey, isUpdate: false }).catch((err) =>
            console.warn("Watch: failed to notify scouts", err)
          )
        }
      } catch (err) {
        console.warn("TBA watch poll failed", err?.message || err)
      }
    }

    await checkSchedule()
    if (watchState.watching) {
      watchState.intervalId = setInterval(checkSchedule, 60_000)
    }

    res.json({ watching: watchState.watching, released: watchState.released, eventKey: watchState.eventKey, matchCount: watchState.matchCount })
  })
)

router.delete(
  "/watch",
  asyncHandler(async (_req, res) => {
    stopWatch()
    watchState = { eventKey: null, watching: false, released: false, matchCount: null, intervalId: null }
    res.json({ success: true })
  })
)

router.get(
  "/watch-status",
  asyncHandler(async (_req, res) => {
    res.json({
      watching: watchState.watching,
      released: watchState.released,
      eventKey: watchState.eventKey,
      matchCount: watchState.matchCount,
    })
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
  "/assignments",
  asyncHandler(async (req, res) => {
    const { eventKey, assignments, matches, aliases } = req.body || {}
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
    notifyScheduleReleased({ eventKey, isUpdate }).catch((err) =>
      console.error("Failed to send schedule notification", err)
    )

    res.json({ success: true })
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
