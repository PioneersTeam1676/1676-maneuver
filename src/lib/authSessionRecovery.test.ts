import { describe, expect, it } from 'vitest'

import { isActiveScoutingPath, resolveOAuthErrorRecovery } from './authSessionRecovery'

describe('auth session recovery', () => {
  it('preserves a saved session when silent refresh fails', () => {
    expect(resolveOAuthErrorRecovery({
      mode: 'silent',
      hasSavedUser: true,
    })).toBe('preserve-session')
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

  it('preserves a saved session when silent refresh fails during match scouting', () => {
    expect(resolveOAuthErrorRecovery({
      mode: 'silent',
      hasSavedUser: true,
      returnTo: '/scout-form',
    })).toBe('preserve-session')
  })

  it('recognizes active match scouting routes', () => {
    expect(isActiveScoutingPath('/scout-form')).toBe(true)
    expect(isActiveScoutingPath('/auto-scoring?match=12')).toBe(true)
    expect(isActiveScoutingPath('/game-start')).toBe(false)
  })
})
