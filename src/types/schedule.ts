export const PLAYER_POSITIONS = [
  "red-1",
  "red-2",
  "red-3",
  "blue-1",
  "blue-2",
  "blue-3",
] as const

export type PlayerPosition = (typeof PLAYER_POSITIONS)[number]

export interface ParsedMatch {
  matchNumber: string
  startTime?: string
  red: string[]
  blue: string[]
}

export interface MatchAssignment {
  matchNumber: string
  startTime?: string
  positions: Record<PlayerPosition, string>
}

export interface StoredScheduleState {
  eventKey: string
  matches: ParsedMatch[]
  assignments: MatchAssignment[]
  aliases?: Record<string, string>
  mode?: "auto" | "manual"
}
