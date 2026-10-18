const { prisma } = require("../db")
const asyncHandler = require("./asyncHandler")

// Middleware guard for destructive endpoints (delete-all, overwrite-import,
// bulk migrations). Before this existed, ANY authenticated scout could call
// e.g. DELETE /scouting and wipe every match entry for the event — the UI
// only exposed those buttons to leads, but the API itself never checked.
const LEAD_ROLE_WEIGHTS = { lead: 3, tech_lead: 4 }

const requireLeadRole = asyncHandler(async (req, res, next) => {
  const email = req.user?.email
  if (!email) return res.status(403).json({ error: "insufficient permissions" })
  try {
    const row = await prisma.role.findUnique({ where: { email: email.toLowerCase() } })
    const roleWeight = row?.role ? (LEAD_ROLE_WEIGHTS[row.role] ?? 0) : 0
    if (roleWeight < LEAD_ROLE_WEIGHTS.lead) {
      return res.status(403).json({ error: "insufficient permissions" })
    }
  } catch {
    return res.status(403).json({ error: "insufficient permissions" })
  }
  next()
})

// True when the account is lead or tech lead. Throws on database errors so
// callers answer 503 instead of silently denying.
const isLeadEmail = async (email) => {
  const normalized = String(email || "").trim().toLowerCase()
  if (!normalized) return false
  const row = await prisma.role.findUnique({ where: { email: normalized }, select: { role: true } })
  return (LEAD_ROLE_WEIGHTS[row?.role] ?? 0) >= LEAD_ROLE_WEIGHTS.lead
}

module.exports = { requireLeadRole, isLeadEmail, LEAD_ROLE_WEIGHTS }
