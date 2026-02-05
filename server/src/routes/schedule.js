const express = require("express")
const {
  replaceScheduleAssignments,
  getScheduleState,
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

    await replaceScheduleAssignments({
      eventKey,
      assignments: Array.isArray(assignments) ? assignments : [],
      matches: Array.isArray(matches) ? matches : [],
      aliases: aliases && typeof aliases === "object" ? aliases : {},
    })
    res.json({ success: true })
  })
)

module.exports = router
