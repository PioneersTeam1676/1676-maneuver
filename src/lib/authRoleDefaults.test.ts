import { describe, expect, it } from 'vitest'

import {
  emailMatchesAllowedDomain,
  parseAllowedEmailDomains,
  resolveRoleAfterRefreshFailure,
  resolveDefaultRoleForEmail,
  retainSessionStartRole,
  mergeCurrentUserRole,
} from './authRoleDefaults'

describe('auth role defaults', () => {
  it('defaults allowed-domain users to scout access', () => {
    expect(resolveDefaultRoleForEmail('Student@Pascack.org', {
      allowedDomains: ['pascack.org'],
      adminEmails: [],
      ultraAdminEmails: [],
    })).toBe('scout')
  })

  it('keeps external users pending until approval', () => {
    expect(resolveDefaultRoleForEmail('visitor@example.com', {
      allowedDomains: ['pascack.org'],
      adminEmails: [],
      ultraAdminEmails: [],
    })).toBe('pending')
  })

  it('normalizes configured domains with optional at-signs', () => {
    const domains = parseAllowedEmailDomains('@pascack.org, Team1676.org ')

    expect(domains).toEqual(['pascack.org', 'team1676.org'])
    expect(emailMatchesAllowedDomain('scout@pascack.org', domains)).toBe(true)
  })

  it('preserves an approved cached role when refresh fallback has a transient failure', () => {
    expect(resolveRoleAfterRefreshFailure({
      existingRole: 'scout',
      fallbackStatus: 401,
      defaultRole: 'pending',
    })).toBe('scout')
  })

  it('preserves approved cached role on forbidden response to avoid false revocation', () => {
    expect(resolveRoleAfterRefreshFailure({
      existingRole: 'scout',
      fallbackStatus: 403,
      defaultRole: 'pending',
    })).toBe('scout')
  })

  it('retains an approved cached role while a session refresh is pending', () => {
    expect(retainSessionStartRole({
      email: 'partner@example.com',
      assignments: {
        'partner@example.com': 'scout',
        'other@example.com': 'pending',
      },
    })).toEqual({
      'partner@example.com': 'scout',
      'other@example.com': 'pending',
    })
  })

  it('merges the signed-in user role without discarding unrelated cached roles', () => {
    expect(mergeCurrentUserRole({
      email: 'Partner@Example.com',
      role: 'scout',
      assignments: {
        'partner@example.com': 'pending',
        'lead@example.com': 'lead',
      },
    })).toEqual({
      'partner@example.com': 'scout',
      'lead@example.com': 'lead',
    })
  })
})
