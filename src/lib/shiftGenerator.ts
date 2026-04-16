import type { MatchAssignment } from '@/types/schedule'

export interface ScoutInput {
  email: string
  displayName: string
  targetShifts: 1 | 2 | 3
}

export interface ShiftGeneratorInput {
  scouts: ScoutInput[]
  totalMatches: number
  shiftSize: number
  overlapEnabled?: boolean
}

export interface ShiftRange {
  label: string
  start: number
  end: number
  overlapAtStart?: boolean
}

export interface GeneratedSchedule {
  assignments: MatchAssignment[]
  shiftRanges: ShiftRange[]
  warnings: string[]
  csv: string
}

const POSITIONS = ['red-1', 'red-2', 'red-3', 'blue-1', 'blue-2', 'blue-3'] as const
type Position = typeof POSITIONS[number]

const POSITION_LABELS: Record<Position, string> = {
  'red-1': 'Red 1',
  'red-2': 'Red 2',
  'red-3': 'Red 3',
  'blue-1': 'Blue 1',
  'blue-2': 'Blue 2',
  'blue-3': 'Blue 3',
}

const computeShiftRanges = (totalMatches: number, shiftSize: number, overlap = false): ShiftRange[] => {
  const ranges: ShiftRange[] = []
  const effectiveSize = Math.max(1, shiftSize)
  const step = overlap && effectiveSize > 1 ? effectiveSize - 1 : effectiveSize
  let start = 1
  while (start <= totalMatches) {
    const end = Math.min(start + effectiveSize - 1, totalMatches)
    // With overlap, don't create a degenerate single-boundary shift at the end
    if (overlap && ranges.length > 0 && end === start) {
      break
    }
    ranges.push({
      label: `Match ${start}-${end}`,
      start,
      end,
      overlapAtStart: overlap && ranges.length > 0,
    })
    start += step
  }
  return ranges
}

const compareScoutsByName = (a: ScoutInput, b: ScoutInput) => (
  (a.displayName || a.email).localeCompare(b.displayName || b.email)
)

const computeDesiredAssignments = (scouts: ScoutInput[], numShifts: number) => {
  const desired = new Map<string, number>(scouts.map((scout) => [scout.email, 0]))
  const totalAssignments = numShifts * POSITIONS.length

  for (let index = 0; index < totalAssignments; index += 1) {
    const available = scouts.filter((scout) => (desired.get(scout.email) ?? 0) < numShifts)
    if (available.length === 0) {
      break
    }

    const chosen = available.reduce((best, scout) => {
      const bestAssigned = desired.get(best.email) ?? 0
      const scoutAssigned = desired.get(scout.email) ?? 0
      const bestRatio = bestAssigned / best.targetShifts
      const scoutRatio = scoutAssigned / scout.targetShifts

      if (scoutRatio !== bestRatio) {
        return scoutRatio < bestRatio ? scout : best
      }
      if (scoutAssigned !== bestAssigned) {
        return scoutAssigned < bestAssigned ? scout : best
      }
      if (scout.targetShifts !== best.targetShifts) {
        return scout.targetShifts > best.targetShifts ? scout : best
      }
      return compareScoutsByName(scout, best) < 0 ? scout : best
    })

    desired.set(chosen.email, (desired.get(chosen.email) ?? 0) + 1)
  }

  return desired
}

const chooseScoutForShift = (
  candidates: ScoutInput[],
  desiredAssignments: Map<string, number>,
  assignedCounts: Map<string, number>,
  lastShiftIndex: Map<string, number>,
) => {
  return candidates.reduce((best, scout) => {
    const bestDesired = desiredAssignments.get(best.email) ?? 0
    const scoutDesired = desiredAssignments.get(scout.email) ?? 0
    const bestAssigned = assignedCounts.get(best.email) ?? 0
    const scoutAssigned = assignedCounts.get(scout.email) ?? 0
    const bestGap = bestDesired - bestAssigned
    const scoutGap = scoutDesired - scoutAssigned

    const bestNeedsCoverage = bestGap > 0 ? 0 : 1
    const scoutNeedsCoverage = scoutGap > 0 ? 0 : 1
    if (scoutNeedsCoverage !== bestNeedsCoverage) {
      return scoutNeedsCoverage < bestNeedsCoverage ? scout : best
    }
    if (scoutGap !== bestGap) {
      return scoutGap > bestGap ? scout : best
    }
    if (scoutAssigned !== bestAssigned) {
      return scoutAssigned < bestAssigned ? scout : best
    }

    const bestLastShift = lastShiftIndex.get(best.email) ?? -1
    const scoutLastShift = lastShiftIndex.get(scout.email) ?? -1
    if (scoutLastShift !== bestLastShift) {
      return scoutLastShift < bestLastShift ? scout : best
    }
    if (scout.targetShifts !== best.targetShifts) {
      return scout.targetShifts > best.targetShifts ? scout : best
    }
    return compareScoutsByName(scout, best) < 0 ? scout : best
  })
}

