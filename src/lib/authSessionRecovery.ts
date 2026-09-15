type OAuthMode = 'interactive' | 'silent'

export type OAuthErrorRecovery = 'clear-session' | 'show-error' | 'preserve-session'

const ACTIVE_SCOUTING_PATHS = new Set([
  '/scout-form',
  '/auto-start',
  '/auto-scoring',
  '/teleop-scoring',
  '/endgame',
])

export const isActiveScoutingPath = (path: string | null | undefined): boolean => {
  if (!path) return false
  const sanitized = path.split('?')[0]?.split('#')[0] || '/'
  return ACTIVE_SCOUTING_PATHS.has(sanitized)
}

export const resolveOAuthErrorRecovery = ({
  mode,
  hasSavedUser,
}: {
  mode: OAuthMode
  hasSavedUser: boolean
  returnTo?: string | null
}): OAuthErrorRecovery => {
  if (mode !== 'silent') {
    return 'show-error'
  }
  if (hasSavedUser) {
    return 'preserve-session'
  }
  return 'clear-session'
}

// Outcome of a silent backend refresh (see apiClient.refreshBackendSessionDetailed).
export type SessionRefreshOutcome = 'refreshed' | 'rejected' | 'unavailable' | 'no-credentials'

export type RenewalAction = 'done' | 'google' | 'wait'

// What "Renew now" should do after a silent refresh attempt.
//
// - refreshed       → nothing more to do.
// - rejected        → server said the refresh token is dead: Google re-login.
// - no-credentials  → never had a backend session: Google re-login.
// - unavailable     → server/database is down. Redirecting to Google here is
//                     pointless (the id_token exchange would fail the same
//                     way) and produced the "sign-in failed" loop scouts saw.
export const resolveRenewalAction = (outcome: SessionRefreshOutcome): RenewalAction => {
  switch (outcome) {
    case 'refreshed':
      return 'done'
    case 'unavailable':
      return 'wait'
    case 'rejected':
    case 'no-credentials':
      return 'google'
  }
}
