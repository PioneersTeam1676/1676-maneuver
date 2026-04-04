import {
  type MatchAssignment,
  type ParsedMatch,
  type PlayerPosition,
} from "@/types/schedule"

type ShiftStatus = "current" | "upcoming" | "completed"

export type ScoutShiftMatch = {
  matchNumber: string
  matchOrder: number | null
  position: PlayerPosition
  positionLabel: string
  alliance: "red" | "blue"
  slotIndex: number
  teamNumber?: string
  startTimestamp?: number
}

export type ScoutShiftBlock = {
  dayKey: string
  dayLabel: string
  position: PlayerPosition
  positionLabel: string
  alliance: "red" | "blue"
  startMatchNumber: string
  endMatchNumber: string
  startOrder: number | null
  endOrder: number | null
  matchCount: number
  matches: ScoutShiftMatch[]
  teams: string[]
  status: ShiftStatus
}

export type ScoutShiftDayGroup<TBlock = ScoutShiftBlock> = {
  dayKey: string
  dayLabel: string
  blocks: TBlock[]
}

export type ScheduleAssignmentOverrideRecord = {
  matchNumber: string
  position: PlayerPosition
  originalScoutEmail: string
  overrideScoutEmail: string
  reason?: string
  createdByEmail?: string
  createdAt?: number | null
}

export type CoverageShiftBlock = {
  dayKey: string
  dayLabel: string
  position: PlayerPosition
  positionLabel: string
  alliance: "red" | "blue"
  startMatchNumber: string
  endMatchNumber: string
  startOrder: number | null
  endOrder: number | null
  matchCount: number
  effectiveScoutEmail: string
  originalScoutEmail: string | null
  overrideScoutEmail: string | null
  overrideReason?: string
  matches: ScoutShiftMatch[]
  status: ShiftStatus
}

const POSITION_DETAILS: Record<
  PlayerPosition,
  { alliance: "red" | "blue"; slotIndex: number; label: string }
> = {
  "red-1": { alliance: "red", slotIndex: 0, label: "Red 1" },
  "red-2": { alliance: "red", slotIndex: 1, label: "Red 2" },
  "red-3": { alliance: "red", slotIndex: 2, label: "Red 3" },
  "blue-1": { alliance: "blue", slotIndex: 0, label: "Blue 1" },
  "blue-2": { alliance: "blue", slotIndex: 1, label: "Blue 2" },
  "blue-3": { alliance: "blue", slotIndex: 2, label: "Blue 3" },
}

const dayLabelFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  month: "short",
  day: "numeric",
})

const normalizeEmail = (value: string) => value.trim().toLowerCase()

const parseStartTime = (raw?: string) => {
  if (!raw) return undefined
  const parsed = Date.parse(raw)
  return Number.isNaN(parsed) ? undefined : parsed
}

const parseMatchOrder = (matchNumber: string) => {
  if (!matchNumber) return null
  const numericPortion = Number.parseInt(matchNumber.replace(/[^\d]/g, ""), 10)
  return Number.isNaN(numericPortion) ? null : numericPortion
}

