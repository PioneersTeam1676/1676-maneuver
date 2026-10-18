const { prisma } = require("../db")
const asyncHandler = require("./asyncHandler")

// Middleware guard for destructive endpoints (delete-all, overwrite-import,
// bulk migrations). Before this existed, ANY authenticated scout could call
// e.g. DELETE /scouting and wipe every match entry for the event — the UI
// only exposed those buttons to leads, but the API itself never checked.
const LEAD_ROLE_WEIGHTS = { lead: 3, tech_lead: 4 }

// Fails closed: a lookup error counts as "not a lead".
const isLeadEmail = async (email) => {
  if (!email) return false
  try {
    const row = await prisma.role.findUnique({ where: { email: email.toLowerCase() } })
    const roleWeight = row?.role ? (LEAD_ROLE_WEIGHTS[row.role] ?? 0) : 0
    return roleWeight >= LEAD_ROLE_WEIGHTS.lead
  } catch {
    return false
  }
}

const requireLeadRole = asyncHandler(async (req, res, next) => {
  if (!(await isLeadEmail(req.user?.email))) {
    return res.status(403).json({ error: "insufficient permissions" })
  }
  next()
})

module.exports = { requireLeadRole, isLeadEmail, LEAD_ROLE_WEIGHTS }
