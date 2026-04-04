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

describe('parseScheduleCSV — transposed/rotation format', () => {
  const mountOliveCSV = `,Match 1-7,Match 7-14,Match 14-21
Red 1,Emily Cook,Aiden Berkowitz,Abby Guggino
Red 2,Aiden Berkowitz,Connor O'Cathain,Zahraa Islam
Red 3,Braden Rothchild,Ethan Brown,Ethan Brown
Blue 1,Avani Dave,Hridik Reddy,Nived Bimal
Blue 2,Ciara Leen,Nived Bimal,Drew Saffiotti
Blue 3,Peter Yatrovskiy,Peter Yatrovskiy,Dylan Park`

  it('detects and parses transposed format with match ranges', () => {
    const result = parseScheduleCSV(mountOliveCSV)
    expect(result.errors).toHaveLength(0)
    expect(result.assignments).toHaveLength(126)
  })

  it('expands match ranges into individual qmN assignments', () => {
    const result = parseScheduleCSV(mountOliveCSV)
    // Match 1-7 should produce qm1 through qm7
    const qm1Assignments = result.assignments.filter(a => a.matchNumber === 'qm1')
    expect(qm1Assignments).toHaveLength(6) // all 6 positions for match 1
    const positions = qm1Assignments.map(a => a.position).sort()
    expect(positions).toEqual(['blue-1', 'blue-2', 'blue-3', 'red-1', 'red-2', 'red-3'])
  })

  it('assigns correct scouts from the first match range', () => {
    const result = parseScheduleCSV(mountOliveCSV)
    const qm3Red1 = result.assignments.find(a => a.matchNumber === 'qm3' && a.position === 'red-1')
    expect(qm3Red1?.scoutEmail).toBe('Emily Cook')
    const qm5Blue3 = result.assignments.find(a => a.matchNumber === 'qm5' && a.position === 'blue-3')
    expect(qm5Blue3?.scoutEmail).toBe('Peter Yatrovskiy')
  })

  it('assigns correct scouts from later match ranges', () => {
    const result = parseScheduleCSV(mountOliveCSV)
    // Match 7-14 range: Red 1 = Aiden Berkowitz
    const qm10Red1 = result.assignments.find(a => a.matchNumber === 'qm10' && a.position === 'red-1')
    expect(qm10Red1?.scoutEmail).toBe('Aiden Berkowitz')
    // Match 14-21 range: Blue 2 = Drew Saffiotti
    const qm17Blue2 = result.assignments.find(a => a.matchNumber === 'qm17' && a.position === 'blue-2')
    expect(qm17Blue2?.scoutEmail).toBe('Drew Saffiotti')
  })

  it('keeps the earlier scout on overlapping boundary matches', () => {
    const result = parseScheduleCSV(mountOliveCSV)
    const qm7Red1 = result.assignments.find(a => a.matchNumber === 'qm7' && a.position === 'red-1')
    const qm14Blue2 = result.assignments.find(a => a.matchNumber === 'qm14' && a.position === 'blue-2')

    expect(qm7Red1?.scoutEmail).toBe('Emily Cook')
    expect(qm14Blue2?.scoutEmail).toBe('Nived Bimal')
  })

  it('sorts assignments by match number then position', () => {
    const result = parseScheduleCSV(mountOliveCSV)
    for (let i = 1; i < result.assignments.length; i++) {
      const prev = result.assignments[i - 1]
      const curr = result.assignments[i]
      const prevNum = parseInt(prev.matchNumber.replace(/\D/g, ''), 10)
      const currNum = parseInt(curr.matchNumber.replace(/\D/g, ''), 10)
      if (prevNum === currNum) {
        expect(prev.position.localeCompare(curr.position)).toBeLessThanOrEqual(0)
      } else {
        expect(prevNum).toBeLessThan(currNum)
      }
    }
  })

  it('handles a minimal transposed CSV', () => {
    const csv = `,Match 1-3
Red 1,Alice
Blue 1,Bob`
    const result = parseScheduleCSV(csv)
    expect(result.errors).toHaveLength(0)
    expect(result.assignments).toHaveLength(6) // 3 matches × 2 positions
    expect(result.assignments.filter(a => a.scoutEmail === 'Alice')).toHaveLength(3)
  })

  it('reports error for unrecognized row labels', () => {
    const csv = `,Match 1-3
Red 1,Alice
Goalie,Bob`
    const result = parseScheduleCSV(csv)
    expect(result.errors.some(e => e.includes('Goalie'))).toBe(true)
  })

  it('handles CRLF line endings in transposed format', () => {
    const csv = `,Match 1-2\r\nRed 1,Alice\r\nBlue 1,Bob`
    const result = parseScheduleCSV(csv)
    expect(result.errors).toHaveLength(0)
    expect(result.assignments).toHaveLength(4) // 2 matches × 2 positions
  })

  it('skips empty scout cells in transposed format', () => {
    const csv = `,Match 1-2
Red 1,Alice
Red 2,`
    const result = parseScheduleCSV(csv)
    expect(result.assignments).toHaveLength(2) // only Alice for 2 matches
  })
})
