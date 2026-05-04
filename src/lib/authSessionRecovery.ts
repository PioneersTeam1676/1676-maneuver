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