const toDayKey = (startTimestamp?: number) => {
  if (!startTimestamp) return "schedule"
  const date = new Date(startTimestamp)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

const toDayLabel = (startTimestamp?: number) => {
  if (!startTimestamp) return "Published Schedule"
  return dayLabelFormatter.format(new Date(startTimestamp))
}

const compareMatches = (a: ScoutShiftMatch, b: ScoutShiftMatch) => {
  if (a.matchOrder != null && b.matchOrder != null && a.matchOrder !== b.matchOrder) {
    return a.matchOrder - b.matchOrder
  }
  if (a.startTimestamp != null && b.startTimestamp != null && a.startTimestamp !== b.startTimestamp) {
    return a.startTimestamp - b.startTimestamp
  }
  return a.matchNumber.localeCompare(b.matchNumber, undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

const buildOverrideKey = (matchNumber: string, position: PlayerPosition) => `${matchNumber}::${position}`

const deriveStatus = (block: {
  startOrder: number | null
  endOrder: number | null
}, lastCompletedMatch?: number | null): ShiftStatus => {
  if (typeof lastCompletedMatch !== "number") {
    return "upcoming"
  }
  if (block.endOrder != null && lastCompletedMatch >= block.endOrder) {
    return "completed"
  }
  if (
    block.startOrder != null &&
    block.endOrder != null &&
    lastCompletedMatch >= block.startOrder - 1 &&
    lastCompletedMatch < block.endOrder
  ) {
    return "current"
  }
  return "upcoming"
}

export const formatShiftRange = (block: Pick<ScoutShiftBlock, "startMatchNumber" | "endMatchNumber">) => {
  const startOrder = parseMatchOrder(block.startMatchNumber)
  const endOrder = parseMatchOrder(block.endMatchNumber)

  if (startOrder != null && endOrder != null) {
    if (startOrder === endOrder) {
      return String(startOrder)
    }
    return `${startOrder}-${endOrder}`
  }

  if (block.startMatchNumber === block.endMatchNumber) {
    return block.startMatchNumber
  }
  return `${block.startMatchNumber}-${block.endMatchNumber}`
}

export const deriveScoutShiftBlocks = ({
  email,
  assignments,
  matches,
  lastCompletedMatch,
  includeCompleted = true,
}: {
  email?: string | null
  assignments?: MatchAssignment[]
  matches?: ParsedMatch[]
  lastCompletedMatch?: number | null
  includeCompleted?: boolean
}): ScoutShiftBlock[] => {
  const normalizedEmail = email ? normalizeEmail(email) : ""
  if (!normalizedEmail) return []

  const matchMap = new Map((matches || []).map((match) => [match.matchNumber, match]))
  const individual: ScoutShiftMatch[] = []

  for (const assignment of assignments || []) {
    if (!assignment?.positions) continue

    for (const [position, assignedEmail] of Object.entries(assignment.positions) as Array<[PlayerPosition, string]>) {
      if (!assignedEmail || normalizeEmail(assignedEmail) !== normalizedEmail) {
        continue
      }

      const meta = POSITION_DETAILS[position]
      const match = matchMap.get(assignment.matchNumber)
      const startTimestamp = parseStartTime(assignment.startTime || match?.startTime)
      const allianceTeams = meta.alliance === "red" ? (match?.red || []) : (match?.blue || [])

      individual.push({
        matchNumber: assignment.matchNumber,
        matchOrder: parseMatchOrder(assignment.matchNumber),
        position,
        positionLabel: meta.label,
        alliance: meta.alliance,
        slotIndex: meta.slotIndex,
        teamNumber: allianceTeams[meta.slotIndex] || undefined,
        startTimestamp,
      })
      break
    }
  }

  individual.sort(compareMatches)

  const blocks: ScoutShiftBlock[] = []

  for (const match of individual) {
    const dayKey = toDayKey(match.startTimestamp)
    const previous = blocks[blocks.length - 1]
    const isConsecutive =
      previous &&
      previous.position === match.position &&
      previous.dayKey === dayKey &&
      previous.endOrder != null &&
      match.matchOrder != null &&
      previous.endOrder + 1 === match.matchOrder

    if (isConsecutive && previous) {
      previous.endMatchNumber = match.matchNumber
      previous.endOrder = match.matchOrder
      previous.matchCount += 1
      previous.matches.push(match)
      if (match.teamNumber && !previous.teams.includes(match.teamNumber)) {
        previous.teams.push(match.teamNumber)
      }
      continue
    }

    blocks.push({
      dayKey,
      dayLabel: toDayLabel(match.startTimestamp),
      position: match.position,
      positionLabel: match.positionLabel,
      alliance: match.alliance,
      startMatchNumber: match.matchNumber,
      endMatchNumber: match.matchNumber,
      startOrder: match.matchOrder,
      endOrder: match.matchOrder,
      matchCount: 1,
      matches: [match],
      teams: match.teamNumber ? [match.teamNumber] : [],
      status: "upcoming",
    })
  }

  const withStatus = blocks.map((block) => ({
    ...block,
    status: deriveStatus(block, lastCompletedMatch),
  }))

  return includeCompleted ? withStatus : withStatus.filter((block) => block.status !== "completed")
}

type GroupableShiftBlock = {
  dayKey: string
  dayLabel: string
  startOrder: number | null
  startMatchNumber: string
}

export const groupShiftBlocksByDay = <TBlock extends GroupableShiftBlock>(blocks: TBlock[]): ScoutShiftDayGroup<TBlock>[] => {
  const map = new Map<string, ScoutShiftDayGroup<TBlock>>()

  for (const block of blocks) {
    if (!map.has(block.dayKey)) {
      map.set(block.dayKey, {
        dayKey: block.dayKey,
        dayLabel: block.dayLabel,
        blocks: [],
      })
    }
    map.get(block.dayKey)?.blocks.push(block)
  }

  return Array.from(map.values()).map((group) => ({
    ...group,
    blocks: [...group.blocks].sort((a, b) => {
      if (a.startOrder != null && b.startOrder != null && a.startOrder !== b.startOrder) {
        return a.startOrder - b.startOrder
      }
      return a.startMatchNumber.localeCompare(b.startMatchNumber, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    }),
  }))
}

export const deriveCoverageBlocks = ({
  assignments,
  matches,
  overrides,
  lastCompletedMatch,
  includeCompleted = false,
}: {
  assignments?: MatchAssignment[]
  matches?: ParsedMatch[]
  overrides?: ScheduleAssignmentOverrideRecord[]
  lastCompletedMatch?: number | null
  includeCompleted?: boolean
}): CoverageShiftBlock[] => {
  const matchMap = new Map((matches || []).map((match) => [match.matchNumber, match]))
  const overrideMap = new Map(
    (overrides || []).map((override) => [buildOverrideKey(override.matchNumber, override.position), override])
  )
  const individual: Array<{
    match: ScoutShiftMatch
    effectiveScoutEmail: string
    originalScoutEmail: string | null
    overrideScoutEmail: string | null
    overrideReason?: string
  }> = []

  for (const assignment of assignments || []) {
    if (!assignment?.positions) continue

    for (const [position, assignedEmail] of Object.entries(assignment.positions) as Array<[PlayerPosition, string]>) {
      if (!assignedEmail) continue

      const meta = POSITION_DETAILS[position]
      const match = matchMap.get(assignment.matchNumber)
      const startTimestamp = parseStartTime(assignment.startTime || match?.startTime)
      const allianceTeams = meta.alliance === "red" ? (match?.red || []) : (match?.blue || [])
      const override = overrideMap.get(buildOverrideKey(assignment.matchNumber, position))

      individual.push({
        effectiveScoutEmail: normalizeEmail(assignedEmail),
        originalScoutEmail: override?.originalScoutEmail ? normalizeEmail(override.originalScoutEmail) : null,
        overrideScoutEmail: override?.overrideScoutEmail ? normalizeEmail(override.overrideScoutEmail) : null,
        overrideReason: override?.reason,
        match: {
          matchNumber: assignment.matchNumber,
          matchOrder: parseMatchOrder(assignment.matchNumber),
          position,
          positionLabel: meta.label,
          alliance: meta.alliance,
          slotIndex: meta.slotIndex,
          teamNumber: allianceTeams[meta.slotIndex] || undefined,
          startTimestamp,
        },
      })
    }
  }

  individual.sort((a, b) => compareMatches(a.match, b.match))

  const blocks: CoverageShiftBlock[] = []

  for (const entry of individual) {
    const dayKey = toDayKey(entry.match.startTimestamp)
    const previous = blocks[blocks.length - 1]
    const isConsecutive =
      previous &&
      previous.position === entry.match.position &&
      previous.dayKey === dayKey &&
      previous.effectiveScoutEmail === entry.effectiveScoutEmail &&
      previous.originalScoutEmail === entry.originalScoutEmail &&
      previous.overrideScoutEmail === entry.overrideScoutEmail &&
      previous.endOrder != null &&
      entry.match.matchOrder != null &&
      previous.endOrder + 1 === entry.match.matchOrder

    if (isConsecutive && previous) {
      previous.endMatchNumber = entry.match.matchNumber
      previous.endOrder = entry.match.matchOrder
      previous.matchCount += 1
      previous.matches.push(entry.match)
      continue
    }

    blocks.push({
      dayKey,
      dayLabel: toDayLabel(entry.match.startTimestamp),
      position: entry.match.position,
      positionLabel: entry.match.positionLabel,
      alliance: entry.match.alliance,
      startMatchNumber: entry.match.matchNumber,
      endMatchNumber: entry.match.matchNumber,
      startOrder: entry.match.matchOrder,
      endOrder: entry.match.matchOrder,
      matchCount: 1,
      effectiveScoutEmail: entry.effectiveScoutEmail,
      originalScoutEmail: entry.originalScoutEmail,
      overrideScoutEmail: entry.overrideScoutEmail,
      overrideReason: entry.overrideReason,
      matches: [entry.match],
      status: "upcoming",
    })
  }

  const withStatus = blocks.map((block) => ({
    ...block,
    status: deriveStatus(block, lastCompletedMatch),
  }))

  return includeCompleted ? withStatus : withStatus.filter((block) => block.status !== "completed")
}
