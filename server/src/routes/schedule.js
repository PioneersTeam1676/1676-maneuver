const express = require("express")
const {
  replaceScheduleAssignments,
  getScheduleState,
  getMyAssignments,
  notifyScheduleReleased,
} = require("../services/scheduleNotifications")
const asyncHandler = require("../utils/asyncHandler")

const router = express.Router()

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
