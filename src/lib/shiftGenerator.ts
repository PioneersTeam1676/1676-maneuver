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
}

export interface ShiftRange {
  label: string
  start: number
  end: number
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
  'red-1': 'Red 1', 'red-2': 'Red 2', 'red-3': 'Red 3',
  'blue-1': 'Blue 1', 'blue-2': 'Blue 2', 'blue-3': 'Blue 3',
}

function computeShiftRanges(totalMatches: number, shiftSize: number): ShiftRange[] {
  const ranges: ShiftRange[] = []
  let start = 1
  while (start <= totalMatches) {
    const end = Math.min(start + shiftSize - 1, totalMatches)
    ranges.push({ label: `Match ${start}-${end}`, start, end })
    start += shiftSize
  }
  return ranges
}

// Assign scouts to the 6 position pools.
// Sort heavy scouts first, then greedily fill the position with lowest total targetShifts coverage.
function assignScoutsToPositions(scouts: ScoutInput[]): Map<Position, ScoutInput[]> {
  const sorted = [...scouts].sort((a, b) => b.targetShifts - a.targetShifts)
  const pools = new Map<Position, ScoutInput[]>(POSITIONS.map(p => [p, []]))
  const poolCoverage = new Map<Position, number>(POSITIONS.map(p => [p, 0]))

  for (const scout of sorted) {
    let minPos: Position = POSITIONS[0]
    let minCov = Infinity
    for (const pos of POSITIONS) {
      const cov = poolCoverage.get(pos)!
      if (cov < minCov) { minCov = cov; minPos = pos }
    }
    pools.get(minPos)!.push(scout)
    poolCoverage.set(minPos, minCov + scout.targetShifts)
  }

  return pools
}

export function generateShiftSchedule(input: ShiftGeneratorInput): GeneratedSchedule {
  const { scouts, totalMatches, shiftSize } = input
  const warnings: string[] = []

  if (scouts.length === 0) {
    return { assignments: [], shiftRanges: [], warnings: ['No scouts provided'], csv: '' }
  }
  if (totalMatches < 1 || shiftSize < 1) {
    return { assignments: [], shiftRanges: [], warnings: ['Invalid totalMatches or shiftSize'], csv: '' }
  }

  const shiftRanges = computeShiftRanges(totalMatches, shiftSize)
  const numShifts = shiftRanges.length
  const pools = assignScoutsToPositions(scouts)

  // lastShiftIndex: -2 means "never worked" (gap from -2 to 0 = 2, satisfies < shiftIdx - 1)
  const lastShiftIndex = new Map<string, number>()
  const shiftCount = new Map<string, number>()
  scouts.forEach(s => { lastShiftIndex.set(s.email, -2); shiftCount.set(s.email, 0) })

  const shiftAssignments: Map<Position, string>[] = Array.from({ length: numShifts }, () => new Map())

  for (let shiftIdx = 0; shiftIdx < numShifts; shiftIdx++) {
    for (const position of POSITIONS) {
      const pool = pools.get(position)!
      if (pool.length === 0) {
        warnings.push(`No scouts assigned to ${POSITION_LABELS[position]}`)
        shiftAssignments[shiftIdx].set(position, 'Unassigned')
        continue
      }

      // Primary: gap satisfied AND under targetShifts, pick fewest shifts worked
      let chosen: ScoutInput | null = null
      let bestCount = Infinity
      for (const scout of pool) {
        const last = lastShiftIndex.get(scout.email)!
        const count = shiftCount.get(scout.email)!
        if (last < shiftIdx - 1 && count < scout.targetShifts && count < bestCount) {
          chosen = scout
          bestCount = count
        }
      }

      // Fallback: gap satisfied, ignore targetShifts cap
      if (!chosen) {
        bestCount = Infinity
        for (const scout of pool) {
          const last = lastShiftIndex.get(scout.email)!
          const count = shiftCount.get(scout.email)!
          if (last < shiftIdx - 1 && count < bestCount) {
            chosen = scout
            bestCount = count
          }
        }
      }

      // Last resort: pick scout with the largest gap (may be back-to-back)
      if (!chosen) {
        chosen = pool.reduce((best, scout) => {
          const lastBest = lastShiftIndex.get(best.email)!
          const lastScout = lastShiftIndex.get(scout.email)!
          return lastScout < lastBest ? scout : best
        })
        warnings.push(
          `${chosen.displayName} had to scout back-to-back at shift ${shiftIdx + 1} for ${POSITION_LABELS[position]}`
        )
      }

      shiftAssignments[shiftIdx].set(position, chosen.email)
      lastShiftIndex.set(chosen.email, shiftIdx)
      shiftCount.set(chosen.email, (shiftCount.get(chosen.email) ?? 0) + 1)
    }
  }

  // Build one MatchAssignment per match number
  const assignments: MatchAssignment[] = []
  for (let shiftIdx = 0; shiftIdx < numShifts; shiftIdx++) {
    const range = shiftRanges[shiftIdx]
    const posMap = shiftAssignments[shiftIdx]
    for (let matchNum = range.start; matchNum <= range.end; matchNum++) {
      const positions = {} as MatchAssignment['positions']
      for (const pos of POSITIONS) {
        positions[pos] = posMap.get(pos) ?? 'Unassigned'
      }
      assignments.push({ matchNumber: `qm${matchNum}`, positions })
    }
  }

  // Build CSV in transposed format (matches the Mount Olive CSV format)
  const emailToDisplay = new Map(scouts.map(s => [s.email, s.displayName || s.email]))
  const headerRow = ['', ...shiftRanges.map(r => r.label)].join(',')
  const rows = POSITIONS.map(pos => {
    const label = POSITION_LABELS[pos]
    const cells = shiftRanges.map((_, i) => {
      const email = shiftAssignments[i].get(pos) ?? ''
      return emailToDisplay.get(email) ?? email
    })
    return [label, ...cells].join(',')
  })
  const csv = [headerRow, ...rows].join('\n')

  return { assignments, shiftRanges, warnings, csv }
}
