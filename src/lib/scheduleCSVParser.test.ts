import { describe, it, expect } from 'vitest'
import { parseScheduleCSV } from './scheduleCSVParser'

describe('parseScheduleCSV', () => {
  const validCSV = `match_number,red_1,red_2,red_3,blue_1,blue_2,blue_3
qm1,alice@team.com,bob@team.com,carol@team.com,dave@team.com,eve@team.com,frank@team.com
qm2,alice@team.com,bob@team.com,carol@team.com,dave@team.com,eve@team.com,frank@team.com`

  it('parses a valid CSV with all 6 position columns', () => {
    const result = parseScheduleCSV(validCSV)
    expect(result.errors).toHaveLength(0)
    expect(result.assignments).toHaveLength(12) // 2 matches × 6 positions
    expect(result.assignments[0]).toEqual({
      matchNumber: 'qm1',
      position: 'red-1',
      scoutEmail: 'alice@team.com',
    })
  })

  it('returns error when CSV has fewer than 2 lines', () => {
    const result = parseScheduleCSV('match_number,red_1')
    expect(result.errors).toContain('CSV has no data rows')
    expect(result.assignments).toHaveLength(0)
  })

  it('returns error when match_number column is missing', () => {
    const csv = `red_1,red_2,red_3,blue_1,blue_2,blue_3
alice@team.com,bob@team.com,carol@team.com,dave@team.com,eve@team.com,frank@team.com`
    const result = parseScheduleCSV(csv)
    expect(result.errors).toContain('Missing match_number column')
  })

  it('returns error when no position columns are found', () => {
    const csv = `match_number,scout_name
qm1,alice@team.com`
    const result = parseScheduleCSV(csv)
    expect(result.errors.some(e => e.includes('No position columns'))).toBe(true)
  })

  it('accepts "match" as header alias for match_number', () => {
    const csv = `match,red_1,red_2,red_3,blue_1,blue_2,blue_3
1,a@b.com,b@b.com,c@b.com,d@b.com,e@b.com,f@b.com`
    const result = parseScheduleCSV(csv)
    expect(result.errors).toHaveLength(0)
    expect(result.assignments[0].matchNumber).toBe('1')
  })

  it('accepts underscore-free header aliases (red1, blue3)', () => {
    const csv = `match_number,red1,red2,red3,blue1,blue2,blue3
qm1,a@b.com,b@b.com,c@b.com,d@b.com,e@b.com,f@b.com`
    const result = parseScheduleCSV(csv)
    expect(result.errors).toHaveLength(0)
    expect(result.assignments.map(a => a.position)).toEqual([
      'red-1', 'red-2', 'red-3', 'blue-1', 'blue-2', 'blue-3',
    ])
  })

  it('returns error when CSV mixes emails and plain names', () => {
    const csv = `match_number,red_1,red_2,red_3,blue_1,blue_2,blue_3
qm1,alice@team.com,Bob,carol@team.com,dave@team.com,eve@team.com,frank@team.com`
    const result = parseScheduleCSV(csv)
    expect(result.errors.some(e => e.includes('mixes'))).toBe(true)
  })

  it('skips rows where matchNumber is empty', () => {
    const csv = `match_number,red_1,red_2,red_3,blue_1,blue_2,blue_3
qm1,a@b.com,b@b.com,c@b.com,d@b.com,e@b.com,f@b.com
,a@b.com,b@b.com,c@b.com,d@b.com,e@b.com,f@b.com`
    const result = parseScheduleCSV(csv)
    expect(result.errors).toHaveLength(0)
    expect(result.assignments).toHaveLength(6) // only qm1 row
  })

  it('handles Windows-style CRLF line endings', () => {
    const csv = `match_number,red_1,red_2,red_3,blue_1,blue_2,blue_3\r\nqm1,a@b.com,b@b.com,c@b.com,d@b.com,e@b.com,f@b.com`
    const result = parseScheduleCSV(csv)
    expect(result.errors).toHaveLength(0)
    expect(result.assignments).toHaveLength(6)
  })

  it('skips empty values within a row', () => {
    const csv = `match_number,red_1,red_2,red_3,blue_1,blue_2,blue_3
qm1,a@b.com,,c@b.com,d@b.com,e@b.com,f@b.com`
    const result = parseScheduleCSV(csv)
    expect(result.assignments).toHaveLength(5) // red_2 is empty, skipped
  })

  it('returns empty aliases object', () => {
    const result = parseScheduleCSV(validCSV)
    expect(result.aliases).toEqual({})
  })

  it('is case-insensitive for headers', () => {
    const csv = `Match_Number,Red_1,Red_2,Red_3,Blue_1,Blue_2,Blue_3
qm1,a@b.com,b@b.com,c@b.com,d@b.com,e@b.com,f@b.com`
    const result = parseScheduleCSV(csv)
    expect(result.errors).toHaveLength(0)
    expect(result.assignments).toHaveLength(6)
  })
})
