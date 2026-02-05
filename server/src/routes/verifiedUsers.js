const express = require("express")
const router = express.Router()
const { prisma } = require("../db")
const asyncHandler = require("../utils/asyncHandler")

const MAX_RESULTS = 200
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60

const mapRow = (row) => ({
  id: row.id,
  email: row.email,
  role: row.role,
  verifiedAt: new Date(row.verifiedAt * 1000).toISOString(),
})

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const cutoff = Math.floor(Date.now() / 1000) - SEVEN_DAYS_SECONDS
    const rows = await prisma.verifiedUser.findMany({
      where: { verifiedAt: { gte: cutoff } },
      orderBy: { verifiedAt: "desc" },
      take: MAX_RESULTS,
    })

    res.json({ verifiedUsers: rows.map(mapRow) })
  })
)

module.exports = router
