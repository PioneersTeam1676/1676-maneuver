import { apiDelete, apiGet, apiPost } from "./apiClient"
import { readCachedScheduleState, writeCachedScheduleState } from "./scheduleCache"
import type { MatchAssignment, ParsedMatch, PlayerPosition } from "@/types/schedule"

const POSITION_DETAILS: Record<PlayerPosition, { alliance: "red" | "blue"; slotIndex: number }> = {
  "red-1": { alliance: "red", slotIndex: 0 },
  "red-2": { alliance: "red", slotIndex: 1 },
  "red-3": { alliance: "red", slotIndex: 2 },
  "blue-1": { alliance: "blue", slotIndex: 0 },
  "blue-2": { alliance: "blue", slotIndex: 1 },
  "blue-3": { alliance: "blue", slotIndex: 2 },
}

const normalizeEmail = (value: string) => value.trim().toLowerCase()

const parseMatchOrder = (matchNumber: string) => {
  const digits = matchNumber.match(/\d+/g)
  if (!digits?.length) return null
  const parsed = Number.parseInt(digits[digits.length - 1], 10)
  return Number.isFinite(parsed) ? parsed : null
}

const normalizeAssignmentPosition = (position: string): PlayerPosition | null => {
  if (position in POSITION_DETAILS) return position as PlayerPosition
  const previousMatch = position.match(/^(.+)-prev$/)
  if (previousMatch?.[1] && previousMatch[1] in POSITION_DETAILS) {
    return previousMatch[1] as PlayerPosition
  }
  return null
}

export interface MyAssignment {
  matchNumber: string
  matchOrder: number | null
  position: string       // "red-1", "blue-3", etc.
  alliance: string | null  // "red" | "blue"
  slotIndex: number | null // 0, 1, or 2 (add 1 to get teamPosition)
}

export const deriveMyAssignmentsFromSchedule = ({
  email,
  schedule,
}: {
  email?: string | null
  schedule?: RemoteScheduleState | null
}): MyAssignment[] => {
  const normalizedEmail = email ? normalizeEmail(email) : ""
  if (!normalizedEmail || !schedule?.assignments?.length) {
    return []
  }

  const seen = new Set<string>()
  const derived: MyAssignment[] = []

  for (const assignment of schedule.assignments) {
    const positions = assignment.positions as Record<string, string> | undefined
    if (!positions) continue

    for (const [rawPosition, assignedEmail] of Object.entries(positions)) {
      if (!assignedEmail || normalizeEmail(assignedEmail) !== normalizedEmail) {
        continue
      }

      const position = normalizeAssignmentPosition(rawPosition)
      if (!position) continue

      const key = `${assignment.matchNumber}::${position}`
      if (seen.has(key)) continue
      seen.add(key)

      const details = POSITION_DETAILS[position]
      derived.push({
        matchNumber: assignment.matchNumber,
        matchOrder: parseMatchOrder(assignment.matchNumber),
        position,
        alliance: details.alliance,
        slotIndex: details.slotIndex,
      })
    }
  }

  return derived.sort((a, b) => {
    if (a.matchOrder != null && b.matchOrder != null && a.matchOrder !== b.matchOrder) {
      return a.matchOrder - b.matchOrder
    }
    return a.matchNumber.localeCompare(b.matchNumber, undefined, {
      numeric: true,
      sensitivity: "base",
    })
  })
}

export async function fetchMyAssignments(eventKey: string): Promise<MyAssignment[]> {
  const data = await apiGet<{ assignments: MyAssignment[] }>(
    `/schedule/my-assignments?eventKey=${encodeURIComponent(eventKey)}`
  )
  return Array.isArray(data?.assignments) ? data.assignments : []
}

export interface RemoteScheduleState {
  eventKey: string | null
  assignments: MatchAssignment[]
  matches: ParsedMatch[]
  overrides?: Array<{
    matchNumber: string
    position: PlayerPosition
    originalScoutEmail: string
    overrideScoutEmail: string
    reason?: string
    createdByEmail?: string
    createdAt?: number | null
  }>
  updatedAt: number | null
  lastCompletedMatch?: number | null
  aliases?: Record<string, string>
  mode?: "auto" | "manual"
}

export const fetchRemoteSchedule = async (eventKey?: string): Promise<RemoteScheduleState | null> => {
  const query = eventKey ? `?eventKey=${encodeURIComponent(eventKey)}` : ""
  try {
    const remote = await apiGet<RemoteScheduleState>(`/schedule/assignments${query}`)
    writeCachedScheduleState(remote)
    return remote
  } catch (error) {
    console.warn("Failed to fetch remote schedule", error)
    return readCachedScheduleState(eventKey)
  }
}

export const syncScheduleAssignments = async (payload: {
  eventKey: string
  matches: ParsedMatch[]
  assignments: MatchAssignment[]
  aliases?: Record<string, string>
  notify?: boolean
}): Promise<void> => {
  try {
    await apiPost("/schedule/assignments", payload)
  } catch (error) {
    console.warn("Failed to sync schedule assignments", error)
  }
}

export const applyScheduleCoverageOverride = async (payload: {
  eventKey: string
  matchNumbers: string[]
  position: string
  overrideScoutEmail: string
  reason?: string
}): Promise<{ success: boolean; affectedCount: number }> => {
  return apiPost("/schedule/coverage-overrides", payload)
}

export const clearScheduleCoverageOverride = async (payload: {
  eventKey: string
  matchNumbers: string[]
  position: string
}): Promise<{ success: boolean; affectedCount: number }> => {
  return apiDelete("/schedule/coverage-overrides", payload)
}
