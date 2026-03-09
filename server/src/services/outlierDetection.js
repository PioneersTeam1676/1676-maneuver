const { getSeasonPrisma, resolveSeasonSelector } = require("../seasonDb")

/**
 * For each scouting entry in an event, check if the reported matchNumber
 * matches what the schedule expected for that scout.
 * Returns flagged entries with: entryId, scoutEmail, reportedMatch,
 * expectedMatches, likelyCorrectMatch, timestamp.
 */
const detectOutliers = async ({ eventKey }) => {
  const selector = resolveSeasonSelector({ eventKey })
  const { prisma } = await getSeasonPrisma(selector)

  // Load all entries for this event
  const entries = await prisma.scoutingEntry.findMany({
    where: { eventName: eventKey },
    select: {
      id: true,
      scoutName: true,
      matchNumber: true,
      alliance: true,
      timestamp: true,
    },
  })

  // Load all assignments for this event
  const assignments = await prisma.scoutScheduleAssignment.findMany({
    where: { eventKey },
    select: { scoutEmail: true, matchNumber: true, matchOrder: true },
  })

  // Build map: scoutEmail/name → list of assigned matchNumbers
  const assignmentMap = new Map()
  for (const a of assignments) {
    if (!assignmentMap.has(a.scoutEmail)) assignmentMap.set(a.scoutEmail, [])
    assignmentMap.get(a.scoutEmail).push(a.matchNumber)
  }

  const flagged = []

  for (const entry of entries) {
    // scoutName in entries may be email or display name — try both
    const assignedMatches =
      assignmentMap.get(entry.scoutName) ||
      assignmentMap.get((entry.scoutName || "").toLowerCase()) ||
      []

    if (!assignedMatches.length) continue // no schedule for this scout, skip

    // Check if the reported match is in assigned matches
    // Compare by extracting trailing digits to handle "qm5" vs "5"
    const reportedDigits = String(entry.matchNumber).match(/(\d+)$/)
    const reportedNum = reportedDigits ? parseInt(reportedDigits[1], 10) : null

    const isAssigned = assignedMatches.some((m) => {
      const digits = String(m).match(/(\d+)$/)
      const num = digits ? parseInt(digits[1], 10) : null
      return num !== null && num === reportedNum
    })

    if (isAssigned) continue // matches assignment, good

    // Find the most likely correct match (one they were assigned to)
    const likelyCorrectMatch = assignedMatches[0] ?? null

    flagged.push({
      entryId: entry.id,
      scoutEmail: entry.scoutName,
      reportedMatch: entry.matchNumber,
      expectedMatches: assignedMatches,
      likelyCorrectMatch,
      timestamp: entry.timestamp,
    })
  }

  return flagged
}

module.exports = { detectOutliers }
