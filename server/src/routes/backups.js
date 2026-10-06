const express = require("express")
const asyncHandler = require("../utils/asyncHandler")
const { requireLeadRole } = require("../utils/requireLeadRole")
const { createBackupSnapshot, listBackups, resolveBackupPath } = require("../backupManager")

// Lead-only access to the rolling server snapshots (see backupManager.js).
const router = express.Router()

router.use(requireLeadRole)

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json({ backups: await listBackups() })
  })
)

// Take a snapshot right now (e.g. just before an import or a data wipe).
router.post(
  "/",
  asyncHandler(async (_req, res) => {
    const name = await createBackupSnapshot()
    res.status(201).json({ success: true, name })
  })
)

router.get("/:name", (req, res) => {
  const fullPath = resolveBackupPath(req.params.name)
  if (!fullPath) return res.status(400).json({ error: "Invalid backup name" })
  res.download(fullPath, req.params.name, (error) => {
    if (error && !res.headersSent) res.status(404).json({ error: "Backup not found" })
  })
})

module.exports = router
