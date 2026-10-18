const { findEntriesOwnedByOthers } = require("./entryIdentity")

// Guard for routes that expose the team's collected data. The scouting and
// pit routers let unapproved accounts through so they can still submit (see
// apiAuth's allowPendingRole), but reading everything back is for team
// accounts, outside accounts a lead approved, and the service token only.
const requireApprovedUser = (req, res, next) => {
  if (req.authz?.approved) return next()
  return res.status(403).json({ error: "Account awaiting approval", reason: "not_approved" })
}

// Saves upsert by client-chosen id, so without this an unapproved caller
// (pending account, rescue-mode submission) could replace any stored entry
// whose id it knew. They may add entries and re-send their own, nothing
// else. Returns true when it has already answered 403.
const refuseForeignOverwrite = async (req, res, prisma, kind, ids) => {
  if (req.authz?.approved) return false
  const foreign = await findEntriesOwnedByOthers(prisma, kind, ids, req.user?.email)
  if (!foreign.length) return false
  res.status(403).json({ error: "Entry belongs to another scout", reason: "not_owner", ids: foreign })
  return true
}

module.exports = { requireApprovedUser, refuseForeignOverwrite }
