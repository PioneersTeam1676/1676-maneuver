import { apiGet, apiPost } from "./apiClient"
import type { MatchAssignment, ParsedMatch } from "@/types/schedule"

export interface MyAssignment {
  matchNumber: string
  matchOrder: number | null
  position: string       // "red-1", "blue-3", etc.
  alliance: string | null  // "red" | "blue"
  slotIndex: number | null // 0, 1, or 2 (add 1 to get teamPosition)
}

export async function fetchMyAssignments(eventKey: string): Promise<MyAssignment[]> {
  const data = await apiGet<{ assignments: MyAssignment[] }>(
    `/schedule/my-assignments?eventKey=${encodeURIComponent(eventKey)}`
  )
  return data.assignments
}

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
