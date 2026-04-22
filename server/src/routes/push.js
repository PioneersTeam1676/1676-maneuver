const express = require("express")
const {
  storeSubscription,
  removeSubscription,
  sendManualNotification,
  getSubscriptionStatusByEmail,
} = require("../services/scheduleNotifications")
const asyncHandler = require("../utils/asyncHandler")

const router = express.Router()

router.get(
  "/subscriptions/status",
  asyncHandler(async (req, res) => {
    const rawEmails = String(req.query.emails || "")
    const emails = rawEmails
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 100)

    if (!emails.length) {
      return res.status(400).json({ error: "emails query param is required" })
    }

    const statuses = await getSubscriptionStatusByEmail(emails)
    res.json({ statuses })
  })
)

router.post(
  "/subscriptions",
  asyncHandler(async (req, res) => {
    const { email, subscription, userAgent } = req.body || {}
    if (!subscription) {
      return res.status(400).json({ error: "subscription payload required" })
    }
    const result = await storeSubscription({ email, subscription, userAgent })
    res.json(result)
  })
)

router.delete(
  "/subscriptions",
  asyncHandler(async (req, res) => {
    const { endpoint } = req.body || {}
    if (!endpoint) {
      return res.status(400).json({ error: "endpoint is required" })
    }
    const result = await removeSubscription(endpoint)
    res.json(result)
  })
)

router.post(
  "/notify",
  asyncHandler(async (req, res) => {
    const { email, title, body, url } = req.body || {}
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "email is required" })
    }
    if (!body || typeof body !== "string") {
      return res.status(400).json({ error: "body is required" })
    }

    const result = await sendManualNotification({ email, title, body, url })
    if (!result.success) {
      return res.status(409).json({ error: result.reason || "Failed to deliver notification", details: result })
    }
    res.json(result)
  })
)

module.exports = router
