import { describe, expect, it } from 'vitest'

import { deriveMyAssignmentsFromSchedule } from './scheduleApi'

describe('schedule assignment helpers', () => {
  it('derives scout assignments from cached schedule state including overlap prev slots', () => {
    const assignments = deriveMyAssignmentsFromSchedule({
      email: 'Scout@Pascack.org',
      schedule: {
        eventKey: '2026test',
        updatedAt: null,
        lastCompletedMatch: null,
        assignments: [
          {
            matchNumber: 'qm8',
            positions: {
              'red-1': 'other@pascack.org',
              'red-2': 'Unassigned',
              'red-3': 'third@pascack.org',
              'blue-1': 'blue1@pascack.org',
              'blue-2': 'blue2@pascack.org',
              'blue-3': 'blue3@pascack.org',
              'red-2-prev': 'scout@pascack.org',
            } as Record<string, string>,
          },
        ],
        matches: [
          {
            matchNumber: 'qm8',
            red: ['1111', '2222', '3333'],
            blue: ['4444', '5555', '6666'],
          },
        ],
      },
    })

    expect(assignments).toEqual([
      {
        matchNumber: 'qm8',
        matchOrder: 8,
        position: 'red-2',
        alliance: 'red',
        slotIndex: 1,
      },
    ])
  })
})