const assignPositionsForShift = (
  selectedScouts: ScoutInput[],
  shiftIdx: number,
  positionCounts: Map<string, Map<Position, number>>,
  lastPosition: Map<string, Position | null>,
) => {
  const remaining = [...selectedScouts]
  const assignments = new Map<Position, string>()
  const orderedPositions = POSITIONS.map((_, index) => POSITIONS[(shiftIdx + index) % POSITIONS.length])

  for (const position of orderedPositions) {
    if (remaining.length === 0) {
      assignments.set(position, 'Unassigned')
      continue
    }

    const chosen = remaining.reduce((best, scout) => {
      const bestCount = positionCounts.get(best.email)?.get(position) ?? 0
      const scoutCount = positionCounts.get(scout.email)?.get(position) ?? 0
      if (scoutCount !== bestCount) {
        return scoutCount < bestCount ? scout : best
      }

      const bestRepeated = lastPosition.get(best.email) === position ? 1 : 0
      const scoutRepeated = lastPosition.get(scout.email) === position ? 1 : 0
      if (scoutRepeated !== bestRepeated) {
        return scoutRepeated < bestRepeated ? scout : best
      }

      return compareScoutsByName(scout, best) < 0 ? scout : best
    })

    assignments.set(position, chosen.email)
    positionCounts.get(chosen.email)?.set(position, (positionCounts.get(chosen.email)?.get(position) ?? 0) + 1)
    lastPosition.set(chosen.email, position)

    const chosenIndex = remaining.findIndex((scout) => scout.email === chosen.email)
    remaining.splice(chosenIndex, 1)
  }

  return assignments
}

