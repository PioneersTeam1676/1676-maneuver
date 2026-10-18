const { nowSeconds } = require("./dbUtils")

// Admin accounts configured through the environment. The frontend has always
// treated these as leads/tech leads, but the server only ever looked at the
// `roles` table, so on a fresh database (new season, new server) the
// configured admin saw the admin UI yet every approval came back 403 and
// nobody could ever be verified. ensureConfiguredAdmins() writes them into
// the roles table so every server-side role check agrees with the UI.
//
// Tech lead: ULTRA_ADMIN_EMAILS, GOOGLE_ADMIN_EMAIL and their VITE_ twins
// (the frontend grants VITE_GOOGLE_ADMIN_EMAIL tech-lead access too).
// Lead:      ADMIN_EMAILS.

const parseEmails = (...values) =>
  Array.from(
    new Set(
      values.flatMap((value) =>
        String(value || "")
          .split(",")
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email.includes("@"))
      )
    )
  )

const getConfiguredTechLeadEmails = () =>
  parseEmails(
    process.env.ULTRA_ADMIN_EMAILS,
    process.env.ULTRA_ADMIN_EMAIL,
    process.env.GOOGLE_ADMIN_EMAIL,
    process.env.VITE_ULTRA_ADMIN_EMAIL,
    process.env.VITE_GOOGLE_ADMIN_EMAIL
  )

const getConfiguredLeadEmails = () => {
  const techLeads = new Set(getConfiguredTechLeadEmails())
  return parseEmails(process.env.ADMIN_EMAILS, process.env.ADMIN_EMAIL).filter((email) => !techLeads.has(email))
}

const getConfiguredRole = (email) => {
  const normalized = String(email || "").trim().toLowerCase()
  if (!normalized) return null
  if (getConfiguredTechLeadEmails().includes(normalized)) return "tech_lead"
  if (getConfiguredLeadEmails().includes(normalized)) return "lead"
  return null
}

const ROLE_RANK = { lead: 3, tech_lead: 4 }

// Idempotent. Only ever raises a configured admin to their configured role;
// never touches anyone else and never lowers a tech lead to lead.
const ensureConfiguredAdmins = async (prisma) => {
  const targets = [
    ...getConfiguredTechLeadEmails().map((email) => [email, "tech_lead"]),
    ...getConfiguredLeadEmails().map((email) => [email, "lead"]),
  ]
  for (const [email, role] of targets) {
    const existing = await prisma.role.findUnique({ where: { email }, select: { role: true } })
    if ((ROLE_RANK[existing?.role] || 0) >= ROLE_RANK[role]) continue
    const timestamp = nowSeconds()
    await prisma.role.upsert({
      where: { email },
      create: { email, role, createdAt: timestamp, updatedAt: timestamp },
      update: { role, updatedAt: timestamp },
    })
  }
  return targets.length
}

module.exports = {
  getConfiguredTechLeadEmails,
  getConfiguredLeadEmails,
  getConfiguredRole,
  ensureConfiguredAdmins,
}
