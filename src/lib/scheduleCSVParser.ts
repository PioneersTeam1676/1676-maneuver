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

export function parseScheduleCSV(csvText: string): ParsedSchedule {
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length < 2) return { assignments: [], aliases: {}, errors: ['CSV has no data rows'] }

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