export const generateShiftSchedule = (input: ShiftGeneratorInput): GeneratedSchedule => {
  const { scouts, totalMatches, shiftSize, overlapEnabled = false } = input

  if (scouts.length === 0) {
    return { assignments: [], shiftRanges: [], warnings: ['No scouts provided'], csv: '' }
  }
  if (totalMatches < 1 || shiftSize < 1) {
    return { assignments: [], shiftRanges: [], warnings: ['Invalid totalMatches or shiftSize'], csv: '' }
  }

  const shiftRanges = computeShiftRanges(totalMatches, shiftSize, overlapEnabled)
  const numShifts = shiftRanges.length
  const desiredAssignments = computeDesiredAssignments(scouts, numShifts)
  const assignedCounts = new Map<string, number>(scouts.map((scout) => [scout.email, 0]))
  const lastShiftIndex = new Map<string, number>(scouts.map((scout) => [scout.email, -2]))
  const lastPosition = new Map<string, Position | null>(scouts.map((scout) => [scout.email, null]))
  const positionCounts = new Map<string, Map<Position, number>>(
    scouts.map((scout) => [
      scout.email,
      new Map<Position, number>(POSITIONS.map((position) => [position, 0])),
    ]),
  )

  const shiftAssignments: Map<Position, string>[] = []
  const backToBackCounts = new Map<string, number>()
  let unassignedSlots = 0

  for (let shiftIdx = 0; shiftIdx < numShifts; shiftIdx += 1) {
    const selected: ScoutInput[] = []
    const requiredScouts = Math.min(POSITIONS.length, scouts.length)

    while (selected.length < requiredScouts) {
      const selectedEmails = new Set(selected.map((scout) => scout.email))
      const remainingCandidates = scouts.filter((scout) => !selectedEmails.has(scout.email))
      // Prefer scouts off for 2+ shifts, then 1+ shift, then anyone (minimise back-to-back)
      const rested2 = remainingCandidates.filter(
        (scout) => (lastShiftIndex.get(scout.email) ?? -3) < shiftIdx - 2,
      )
      const rested1 = remainingCandidates.filter(
        (scout) => (lastShiftIndex.get(scout.email) ?? -2) < shiftIdx - 1,
      )
      const pool = rested2.length > 0 ? rested2 : rested1.length > 0 ? rested1 : remainingCandidates
      const chosen = chooseScoutForShift(pool, desiredAssignments, assignedCounts, lastShiftIndex)
      selected.push(chosen)
    }

    const positions = assignPositionsForShift(selected, shiftIdx, positionCounts, lastPosition)
    shiftAssignments.push(positions)
    unassignedSlots += POSITIONS.length - selected.length

    for (const scout of selected) {
      const previousShift = lastShiftIndex.get(scout.email) ?? -2
      if (previousShift === shiftIdx - 1) {
        backToBackCounts.set(scout.email, (backToBackCounts.get(scout.email) ?? 0) + 1)
      }
      lastShiftIndex.set(scout.email, shiftIdx)
      assignedCounts.set(scout.email, (assignedCounts.get(scout.email) ?? 0) + 1)
    }

    if (selected.length < POSITIONS.length) {
      for (const position of POSITIONS) {
        if (!positions.has(position)) {
          positions.set(position, 'Unassigned')
        }
      }
    }
  }

  const warnings: string[] = []

  if (scouts.length < POSITIONS.length) {
    warnings.push(
      `Only ${scouts.length} scout${scouts.length === 1 ? '' : 's'} are checked in for 6 scouting positions, so some slots were left unassigned.`,
    )
  }
  if (unassignedSlots > 0) {
    warnings.push(`${unassignedSlots} assignment slot${unassignedSlots === 1 ? '' : 's'} were left unassigned.`)
  }

  const totalBackToBacks = Array.from(backToBackCounts.values()).reduce((sum, count) => sum + count, 0)
  if (totalBackToBacks > 0) {
    warnings.push(
      `Back-to-back shifts were unavoidable ${totalBackToBacks} time${totalBackToBacks === 1 ? '' : 's'} with the current staffing.`,
    )

    const topBackToBacks = scouts
      .map((scout) => ({ scout, count: backToBackCounts.get(scout.email) ?? 0 }))
      .filter((entry) => entry.count > 0)
      .sort((a, b) => b.count - a.count || compareScoutsByName(a.scout, b.scout))
      .slice(0, 4)

    for (const entry of topBackToBacks) {
      warnings.push(
        `${entry.scout.displayName} had ${entry.count} back-to-back shift${entry.count === 1 ? '' : 's'}.`,
      )
    }
  }

  const loadOverages = scouts
    .map((scout) => ({
      scout,
      desired: desiredAssignments.get(scout.email) ?? 0,
      actual: assignedCounts.get(scout.email) ?? 0,
    }))
    .filter((entry) => entry.actual > entry.desired)

  if (loadOverages.length > 0) {
    warnings.push(
      `${loadOverages.length} scout${loadOverages.length === 1 ? '' : 's'} were assigned above their preferred load to cover the event.`,
    )
  }

  const assignments: MatchAssignment[] = []

  if (!overlapEnabled || shiftSize <= 1) {
    // Standard: each match belongs to exactly one shift
    for (let shiftIdx = 0; shiftIdx < numShifts; shiftIdx += 1) {
      const range = shiftRanges[shiftIdx]
      const positions = shiftAssignments[shiftIdx]
      for (let matchNum = range.start; matchNum <= range.end; matchNum += 1) {
        const matchPositions = {} as MatchAssignment['positions']
        for (const position of POSITIONS) {
          matchPositions[position] = positions.get(position) ?? 'Unassigned'
        }
        assignments.push({ matchNumber: `qm${matchNum}`, positions: matchPositions })
      }
    }
  } else {
    // Overlap: boundary matches covered by two consecutive shifts.
    // Incoming shift gets standard positions; outgoing shift gets *-prev positions.
    // All 12 scouts are stored — getMyAssignments filters by email so each scout
    // sees the overlap match regardless of position suffix.
    for (let matchNum = 1; matchNum <= totalMatches; matchNum += 1) {
      const covering = shiftRanges
        .map((range, idx) => ({ range, idx }))
        .filter(({ range }) => range.start <= matchNum && matchNum <= range.end)

      if (covering.length === 0) continue

      const matchPositions = {} as MatchAssignment['positions']

      if (covering.length === 1) {
        const positions = shiftAssignments[covering[0].idx]
        for (const position of POSITIONS) {
          matchPositions[position] = positions.get(position) ?? 'Unassigned'
        }
      } else {
        // Sort so outgoing (lower shiftIdx) comes first
        covering.sort((a, b) => a.idx - b.idx)
        const [outgoing, incoming] = covering
        const incomingPositions = shiftAssignments[incoming.idx]
        const outgoingPositions = shiftAssignments[outgoing.idx]
        for (const position of POSITIONS) {
          matchPositions[position] = incomingPositions.get(position) ?? 'Unassigned'
          const prevKey = `${position}-prev`
          ;(matchPositions as Record<string, string>)[prevKey] = outgoingPositions.get(position) ?? 'Unassigned'
        }
      }

      assignments.push({ matchNumber: `qm${matchNum}`, positions: matchPositions })
    }
  }

  const emailToDisplay = new Map(scouts.map((scout) => [scout.email, scout.displayName || scout.email]))
  const headerRow = ['', ...shiftRanges.map((range) => range.label)].join(',')
  const rows = POSITIONS.map((position) => {
    const cells = shiftRanges.map((_, index) => {
      const email = shiftAssignments[index].get(position) ?? ''
      return emailToDisplay.get(email) ?? email
    })
    return [POSITION_LABELS[position], ...cells].join(',')
  })

  return {
    assignments,
    shiftRanges,
    warnings,
    csv: [headerRow, ...rows].join('\n'),
  }
}
