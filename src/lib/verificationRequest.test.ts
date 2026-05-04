import { describe, expect, it } from 'vitest'

import {
  findStoredVerificationProfile,
  formatVerificationRecordName,
  hasCompletedOnboarding,
  isPendingVerificationRequest,
} from './verificationRequest'

describe('verification request helpers', () => {
  it('requires onboarding profile details before a request is reviewable', () => {
    expect(hasCompletedOnboarding({
      firstName: 'Sam',
      lastName: 'Scout',
      teamNumber: '1676',
    })).toBe(true)

    expect(hasCompletedOnboarding({
      firstName: 'Sam',
      lastName: 'Scout',
      teamNumber: '',
    })).toBe(false)
  })

  it('shows the submitted profile name before the Google account display name', () => {
    expect(formatVerificationRecordName({
      email: 'scout@example.com',
      displayName: 'Google Account Name',
      firstName: 'Submitted',
      lastName: 'Name',
    })).toBe('Submitted Name')
  })

  it('only counts completed external pending profiles as verification requests', () => {
    const baseRecord = {
      email: 'visitor@example.com',
      acknowledged: false,
      assignedRole: 'pending',
    } as const

    expect(isPendingVerificationRequest({
      ...baseRecord,
      firstName: 'Val',
      lastName: 'Visitor',
      teamNumber: '9999',
    }, ['pascack.org'])).toBe(true)

    expect(isPendingVerificationRequest({
      ...baseRecord,
      firstName: null,
      lastName: null,
      teamNumber: null,
    }, ['pascack.org'])).toBe(false)
  })

  it('recovers saved onboarding profile details for backend verification sync', () => {
    expect(findStoredVerificationProfile('Visitor@Example.com', {
      'visitor@example.com': {
        email: 'visitor@example.com',
        firstName: 'Val',
        lastName: 'Visitor',
        displayName: 'Val Visitor',
        teamNumber: '9999',
      },
    }, [])).toEqual({
      firstName: 'Val',
      lastName: 'Visitor',
      displayName: 'Val Visitor',
      teamNumber: '9999',
    })

    expect(findStoredVerificationProfile('recent@example.com', {}, [{
      email: 'recent@example.com',
      firstName: 'Recent',
      lastName: 'User',
      displayName: 'Recent User',
      teamNumber: '8888',
    }])).toEqual({
      firstName: 'Recent',
      lastName: 'User',
      displayName: 'Recent User',
      teamNumber: '8888',
    })
  })
})
