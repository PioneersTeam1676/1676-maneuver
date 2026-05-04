import { describe, expect, it } from 'vitest'

import { coerceCachedScheduleState } from './scheduleCache'

describe('schedule cache', () => {
  it('accepts cached schedule state with assignments and matches', () => {
    const cached = coerceCachedScheduleState({
      eventKey: '2026test',
      assignments: [
        {
          matchNumber: 'qm1',
          positions: {
            'red-1': 'scout@pascack.org',
            'red-2': 'other@pascack.org',
            'red-3': 'third@pascack.org',
            'blue-1': 'blue1@pascack.org',
            'blue-2': 'blue2@pascack.org',
            'blue-3': 'blue3@pascack.org',
          },
        },
      ],
      matches: [
        {
          matchNumber: 'qm1',
          red: ['1676'],
          blue: ['254'],
        },
      ],
      aliases: { 'scout@pascack.org': 'Scout' },
      mode: 'manual',
    })

    expect(cached).toEqual({
      eventKey: '2026test',
      assignments: expect.any(Array),
      matches: expect.any(Array),
      aliases: { 'scout@pascack.org': 'Scout' },
      mode: 'manual',
      updatedAt: null,
      lastCompletedMatch: null,
    })
  })

  it('rejects malformed cached schedule state', () => {
    expect(coerceCachedScheduleState({ eventKey: '2026test' })).toBeNull()
    expect(coerceCachedScheduleState(null)).toBeNull()
  })
})
