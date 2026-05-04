import { describe, expect, it } from 'vitest'

import { resetVerificationState } from './authVerificationReset'

describe('resetVerificationState', () => {
  it('removes role, recent user, and onboarding profile for the requested email only', () => {
    const result = resetVerificationState({
      email: ' Scout@Example.com ',
      roles: {
        'lead@example.com': 'lead',
        'scout@example.com': 'scout',
        'other@example.com': 'pending',
      },
      recentUsers: [
        {
          email: 'scout@example.com',
          firstSeenAt: '2026-04-29T12:00:00.000Z',
          lastSeenAt: '2026-04-29T12:30:00.000Z',
          acknowledged: true,
          firstName: 'Sam',
          lastName: 'Scout',
          teamNumber: '1676',
        },
        {
          email: 'other@example.com',
          firstSeenAt: '2026-04-29T13:00:00.000Z',
          lastSeenAt: '2026-04-29T13:30:00.000Z',
          acknowledged: false,
        },
      ],
      allianceProfiles: {
        'scout@example.com': {
          email: 'scout@example.com',
          firstName: 'Sam',
          lastName: 'Scout',
          teamNumber: '1676',
          confirmedAlliance: true,
          submittedAt: '2026-04-29T12:05:00.000Z',
        },
        'other@example.com': {
          email: 'other@example.com',
          firstName: 'Other',
          lastName: 'User',
          teamNumber: '1676',
          confirmedAlliance: true,
          submittedAt: '2026-04-29T13:05:00.000Z',
        },
      },
    })

    expect(result.roles).toEqual({
      'lead@example.com': 'lead',
      'other@example.com': 'pending',
    })
    expect(result.recentUsers).toEqual([
      {
        email: 'other@example.com',
        firstSeenAt: '2026-04-29T13:00:00.000Z',
        lastSeenAt: '2026-04-29T13:30:00.000Z',
        acknowledged: false,
      },
    ])
    expect(result.allianceProfiles).toEqual({
      'other@example.com': {
        email: 'other@example.com',
        firstName: 'Other',
        lastName: 'User',
        teamNumber: '1676',
        confirmedAlliance: true,
        submittedAt: '2026-04-29T13:05:00.000Z',
      },
    })
  })
})
