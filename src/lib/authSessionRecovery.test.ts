import { describe, expect, it } from 'vitest'

import { isActiveScoutingPath, resolveOAuthErrorRecovery, resolveRenewalAction } from './authSessionRecovery'

describe('auth session recovery', () => {
  // Silent mode only runs after a scout tapped Renew with no usable backend
  // session. Reporting "Session restored" there was a lie that left them
  // stuck on the expired banner; they need the real Google prompt.
  it('escalates to interactive sign-in when silent renewal fails for a saved user', () => {
    expect(resolveOAuthErrorRecovery({
      mode: 'silent',
      hasSavedUser: true,
    })).toBe('retry-interactive')
  })

  it('clears the session when silent refresh fails without a saved user', () => {
    expect(resolveOAuthErrorRecovery({
      mode: 'silent',
      hasSavedUser: false,
    })).toBe('clear-session')
  })

  it('leaves interactive login errors on the callback error path', () => {
    expect(resolveOAuthErrorRecovery({
      mode: 'interactive',
      hasSavedUser: true,
    })).toBe('show-error')
  })

  it('escalates to interactive sign-in even when renewal started mid-match', () => {
    expect(resolveOAuthErrorRecovery({
      mode: 'silent',
      hasSavedUser: true,
      returnTo: '/scout-form',
    })).toBe('retry-interactive')
  })

  it('recognizes active match scouting routes', () => {
    expect(isActiveScoutingPath('/scout-form')).toBe(true)
    expect(isActiveScoutingPath('/auto-scoring?match=12')).toBe(true)
    expect(isActiveScoutingPath('/game-start')).toBe(false)
  })
})

describe('resolveRenewalAction', () => {
  it('finishes immediately after a silent refresh', () => {
    expect(resolveRenewalAction('refreshed')).toBe('done')
  })

  it('falls back to Google only when the server definitively rejected or lacks a session', () => {
    expect(resolveRenewalAction('rejected')).toBe('google')
    expect(resolveRenewalAction('no-credentials')).toBe('google')
  })

  it('waits (no Google redirect) when the server is temporarily unavailable', () => {
    expect(resolveRenewalAction('unavailable')).toBe('wait')
  })
})
