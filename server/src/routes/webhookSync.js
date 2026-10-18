const express = require("express")
const asyncHandler = require("../utils/asyncHandler")
const { getStatus, startSync, stopSync, testSync } = require("../webhookSyncManager")

const { requireLeadRole } = require("../utils/requireLeadRole")

const router = express.Router()

router.use(requireLeadRole)

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const status = await getStatus()
    res.json(status)
  })
)

router.post(
  "/start",
  asyncHandler(async (req, res) => {
    const status = await startSync(req.body?.intervalMinutes)
    res.json(status)
  })
)

router.post(
  "/stop",
  asyncHandler(async (_req, res) => {
    const status = await stopSync()
    res.json(status)
  })
)

router.post(
  "/test",
  asyncHandler(async (_req, res) => {
    const status = await testSync()
    res.json(status)
  })
)

module.exports = router
