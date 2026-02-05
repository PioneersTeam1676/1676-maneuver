import { apiGet, apiPost } from "./apiClient"
import type { MatchAssignment, ParsedMatch } from "@/types/schedule"

export interface RemoteScheduleState {
  eventKey: string | null
  assignments: MatchAssignment[]
  matches: ParsedMatch[]
  updatedAt: number | null
  aliases?: Record<string, string>
  mode?: "auto" | "manual"
}

export const fetchRemoteSchedule = async (eventKey?: string): Promise<RemoteScheduleState | null> => {
  const query = eventKey ? `?eventKey=${encodeURIComponent(eventKey)}` : ""
  try {
    return await apiGet<RemoteScheduleState>(`/schedule/assignments${query}`)
  } catch (error) {
    console.warn("Failed to fetch remote schedule", error)
    return null
  }
}

export const syncScheduleAssignments = async (payload: {
  eventKey: string
  matches: ParsedMatch[]
  assignments: MatchAssignment[]
  aliases?: Record<string, string>
}): Promise<void> => {
  try {
    await apiPost("/schedule/assignments", payload)
  } catch (error) {
    console.warn("Failed to sync schedule assignments", error)
  }
}
