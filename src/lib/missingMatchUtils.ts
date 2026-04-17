import { fetchRemoteSchedule } from "@/lib/scheduleApi"
import { fetchQualificationSchedule, resolveTbaApiKey } from "@/lib/tbaUtils"
import type { ParsedMatch } from "@/types/schedule"

export interface MissingMatch {
  matchNumber: string
  matchNumNormalized: string
  position: string
  alliance: "Red" | "Blue"
  slotIndex: number
  teamNumber: string
  assignedScout: string
  assignedScoutEmail: string
  eventKey: string
}

const normalizeMatchNum = (v: string) => v.replace(/\D/g, "")

export interface FindMissingMatchesOptions {
  eventKey?: string
  existingKeys: Set<string> // `${matchNumNorm}::${teamNumber}`
  latestMatchNum: number
}

export async function findMissingMatches(opts: FindMissingMatchesOptions): Promise<{
  missing: MissingMatch[]
  usedTba: boolean
  eventKey: string
}> {
  const { existingKeys, latestMatchNum } = opts

  const schedule = await fetchRemoteSchedule(opts.eventKey || undefined)
  if (!schedule || !schedule.assignments.length) {
    throw new Error("No schedule found — publish a schedule first")
  }

  const aliases = schedule.aliases ?? {}
  const effectiveEventKey = (opts.eventKey ?? "").trim() || schedule.eventKey || ""

  type MatchTeamData = { red: string[]; blue: string[] }
  const matchTeamMap = new Map<string, MatchTeamData>()
  let usedTba = false

  if (effectiveEventKey && resolveTbaApiKey()) {
    try {
      const tbaSchedule = await fetchQualificationSchedule(effectiveEventKey)
      for (const m of tbaSchedule) {
        matchTeamMap.set(String(m.matchNum), { red: m.redAlliance, blue: m.blueAlliance })
      }
      usedTba = tbaSchedule.length > 0
    } catch {
      // fall through to schedule fallback
    }
  }

  if (!usedTba) {
    const fallbackMap = new Map<string, ParsedMatch>()
    for (const m of schedule.matches) {
      fallbackMap.set(normalizeMatchNum(m.matchNumber), m)
    }
    for (const [k, m] of fallbackMap) {
      matchTeamMap.set(k, { red: m.red, blue: m.blue })
    }
  }

  const missing: MissingMatch[] = []

  for (const assignment of schedule.assignments) {
    const matchNorm = normalizeMatchNum(assignment.matchNumber)
    if (latestMatchNum > 0 && parseInt(matchNorm, 10) > latestMatchNum) continue
    const teamData = matchTeamMap.get(matchNorm)

    for (const pos of ["red-1", "red-2", "red-3", "blue-1", "blue-2", "blue-3"] as const) {
      const scoutEmail = assignment.positions[pos]
      if (!scoutEmail || scoutEmail === "Unassigned") continue

      const [allianceStr, slotStr] = pos.split("-")
      const slotIndex = parseInt(slotStr, 10) - 1

      const teamNumber = teamData
        ? (allianceStr === "red" ? teamData.red[slotIndex] : teamData.blue[slotIndex]) ?? ""
        : ""

      if (!teamNumber) continue

      if (!existingKeys.has(`${matchNorm}::${teamNumber}`)) {
        missing.push({
          matchNumber: assignment.matchNumber,
          matchNumNormalized: matchNorm,
          position: pos,
          alliance: allianceStr === "red" ? "Red" : "Blue",
          slotIndex: slotIndex + 1,
          teamNumber,
          assignedScout: aliases[scoutEmail] ?? scoutEmail,
          assignedScoutEmail: scoutEmail,
          eventKey: effectiveEventKey,
        })
      }
    }
  }

  missing.sort((a, b) => {
    const mDiff = parseInt(a.matchNumNormalized, 10) - parseInt(b.matchNumNormalized, 10)
    return mDiff !== 0 ? mDiff : a.position.localeCompare(b.position)
  })

  return { missing, usedTba, eventKey: effectiveEventKey }
}
