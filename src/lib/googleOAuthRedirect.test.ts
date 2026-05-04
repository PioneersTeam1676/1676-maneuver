import { describe, expect, it } from 'vitest'

import {
  buildCanonicalGoogleAuthRestartUrl,
  resolveGoogleRedirectUri,
} from './googleOAuthRedirect'

describe('google OAuth redirect helpers', () => {
  it('uses the configured redirect when it matches the current origin', () => {
    expect(
      resolveGoogleRedirectUri({
        configuredRedirect: 'https://scouting.team1676.org/auth/google/callback',
        currentOrigin: 'https://scouting.team1676.org',
        callbackPath: '/auth/google/callback',
      }),
    ).toEqual({
      redirectUri: 'https://scouting.team1676.org/auth/google/callback',
      configuredRedirectOrigin: 'https://scouting.team1676.org',
      currentCallbackUri: 'https://scouting.team1676.org/auth/google/callback',
      usesConfiguredRedirect: true,
    })
  })

  it('falls back to the current-origin callback when the configured redirect is for another origin', () => {
    expect(
      resolveGoogleRedirectUri({
        configuredRedirect: 'https://scouting.team1676.org/auth/google/callback',
        currentOrigin: 'https://scouting.1676.team',
        callbackPath: '/auth/google/callback',
      }),
    ).toMatchObject({
      redirectUri: 'https://scouting.1676.team/auth/google/callback',
      configuredRedirectOrigin: 'https://scouting.team1676.org',
      currentCallbackUri: 'https://scouting.1676.team/auth/google/callback',
      usesConfiguredRedirect: false,
    })
  })

  it('builds a canonical restart URL that preserves the current app route', () => {
    expect(
      buildCanonicalGoogleAuthRestartUrl({
        configuredRedirect: 'https://scouting.team1676.org/auth/google/callback',
        currentHref: 'https://scouting.1676.team/game-start?event=2026nj#match-3',
        currentOrigin: 'https://scouting.1676.team',
        authStartParam: 'authStart',
        authStartValue: 'google',
      }),
    ).toBe('https://scouting.team1676.org/game-start?event=2026nj&authStart=google#match-3')
  })

  it('does not build a restart URL when already on the configured origin', () => {
    expect(
      buildCanonicalGoogleAuthRestartUrl({
        configuredRedirect: 'https://scouting.team1676.org/auth/google/callback',
        currentHref: 'https://scouting.team1676.org/',
        currentOrigin: 'https://scouting.team1676.org',
        authStartParam: 'authStart',
        authStartValue: 'google',
      }),
    ).toBeNull()
  })
})
