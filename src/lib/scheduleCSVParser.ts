export interface ParsedSchedule {
  assignments: {
    matchNumber: string
    position: string  // "red-1" ... "blue-3"
    scoutEmail: string
  }[]
  aliases: Record<string, string>  // name → email (empty if CSV uses emails directly)
  errors: string[]
}

const HEADER_ALIASES: Record<string, string> = {
  red_1: 'red-1', red_2: 'red-2', red_3: 'red-3',
  blue_1: 'blue-1', blue_2: 'blue-2', blue_3: 'blue-3',
  red1: 'red-1', red2: 'red-2', red3: 'red-3',
  blue1: 'blue-1', blue2: 'blue-2', blue3: 'blue-3',
}

// Row label → position mapping for transposed format (e.g. "Red 1" → "red-1")
const ROW_POSITION_ALIASES: Record<string, string> = {
  'red 1': 'red-1', 'red 2': 'red-2', 'red 3': 'red-3',
  'blue 1': 'blue-1', 'blue 2': 'blue-2', 'blue 3': 'blue-3',
  'red1': 'red-1', 'red2': 'red-2', 'red3': 'red-3',
  'blue1': 'blue-1', 'blue2': 'blue-2', 'blue3': 'blue-3',
  'red_1': 'red-1', 'red_2': 'red-2', 'red_3': 'red-3',
  'blue_1': 'blue-1', 'blue_2': 'blue-2', 'blue_3': 'blue-3',
}

/**
 * Parse a match range header like "Match 1-7" into an array of match numbers [1, 2, ..., 7].
 * Returns null if the header doesn't match the expected pattern.
 */
function parseMatchRange(header: string): number[] | null {
  const m = header.match(/^match\s+(\d+)\s*-\s*(\d+)$/i)
  if (!m) return null
  const start = parseInt(m[1], 10)
  const end = parseInt(m[2], 10)
  if (start > end || isNaN(start) || isNaN(end)) return null
  const result: number[] = []
  for (let i = start; i <= end; i++) result.push(i)
  return result
}

/**
 * Detect whether the CSV is in transposed/rotation format:
 * - Row labels are positions (Red 1, Blue 2, etc.)
 * - Column headers are match ranges (Match 1-7, Match 7-14, etc.)
 */
function isTransposedFormat(lines: string[]): boolean {
  if (lines.length < 2) return false
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  // Check if any column header looks like a match range
  const hasMatchRange = headers.some((h) => parseMatchRange(h) !== null)
  if (!hasMatchRange) return false
  // Check if first column of data rows looks like position labels
  const firstRowLabel = lines[1].split(',')[0].trim().toLowerCase()
  return firstRowLabel in ROW_POSITION_ALIASES
}

function parseTransposedCSV(lines: string[]): ParsedSchedule {
  const headers = lines[0].split(',').map((h) => h.trim())
  const errors: string[] = []

  // Parse match ranges from column headers (skip first column which is the position label)
  const matchRanges: { colIndex: number; matches: number[] }[] = []
  for (let i = 1; i < headers.length; i++) {
    const range = parseMatchRange(headers[i])
    if (range) {
      matchRanges.push({ colIndex: i, matches: range })
    } else if (headers[i]) {
      errors.push(`Column ${i + 1} header "${headers[i]}" is not a valid match range`)
    }
  }

  if (matchRanges.length === 0) {
    return { assignments: [], aliases: {}, errors: ['No match range columns found (expected "Match 1-7" format)'] }
  }

  const assignmentMap = new Map<string, ParsedSchedule['assignments'][number]>()
  const namesSeen = new Set<string>()

  for (let row = 1; row < lines.length; row++) {
    const cols = lines[row].split(',').map((c) => c.trim())
    const rowLabel = cols[0]?.toLowerCase()
    if (!rowLabel) continue

    const position = ROW_POSITION_ALIASES[rowLabel]
    if (!position) {
      errors.push(`Row ${row + 1} label "${cols[0]}" is not a recognized position`)
      continue
    }

    for (const { colIndex, matches } of matchRanges) {
      const scoutName = cols[colIndex]?.trim()
      if (!scoutName) continue
      namesSeen.add(scoutName)
      for (const matchNum of matches) {
        const matchNumber = `qm${matchNum}`
        const key = `${matchNumber}:${position}`
        if (assignmentMap.has(key)) continue
        assignmentMap.set(key, {
          matchNumber,
          position,
          scoutEmail: scoutName,
        })
      }
    }
  }

  const looksLikeEmail = (s: string) => s.includes('@')
  const hasEmails = [...namesSeen].some(looksLikeEmail)
  const hasNames = [...namesSeen].some((s) => !looksLikeEmail(s))
  if (hasNames && hasEmails) {
    errors.push('CSV mixes email addresses and plain names — normalize before uploading')
  }

  // Sort by match number then position for consistent ordering
  const assignments = Array.from(assignmentMap.values())
  assignments.sort((a, b) => {
    const aNum = parseInt(a.matchNumber.replace(/\D/g, ''), 10)
    const bNum = parseInt(b.matchNumber.replace(/\D/g, ''), 10)
    if (aNum !== bNum) return aNum - bNum
    return a.position.localeCompare(b.position)
  })

  return { assignments, aliases: {}, errors }
}

export function parseScheduleCSV(csvText: string): ParsedSchedule {
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length < 2) return { assignments: [], aliases: {}, errors: ['CSV has no data rows'] }

  // Auto-detect transposed/rotation format
  if (isTransposedFormat(lines)) {
    return parseTransposedCSV(lines)
  }

  // Standard format: matches as rows, positions as columns
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
  const matchCol = headers.findIndex((h) => h === 'match_number' || h === 'match' || h === 'qm')
  if (matchCol === -1) return { assignments: [], aliases: {}, errors: ['Missing match_number column'] }

  const positionCols: { position: string; colIndex: number }[] = []
  headers.forEach((h, i) => {
    const pos = HEADER_ALIASES[h]
    if (pos) positionCols.push({ position: pos, colIndex: i })
  })

  if (positionCols.length === 0) {
    return { assignments: [], aliases: {}, errors: ['No position columns found (expected red_1…blue_3)'] }
  }

  const assignments: ParsedSchedule['assignments'] = []
  const errors: string[] = []
  const namesSeen = new Set<string>()

  for (let row = 1; row < lines.length; row++) {
    const cols = lines[row].split(',').map((c) => c.trim())
    const matchNumber = cols[matchCol]
    if (!matchNumber) continue

    for (const { position, colIndex } of positionCols) {
      const value = cols[colIndex]
      if (!value) continue
      namesSeen.add(value)
      assignments.push({ matchNumber, position, scoutEmail: value })
    }
  }

  const looksLikeEmail = (s: string) => s.includes('@')
  const hasEmails = [...namesSeen].some(looksLikeEmail)
  const hasNames = [...namesSeen].some((s) => !looksLikeEmail(s))

  if (hasNames && hasEmails) {
    errors.push('CSV mixes email addresses and plain names — normalize before uploading')
  }

  return { assignments, aliases: {}, errors }
}
