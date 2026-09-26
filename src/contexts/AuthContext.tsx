import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AUTH_REFRESHED_EVENT, apiDelete, apiGet, apiPatch, apiPost, apiPut, clearBackendSession, establishBackendSession, hasUsableAuthToken, refreshBackendSessionDetailed } from '@/lib/apiClient'
import { emailMatchesAllowedDomain as emailMatchesAllowedDomainHelper, mergeCurrentUserRole, parseAllowedEmailDomains, resolveDefaultRoleForEmail, resolveRoleAfterRefreshFailure, retainSessionStartRole } from '@/lib/authRoleDefaults'
import { resolveOAuthErrorRecovery, resolveRenewalAction } from '@/lib/authSessionRecovery'
import { resetVerificationState } from '@/lib/authVerificationReset'
import { buildCanonicalGoogleAuthRestartUrl, resolveGoogleRedirectUri } from '@/lib/googleOAuthRedirect'
import { findStoredVerificationProfile, hasCompletedOnboarding } from '@/lib/verificationRequest'

type User = {
  name: string
  email: string
  picture?: string
  sub: string // Google subject (user id)
}

export type UserRole = 'blocked' | 'pending' | 'pit_scout' | 'drive_team' | 'scout_minus' | 'scout' | 'scout_plus' | 'lead' | 'tech_lead'

type RoleAssignments = Record<string, UserRole>

type AllianceProfile = {
  email: string
  firstName: string
  lastName: string
  displayName?: string
  teamNumber: string
  confirmedAlliance: boolean
  submittedAt: string
  lastSeenAt?: string
}

type AllianceProfileInput = {
  firstName: string
  lastName: string
  teamNumber: string
  confirmedAlliance: boolean
}

type RecentUserRecord = {
  email: string
  firstSeenAt: string
  lastSeenAt: string
  acknowledged?: boolean
  displayName?: string
  photoUrl?: string
  firstName?: string
  lastName?: string
  teamNumber?: string
}

type RecentUserApiRecord = Partial<RecentUserRecord> & {
  first_seen_at?: string
  last_seen_at?: string
  display_name?: string
  photo_url?: string
  first_name?: string
  last_name?: string
  team_number?: string
}

type StoredVerificationSyncPayload = {
  name?: string
  firstName?: string
  lastName?: string
  teamNumber?: string
}

type AuthContextValue = {
  user: User | null
  role: UserRole
  defaultRoute: string
  login: () => void
  logout: () => void
  ready: boolean
  authorizationReady: boolean
  roleAssignments: RoleAssignments
  setRole: (email: string, role: UserRole) => Promise<RoleChangeResult>
  removeRole: (email: string) => void
  resetVerification: (email: string) => void
  canDelete: boolean
  canAccessPath: (path: string) => boolean
  isAdmin: boolean
  isLead: boolean
  isUltraAdmin: boolean
  recentUsers: RecentUserRecord[]
  allianceProfile: AllianceProfile | null
  allianceProfiles: Record<string, AllianceProfile>
  submitAllianceProfile: (input: AllianceProfileInput) => Promise<{ success: boolean; message?: string }>
  removeAllianceProfile: (email: string) => void
  clearAllianceProfileSubmission: (email: string) => void
  requiresAllianceConfirmation: boolean
  allowedAllianceDomain: string
  allowedAllianceDomains: string[]
  isAllowedDomainUser: boolean
  acknowledgeRecentUser: (email: string) => Promise<boolean>
  refreshRoles: () => Promise<void>
  refreshRecentUsers: () => Promise<void>
  canRescout: boolean
  rescouterPermissions: Record<string, boolean>
  setRescouter: (email: string, enabled: boolean) => Promise<void>
  renewSession: (options?: { returnTo?: string }) => Promise<boolean>
}

export type RoleChangeResult = { success: boolean; message?: string }

const ROLE_STORAGE_KEY = 'auth_roles'
const RECENT_STORAGE_KEY = 'auth_recent_users'
const SCHEDULE_STORAGE_KEY = 'schedule_automation_state'
const OAUTH_STATE_PREFIX = 'auth_oauth_state:'
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const AUTH_ID_TOKEN_KEY = 'auth_id_token'
const ALLIANCE_PROFILE_STORAGE_KEY = 'auth_alliance_profiles'
const MAX_RECENT_USERS = 150
const AUTH_CALLBACK_PATH = '/auth/google/callback'
const GOOGLE_AUTH_START_PARAM = 'authStart'
const GOOGLE_AUTH_START_VALUE = 'google'

const normalizeEmail = (email: string) => email.trim().toLowerCase()

const parseAllowedDomains = () => {
  const domainsEnv = (import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || 'pascack.org') as string
  return parseAllowedEmailDomains(domainsEnv)
}

const ALLOWED_EMAIL_DOMAINS = parseAllowedDomains()
const PRIMARY_ALLIANCE_DOMAIN = ALLOWED_EMAIL_DOMAINS[0] || ''

const emailMatchesAllowedDomain = (email: string) =>
  emailMatchesAllowedDomainHelper(email, ALLOWED_EMAIL_DOMAINS)

const isAutoApprovedEmail = (email: string) => {
  const normalized = normalizeEmail(email)
  return emailMatchesAllowedDomain(normalized) || ADMIN_EMAILS.includes(normalized) || ULTRA_ADMIN_EMAILS.includes(normalized)
}

const resolveDefaultRole = (email: string): UserRole => {
  return resolveDefaultRoleForEmail(email, {
    allowedDomains: ALLOWED_EMAIL_DOMAINS,
    adminEmails: ADMIN_EMAILS,
    ultraAdminEmails: ULTRA_ADMIN_EMAILS,
  })
}

const DEFAULT_ADMIN_EMAILS: string[] = []

const collectEmails = (...sources: Array<string | undefined>) =>
  Array.from(
    new Set(
      sources
        .flatMap((value) =>
          value
            ? value
                .split(',')
                .map((segment) => normalizeEmail(segment))
                .filter(Boolean)
            : []
        )
    )
  )

const ADMIN_EMAILS: string[] = collectEmails(
  import.meta.env.VITE_GOOGLE_ADMIN_EMAIL as string | undefined,
  DEFAULT_ADMIN_EMAILS.join(',')
)

const ULTRA_ADMIN_EMAILS: string[] = collectEmails(
  import.meta.env.VITE_ULTRA_ADMIN_EMAIL as string | undefined,
  import.meta.env.VITE_GOOGLE_ADMIN_EMAIL as string | undefined
)

const VALID_ROLES: UserRole[] = ['blocked', 'pending', 'pit_scout', 'drive_team', 'scout_minus', 'scout', 'scout_plus', 'lead', 'tech_lead']
const RESCOUTER_DEFAULT_ROLES: UserRole[] = ['scout_plus', 'lead', 'tech_lead']

const isUserRole = (value: unknown): value is UserRole => VALID_ROLES.includes(value as UserRole)

const areRoleAssignmentsEqual = (a: RoleAssignments, b: RoleAssignments): boolean => {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  for (const key of aKeys) {
    if (a[key] !== b[key]) {
      return false
    }
  }
  return true
}

const SCOUT_POSITIONS = ['red-1', 'red-2', 'red-3', 'blue-1', 'blue-2', 'blue-3'] as const

type StoredOAuthState = {
  nonce: string
  createdAt: number
  returnTo?: string
  mode?: 'interactive' | 'silent'
}

type GoogleIdTokenPayload = {
  email?: string
  name?: string
  picture?: string
  sub?: string
  nonce?: string
  exp?: number
}

type OAuthProcessResult = {
  success: boolean
  message: string
  returnTo?: string
  mode?: 'interactive' | 'silent'
}

const coerceRecentUserRecord = (entry: Partial<RecentUserRecord>): RecentUserRecord | null => {
  const email = entry.email ? normalizeEmail(entry.email) : ''
  if (!email) {
    return null
  }

  const firstSeenAt = entry.firstSeenAt || new Date().toISOString()
  const lastSeenAt = entry.lastSeenAt || firstSeenAt

  return {
    email,
    firstSeenAt,
    lastSeenAt,
    acknowledged: entry.acknowledged ?? false,
    displayName: entry.displayName?.trim() || undefined,
    photoUrl: entry.photoUrl || undefined,
    firstName: entry.firstName?.trim() || undefined,
    lastName: entry.lastName?.trim() || undefined,
    teamNumber: entry.teamNumber?.trim() || undefined,
  }
}

const parseStoredRecentUsers = (raw: string | null): RecentUserRecord[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as Array<Partial<RecentUserRecord>>
    return parsed
      .map(coerceRecentUserRecord)
      .filter((record): record is RecentUserRecord => Boolean(record))
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
      .slice(0, MAX_RECENT_USERS)
  } catch (error) {
    console.warn('Failed to parse stored recent users', error)
    return []
  }
}

const readStoredVerificationSyncPayload = (
  email: string,
  profilesByEmail: Record<string, AllianceProfile>,
): StoredVerificationSyncPayload => {
  if (typeof window === 'undefined') return {}

  const profile = findStoredVerificationProfile(
    email,
    profilesByEmail,
    parseStoredRecentUsers(localStorage.getItem(RECENT_STORAGE_KEY))
  )

  if (!profile) return {}

  return {
    name: profile.displayName,
    firstName: profile.firstName,
    lastName: profile.lastName,
    teamNumber: profile.teamNumber,
  }
}

const upsertRecentUserRecord = (
  existing: RecentUserRecord[],
  payload: {
    email: string
    name?: string | null
    picture?: string | null
    acknowledged?: boolean
    firstName?: string | null
    lastName?: string | null
    teamNumber?: string | null
  }
): RecentUserRecord[] => {
  const email = normalizeEmail(payload.email)
  if (!email) return existing

  const timestamp = new Date().toISOString()
  const index = existing.findIndex((item) => item.email === email)
  const firstName = payload.firstName?.trim()
  const lastName = payload.lastName?.trim()
  const teamNumber = payload.teamNumber?.trim()
  const profileDisplayName = firstName || lastName ? `${firstName || ''} ${lastName || ''}`.trim() : ''
  const displayName = payload.name?.trim() || profileDisplayName

  if (index >= 0) {
    const updated = [...existing]
    const current = updated[index]
    updated[index] = {
      ...current,
      lastSeenAt: timestamp,
      displayName: displayName || current.displayName,
      photoUrl: payload.picture || current.photoUrl,
      firstName: firstName || current.firstName,
      lastName: lastName || current.lastName,
      teamNumber: teamNumber || current.teamNumber,
      acknowledged: payload.acknowledged ?? current.acknowledged,
    }
    return updated.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
  }

  const nextRecord: RecentUserRecord = {
    email,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    acknowledged: payload.acknowledged ?? false,
    displayName: displayName || undefined,
    photoUrl: payload.picture || undefined,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    teamNumber: teamNumber || undefined,
  }

  return [nextRecord, ...existing].slice(0, MAX_RECENT_USERS)
}

const base64UrlDecode = (segment: string) => {
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
  const decoded = atob(padded)
  return decoded
}

const decodeIdToken = (token: string): GoogleIdTokenPayload => {
  const parts = token.split('.')
  if (parts.length < 2) {
    throw new Error('Malformed ID token')
  }
  const payload = base64UrlDecode(parts[1])
  return JSON.parse(payload) as GoogleIdTokenPayload
}

const readCurrentAppPath = () => {
  if (typeof window === 'undefined') return '/'
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

const readSavedUserEmail = () => {
  if (typeof window === 'undefined') return null
  const saved = localStorage.getItem('auth_user')
  if (!saved) return null
  try {
    const parsed = JSON.parse(saved) as Partial<User>
    return parsed.email ? normalizeEmail(parsed.email) : null
  } catch {
    return null
  }
}

const generateOpaqueString = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

const roleRank: Record<UserRole, number> = {
  blocked: 0,
  pending: 0,
  pit_scout: 1,
  drive_team: 1,
  scout_minus: 2,
  scout: 2,
  scout_plus: 2,
  lead: 3,
  tech_lead: 4,
}

const isLeadRole = (roleValue: UserRole) => roleRank[roleValue] >= roleRank.lead

const routePermissions: Array<{ pattern: RegExp; minRole: UserRole | null }> = [
  { pattern: /^\/$/, minRole: 'scout' }, // Home page for verified users only
  { pattern: /^\/game-start$/, minRole: 'scout' },
  { pattern: /^\/auto-start$/, minRole: 'scout' },
  { pattern: /^\/auto-scoring$/, minRole: 'scout' },
  { pattern: /^\/teleop-scoring$/, minRole: 'scout' },
  { pattern: /^\/endgame$/, minRole: 'scout' },
  { pattern: /^\/scout-form$/, minRole: 'scout' },
  { pattern: /^\/tos$/, minRole: null }, // Public terms of service
  { pattern: /^\/terms$/, minRole: null }, // Public terms of service
  { pattern: /^\/privacy$/, minRole: null }, // Public privacy policy
  { pattern: /^\/match-strategy$/, minRole: 'lead' },
  { pattern: /^\/team-stats$/, minRole: 'lead' },
  { pattern: /^\/pit-scouting$/, minRole: 'pit_scout' },
  { pattern: /^\/drive-scouting$/, minRole: 'drive_team' },
  { pattern: /^\/pick-list$/, minRole: 'lead' },
  { pattern: /^\/strategy-overview$/, minRole: 'lead' },
  { pattern: /^\/pit-assignments$/, minRole: 'lead' },
  { pattern: /^\/verification-center$/, minRole: 'lead' },
  { pattern: /^\/match-data-qr$/, minRole: 'lead' },
  { pattern: /^\/shift-generator$/, minRole: 'lead' },
  { pattern: /^\/achievements$/, minRole: 'lead' },
  { pattern: /^\/event-settings$/, minRole: 'lead' },
  { pattern: /^\/scout-management$/, minRole: 'lead' },
  { pattern: /^\/admin$/, minRole: 'tech_lead' },
  { pattern: /^\/pi-panel$/, minRole: 'lead' },
  { pattern: /^\/data-management$/, minRole: 'tech_lead' },
  { pattern: /^\/clear-data$/, minRole: 'tech_lead' },
  { pattern: /^\/json-transfer$/, minRole: 'lead' },
  { pattern: /^\/qr-data-transfer$/, minRole: 'lead' },
  { pattern: /^\/api-data$/, minRole: 'tech_lead' },
  { pattern: /^\/dev-utilities$/, minRole: 'tech_lead' },
  { pattern: /^\/user-management$/, minRole: 'tech_lead' },
  { pattern: /^\/scout-activity$/, minRole: 'lead' },
  { pattern: /^\/schedule$/, minRole: 'scout' },
  { pattern: /^\/rescout$/, minRole: 'scout_plus' },
  { pattern: /^\/outliers$/, minRole: 'lead' },
  { pattern: /^\/alliance-onboarding$/, minRole: null }, // Accessible to anyone, including pending/unverified
  { pattern: /^\/auth\/google\/callback$/, minRole: null }, // Accessible to anyone for OAuth flow
]

const DEFAULT_ROUTE_BY_ROLE: Record<UserRole, string> = {
  tech_lead: '/',
  lead: '/',
  scout_plus: '/',
  scout: '/',
  scout_minus: '/',
  pit_scout: '/pit-scouting',
  drive_team: '/drive-scouting',
  blocked: '/alliance-onboarding',
  pending: '/alliance-onboarding',
}

type ScheduleAssignment = {
  matchNumber: string
  startTime?: string
  positions: Record<string, string>
}

type StoredScheduleState = {
  eventKey?: string
  matches?: unknown
  assignments?: ScheduleAssignment[]
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

declare global {
  interface Window {
    google?: unknown
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  const [authorizationReady, setAuthorizationReady] = useState(false)
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignments>(() => {
    try {
      const raw = localStorage.getItem(ROLE_STORAGE_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw) as RoleAssignments
      const validRoles = new Set<UserRole>(VALID_ROLES)
      const normalizedAssignments = Object.entries(parsed).reduce<RoleAssignments>((acc, [email, role]) => {
        // Only keep valid roles
        if (validRoles.has(role)) {
          acc[normalizeEmail(email)] = role
        } else {
          console.warn(`Filtered out invalid role for ${email}: ${role}`)
        }
        return acc
      }, {})
      ULTRA_ADMIN_EMAILS.forEach((ultraAdminEmail: string) => {
        if (ultraAdminEmail) {
          normalizedAssignments[ultraAdminEmail] = 'tech_lead'
        }
      })
      ADMIN_EMAILS.forEach((adminEmail: string) => {
        if (adminEmail && !ULTRA_ADMIN_EMAILS.includes(adminEmail)) {
          normalizedAssignments[adminEmail] = 'lead'
        }
      })
      return normalizedAssignments
    } catch (error) {
      console.warn('Failed to parse stored role assignments', error)
      const fallback: RoleAssignments = {}
      ULTRA_ADMIN_EMAILS.forEach((ultraAdminEmail: string) => {
        if (ultraAdminEmail) {
          fallback[ultraAdminEmail] = 'tech_lead'
        }
      })
      ADMIN_EMAILS.forEach((adminEmail: string) => {
        if (adminEmail && !ULTRA_ADMIN_EMAILS.includes(adminEmail)) {
          fallback[adminEmail] = 'lead'
        }
      })
      return fallback
    }
  })
  const [rescouterPermissions, setRescouterPermissions] = useState<Record<string, boolean>>({})

  const [recentUsers, setRecentUsers] = useState<RecentUserRecord[]>(() => {
    try {
      return parseStoredRecentUsers(localStorage.getItem(RECENT_STORAGE_KEY))
    } catch (error) {
      console.warn('Failed to load stored recent users', error)
      return []
    }
  })
  const [allianceProfiles, setAllianceProfiles] = useState<Record<string, AllianceProfile>>(() => {
    try {
      const raw = localStorage.getItem(ALLIANCE_PROFILE_STORAGE_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw) as Record<string, AllianceProfile>
      return Object.entries(parsed).reduce<Record<string, AllianceProfile>>((acc, [email, profile]) => {
        if (profile && typeof profile === 'object') {
          const normalized = normalizeEmail((profile as Partial<AllianceProfile>).email || email)
          const typedProfile = profile as Partial<AllianceProfile>
          acc[normalized] = {
            email: normalized,
            firstName: typedProfile.firstName?.trim() || '',
            lastName: typedProfile.lastName?.trim() || '',
            displayName: typedProfile.displayName?.trim() || undefined,
            teamNumber: typedProfile.teamNumber?.toString() || '',
            confirmedAlliance: Boolean(typedProfile.confirmedAlliance),
            submittedAt: typedProfile.submittedAt || new Date().toISOString(),
            lastSeenAt: typedProfile.lastSeenAt || typedProfile.submittedAt || new Date().toISOString(),
          }
        }
        return acc
      }, {})
    } catch (error) {
      console.warn('Failed to parse stored alliance profiles', error)
      return {}
    }
  })
  const [requiresAllianceConfirmation, setRequiresAllianceConfirmation] = useState(false)
  const silentRefreshStartedRef = useRef(false)
  const silentRefreshPopupRef = useRef<Window | null>(null)

  const cleanupExpiredOAuthState = useCallback(() => {
    const now = Date.now()
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(OAUTH_STATE_PREFIX)) continue
      try {
        const stored = JSON.parse(localStorage.getItem(key) || 'null') as StoredOAuthState | null
        if (!stored || now - stored.createdAt > OAUTH_STATE_TTL_MS) {
          localStorage.removeItem(key)
        }
      } catch {
        localStorage.removeItem(key)
      }
    }
  }, [])

  const consumeOAuthState = useCallback((stateValue: string) => {
    const key = `${OAUTH_STATE_PREFIX}${stateValue}`
    const raw = localStorage.getItem(key)
    localStorage.removeItem(key)
    if (!raw) return null
    try {
      const parsed = JSON.parse(raw) as StoredOAuthState
      if (!parsed || Date.now() - parsed.createdAt > OAUTH_STATE_TTL_MS) {
        return null
      }
      return parsed
    } catch (error) {
      console.warn('Failed to parse stored OAuth state', error)
      return null
    }
  }, [])

  const storeOAuthState = useCallback((
    stateValue: string,
    nonce: string,
    options?: { returnTo?: string; mode?: 'interactive' | 'silent' }
  ) => {
    const payload: StoredOAuthState = {
      nonce,
      createdAt: Date.now(),
      returnTo: options?.returnTo,
      mode: options?.mode,
    }
    localStorage.setItem(`${OAUTH_STATE_PREFIX}${stateValue}`, JSON.stringify(payload))
  }, [])

  const ensureAdminPresence = useCallback((assignments: RoleAssignments): RoleAssignments => {
    const next = { ...assignments }

    // Ensure ultra admins always have tech_lead role
    ULTRA_ADMIN_EMAILS.forEach((ultraAdminEmail) => {
      if (ultraAdminEmail) {
        next[ultraAdminEmail] = 'tech_lead'
      }
    })

    // Ensure regular admins have admin role (but not if they're ultra admins)
    ADMIN_EMAILS.forEach((adminEmail) => {
      if (adminEmail && !ULTRA_ADMIN_EMAILS.includes(adminEmail)) {
        next[adminEmail] = 'lead'
      }
    })

    return next
  }, [])

  const clearStoredAuthSession = useCallback(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_user')
      localStorage.removeItem(AUTH_ID_TOKEN_KEY)
      // Also drop the backend-issued access/refresh tokens (and best-effort
      // invalidate the refresh token server-side).
      clearBackendSession()
    }
    silentRefreshStartedRef.current = false
    setUser(null)
    setRequiresAllianceConfirmation(false)
    setAuthorizationReady(true)
  }, [])

  const startGoogleAuth = useCallback((options?: {
    prompt?: 'consent select_account' | 'none'
    mode?: 'interactive' | 'silent'
    returnTo?: string
    loginHint?: string
    replace?: boolean
    popup?: boolean
  }) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      console.warn('Cannot start Google login without VITE_GOOGLE_CLIENT_ID')
      return false
    }

    const configuredRedirect = import.meta.env.VITE_GOOGLE_REDIRECT_URI
    const currentOrigin = window.location.origin
    const mode = options?.mode || 'interactive'
    const canonicalRestartUrl =
      mode === 'interactive'
        ? buildCanonicalGoogleAuthRestartUrl({
            configuredRedirect,
            currentHref: window.location.href,
            currentOrigin,
            authStartParam: GOOGLE_AUTH_START_PARAM,
            authStartValue: GOOGLE_AUTH_START_VALUE,
          })
        : null

    if (canonicalRestartUrl) {
      window.location.assign(canonicalRestartUrl)
      return true
    }

    const redirectResolution = resolveGoogleRedirectUri({
      configuredRedirect,
      currentOrigin,
      callbackPath: AUTH_CALLBACK_PATH,
    })

    if (configuredRedirect && !redirectResolution.configuredRedirectOrigin) {
      console.warn('Invalid VITE_GOOGLE_REDIRECT_URI; falling back to current origin callback.')
    } else if (configuredRedirect && !redirectResolution.usesConfiguredRedirect) {
      console.warn(
        `Configured Google redirect (${redirectResolution.configuredRedirectOrigin}) does not match current origin (${currentOrigin}); using ${redirectResolution.currentCallbackUri}. ` +
        `Add this exact callback URL to the OAuth client in Google Cloud to avoid Google error 400.`,
      )
    }
    const redirectUri = redirectResolution.redirectUri

    const stateValue = generateOpaqueString()
    const nonce = generateOpaqueString()
    storeOAuthState(stateValue, nonce, {
      returnTo: options?.returnTo || readCurrentAppPath(),
      mode,
    })

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'id_token',
      scope: 'openid email profile',
      prompt: options?.prompt || 'consent select_account',
      state: stateValue,
      nonce,
    })

    if (options?.loginHint) {
      params.set('login_hint', normalizeEmail(options.loginHint))
    }

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    if (options?.popup) {
      try { silentRefreshPopupRef.current?.close() } catch { /* ignore */ }
      const popup = window.open(authUrl, 'silent-auth', 'width=500,height=600,menubar=no,toolbar=no')
      if (popup) {
        silentRefreshPopupRef.current = popup
        // Reset flag when popup closes without a successful auth message
        const pollClose = setInterval(() => {
          try {
            if (popup.closed) {
              clearInterval(pollClose)
              silentRefreshStartedRef.current = false
              silentRefreshPopupRef.current = null
            }
          } catch {
            clearInterval(pollClose)
          }
        }, 500)
      } else {
        // Popup blocked (common on iOS PWA) — reset so future attempts can try
        silentRefreshStartedRef.current = false
      }
    } else if (options?.replace) {
      window.location.replace(authUrl)
    } else {
      window.location.assign(authUrl)
    }
    return true
  }, [storeOAuthState])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.pathname === AUTH_CALLBACK_PATH) return

    const url = new URL(window.location.href)
    if (url.searchParams.get(GOOGLE_AUTH_START_PARAM) !== GOOGLE_AUTH_START_VALUE) return

    url.searchParams.delete(GOOGLE_AUTH_START_PARAM)
    const returnTo = `${url.pathname}${url.search}${url.hash}`
    window.history.replaceState({}, document.title, returnTo)

    startGoogleAuth({
      prompt: 'consent select_account',
      mode: 'interactive',
      returnTo,
      replace: true,
    })
  }, [startGoogleAuth])

  const syncRecentUserPayload = useCallback(async (payload: {
    email: string
    name?: string | null
    picture?: string | null
    acknowledged?: boolean
    firstName?: string | null
    lastName?: string | null
    teamNumber?: string | null
  }) => {
    const normalizedEmail = normalizeEmail(payload.email)
    if (!normalizedEmail) return

    const firstName = payload.firstName?.trim()
    const lastName = payload.lastName?.trim()
    const teamNumber = payload.teamNumber?.trim()
    const profileDisplayName = firstName || lastName ? `${firstName || ''} ${lastName || ''}`.trim() : ''
    const displayName = payload.name?.trim() || profileDisplayName
    const shouldDeferPendingRequest = !isAutoApprovedEmail(normalizedEmail) && !hasCompletedOnboarding({
      firstName,
      lastName,
      teamNumber,
    })

    if (shouldDeferPendingRequest) {
      return true
    }

    try {
      await apiPut(`/recent-users/${encodeURIComponent(normalizedEmail)}`, {
        email: normalizedEmail,
        lastSeenAt: new Date().toISOString(),
        ...(typeof payload.acknowledged === 'undefined' ? {} : { acknowledged: payload.acknowledged }),
        displayName: displayName || undefined,
        photoUrl: payload.picture || undefined,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        teamNumber: teamNumber || undefined,
      })
      return true
    } catch (error) {
      console.error("Failed to sync recent user record", error)
      return false
    }
  }, [])

  const upsertRecentUser = useCallback(
    (payload: {
      email: string
      name?: string | null
      picture?: string | null
      acknowledged?: boolean
      firstName?: string | null
      lastName?: string | null
      teamNumber?: string | null
    }) => {
      const normalizedEmail = normalizeEmail(payload.email)
      if (!normalizedEmail) return

      setRecentUsers((prev) => {
        return upsertRecentUserRecord(prev, {
          email: normalizedEmail,
          name: payload.name,
          picture: payload.picture,
          acknowledged: payload.acknowledged,
          firstName: payload.firstName,
          lastName: payload.lastName,
          teamNumber: payload.teamNumber,
        })
      })

      void syncRecentUserPayload({
        ...payload,
        email: normalizedEmail,
      })
    },
    [syncRecentUserPayload]
  )

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      console.warn('VITE_GOOGLE_CLIENT_ID not set; Google login disabled')
    }
    cleanupExpiredOAuthState()

    if (window.location.pathname === AUTH_CALLBACK_PATH) {
      setReady(true)
      return
    }

    const saved = localStorage.getItem('auth_user')
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as User
        const normalized = normalizeEmail(parsed.email)

        setUser((current) => {
          if (current && normalizeEmail(current.email) === normalized) {
            return current
          }
          return parsed
        })

        setRoleAssignments((prev) => {
          const next = ensureAdminPresence(retainSessionStartRole({ email: normalized, assignments: prev }))
          return areRoleAssignmentsEqual(prev, next) ? prev : next
        })

        setRoleAssignments((prev) => {
          const next = ensureAdminPresence(prev)
          return areRoleAssignmentsEqual(prev, next) ? prev : next
        })
      } catch (error) {
        console.warn('Failed to restore saved user', error)
        clearStoredAuthSession()
      }
    }

    setReady(true)
  }, [cleanupExpiredOAuthState, clearStoredAuthSession, ensureAdminPresence])

  useEffect(() => {
    // Clean up any invalid roles from localStorage on mount
    const validRoles = new Set<UserRole>(VALID_ROLES)
    setRoleAssignments((prev) => {
      const cleaned = Object.entries(prev).reduce<RoleAssignments>((acc, [email, role]) => {
        if (validRoles.has(role)) {
          acc[email] = role
        } else {
          console.warn(`Removing invalid role from state: ${email} -> ${role}`)
        }
        return acc
      }, {})
      
      // Re-add admin emails
      ULTRA_ADMIN_EMAILS.forEach((ultraAdminEmail: string) => {
        if (ultraAdminEmail) {
          cleaned[ultraAdminEmail] = 'tech_lead'
        }
      })
      ADMIN_EMAILS.forEach((adminEmail: string) => {
        if (adminEmail && !ULTRA_ADMIN_EMAILS.includes(adminEmail)) {
          cleaned[adminEmail] = 'lead'
        }
      })
      
      return cleaned
    })
  }, [])

  useEffect(() => {
    localStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify(roleAssignments))
  }, [roleAssignments])

  const fetchRoleAssignmentsFromApi = useCallback(async () => {
    if (!hasUsableAuthToken()) {
      throw new Error('No usable auth token')
    }
    if (!user?.email) {
      throw new Error('No signed-in user')
    }
    const normalizedCurrentEmail = normalizeEmail(user.email)
    try {
      const currentRoleResponse = await apiGet<{ email: string; role: string }>('/roles/me')
      const currentRole = isUserRole(currentRoleResponse.role)
        ? currentRoleResponse.role
        : resolveDefaultRole(normalizedCurrentEmail)

      setRoleAssignments((prev) => {
        const next = ensureAdminPresence(mergeCurrentUserRole({
          email: currentRoleResponse.email || normalizedCurrentEmail,
          role: currentRole,
          assignments: prev,
        }))
        return areRoleAssignmentsEqual(prev, next) ? prev : next
      })

      if (!isLeadRole(currentRole)) {
        return
      }

      const response = await apiGet<{ roleAssignments?: Record<string, string> }>('/roles')
      const remoteAssignments = Object.entries(response.roleAssignments || {}).reduce<RoleAssignments>(
        (acc, [email, roleValue]) => {
          const normalizedEmail = normalizeEmail(email)
          if (!normalizedEmail || !isUserRole(roleValue)) {
            return acc
          }
          acc[normalizedEmail] = roleValue
          return acc
        },
        {}
      )

      setRoleAssignments((prev) => {
        const next = ensureAdminPresence(remoteAssignments)
        return areRoleAssignmentsEqual(prev, next) ? prev : next
      })
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? (error as { status?: number }).status : undefined
      setRoleAssignments((prev) => {
        const inferredRole = resolveRoleAfterRefreshFailure({
          existingRole: prev[normalizedCurrentEmail],
          fallbackStatus: status,
          defaultRole: resolveDefaultRole(normalizedCurrentEmail),
        })
        const next = ensureAdminPresence(mergeCurrentUserRole({
          email: normalizedCurrentEmail,
          role: inferredRole,
          assignments: prev,
        }))
        return areRoleAssignmentsEqual(prev, next) ? prev : next
      })
      console.error('Failed to fetch role assignments from API', error)
      throw error
    }
  }, [ensureAdminPresence, user])

  const fetchRescouterPermissions = useCallback(async () => {
    if (!hasUsableAuthToken()) return
    try {
      const data = await apiGet<{ permissions: Record<string, boolean> }>('/rescout/permissions')
      setRescouterPermissions(data.permissions ?? {})
    } catch {
      // non-critical, leave empty
    }
  }, [])

  const fetchRecentUsersFromApi = useCallback(async () => {
    if (!hasUsableAuthToken()) {
      throw new Error('No usable auth token')
    }
    try {
      const response = await apiGet<{ recentUsers?: RecentUserApiRecord[] }>("/recent-users")
      const sanitized = (response.recentUsers || [])
        .map((entry) =>
          coerceRecentUserRecord({
            email: entry.email ?? "",
            firstSeenAt: entry.firstSeenAt ?? entry.first_seen_at,
            lastSeenAt: entry.lastSeenAt ?? entry.last_seen_at,
            acknowledged: entry.acknowledged,
            displayName: entry.displayName ?? entry.display_name,
            photoUrl: entry.photoUrl ?? entry.photo_url,
            firstName: entry.firstName ?? entry.first_name,
            lastName: entry.lastName ?? entry.last_name,
            teamNumber: entry.teamNumber ?? entry.team_number,
          })
        )
        .filter((record): record is RecentUserRecord => Boolean(record))
        .slice(0, MAX_RECENT_USERS)

      setRecentUsers((prev) => {
        if (sanitized.length === prev.length && sanitized.every((record, index) => {
          const current = prev[index]
          return (
            current.email === record.email &&
            current.firstSeenAt === record.firstSeenAt &&
            current.lastSeenAt === record.lastSeenAt &&
            Boolean(current.acknowledged) === Boolean(record.acknowledged) &&
            (current.displayName || "") === (record.displayName || "") &&
            (current.photoUrl || "") === (record.photoUrl || "") &&
            (current.firstName || "") === (record.firstName || "") &&
            (current.lastName || "") === (record.lastName || "") &&
            (current.teamNumber || "") === (record.teamNumber || "")
          )
        })) {
          return prev
        }
        return sanitized
      })
    } catch (error) {
      console.error("Failed to fetch recent users from API", error)
      throw error
    }
  }, [])

  useEffect(() => {
    if (!ready) return
    if (!user) {
      setAuthorizationReady(true)
      return
    }
    if (!hasUsableAuthToken()) {
      setAuthorizationReady(true)
      return
    }

    setAuthorizationReady(false)
    let cancelled = false

    // Safety net: if the role fetch hangs (congested event WiFi, unreachable server),
    // unblock the UI after 10 s using cached roles from localStorage.
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setAuthorizationReady(true)
      }
    }, 10_000)

    const run = async () => {
      try {
        await fetchRoleAssignmentsFromApi()
        void fetchRescouterPermissions()
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load roles from API', error)
        }
      } finally {
        clearTimeout(timeoutId)
        if (!cancelled) {
          setAuthorizationReady(true)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [ready, user, fetchRoleAssignmentsFromApi, fetchRescouterPermissions])

  useEffect(() => {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentUsers))
  }, [recentUsers])

  useEffect(() => {
    localStorage.setItem(ALLIANCE_PROFILE_STORAGE_KEY, JSON.stringify(allianceProfiles))
  }, [allianceProfiles])

  const processOAuthResponse = useCallback((idToken: string, stateValue: string | undefined): OAuthProcessResult => {
    if (!idToken) {
      return { success: false, message: 'Missing ID token in OAuth response.' }
    }
    if (!stateValue) {
      return { success: false, message: 'Missing OAuth state parameter.' }
    }

    const storedState = consumeOAuthState(stateValue)
    if (!storedState) {
      return { success: false, message: 'OAuth session expired or invalid. Please try signing in again.' }
    }

    try {
      const payload = decodeIdToken(idToken)
      if (!payload.email) {
        throw new Error('Google response did not include an email address.')
      }

      if (payload.nonce && storedState.nonce && payload.nonce !== storedState.nonce) {
        throw new Error('Nonce validation failed.')
      }

      const normalizedEmail = normalizeEmail(payload.email)
      const existingProfile = allianceProfiles[normalizedEmail]
      const storedVerificationProfile = readStoredVerificationSyncPayload(normalizedEmail, allianceProfiles)
      const resolvedName =
        storedVerificationProfile.name?.trim() ||
        existingProfile?.displayName?.trim() ||
        payload.name?.trim() ||
        payload.email

      const nextUser: User = {
        name: resolvedName,
        email: normalizedEmail,
        picture: payload.picture,
        sub: payload.sub || normalizedEmail,
      }

      silentRefreshStartedRef.current = false
      try { silentRefreshPopupRef.current?.close() } catch { /* ignore */ }
      silentRefreshPopupRef.current = null
      setUser(nextUser)
      localStorage.setItem('auth_user', JSON.stringify(nextUser))
      localStorage.setItem(AUTH_ID_TOKEN_KEY, idToken)
      window.dispatchEvent(new CustomEvent(AUTH_REFRESHED_EVENT))

      // Exchange the ~1-hour Google token for a long-lived backend session
      // (5-day access token + refresh token valid until logout). If this fails (server
      // unreachable right now), the raw id_token still works for a while and
      // apiClient retries the exchange on the next online/focus/interval tick.
      void establishBackendSession(idToken)

      setRoleAssignments((prev) => {
        const next = ensureAdminPresence(retainSessionStartRole({ email: normalizedEmail, assignments: prev }))
        return areRoleAssignmentsEqual(prev, next) ? prev : next
      })

      upsertRecentUser({
        email: normalizedEmail,
        name: resolvedName,
        picture: payload.picture,
        acknowledged: isAutoApprovedEmail(normalizedEmail),
        ...storedVerificationProfile,
      })

      if (existingProfile) {
        const timestamp = new Date().toISOString()
        setAllianceProfiles((prev) => {
          const profile = prev[normalizedEmail]
          if (!profile) return prev
          if (profile.lastSeenAt === timestamp) return prev
          return {
            ...prev,
            [normalizedEmail]: {
              ...profile,
              lastSeenAt: timestamp,
            },
          }
        })
      }

      setRequiresAllianceConfirmation(false)

      void apiPost('/recent-users/self-register-role', {}).catch((error) => {
        console.warn('Failed to ensure scout role after login', error)
      })

      void fetchRoleAssignmentsFromApi().catch((error) => {
        console.error('Failed to refresh roles after login', error)
      })

      return {
        success: true as const,
        message: `Signed in as ${resolvedName}`,
        returnTo: storedState.returnTo || '/',
        mode: storedState.mode || 'interactive',
      }
    } catch (error) {
      silentRefreshStartedRef.current = false
      console.error('Failed to process OAuth response', error)
      return {
        success: false as const,
        message: error instanceof Error ? error.message : 'Unknown OAuth error.',
        returnTo: storedState.returnTo || '/',
        mode: storedState.mode || 'interactive',
      }
    }
  }, [allianceProfiles, consumeOAuthState, ensureAdminPresence, fetchRoleAssignmentsFromApi, setAllianceProfiles, setRoleAssignments, upsertRecentUser])

  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data
      if (!data || typeof data !== 'object') return
      if (data.type !== 'google-oauth-token' && data.type !== 'google-oauth-error') return

      let result: OAuthProcessResult
      if (data.type === 'google-oauth-token') {
        const { idToken, state } = data as { idToken?: string; state?: string }
        result = processOAuthResponse(idToken || '', state)
      } else {
        const { error, errorDescription, state } = data as {
          error?: string
          errorDescription?: string
          state?: string
        }
        const storedState = state ? consumeOAuthState(state) : null
        const mode = storedState?.mode || 'interactive'
        const savedEmail = normalizeEmail(user?.email || readSavedUserEmail() || '')
        const recovery = resolveOAuthErrorRecovery({
          mode,
          hasSavedUser: Boolean(savedEmail),
          returnTo: storedState?.returnTo,
        })

        if (recovery === 'retry-interactive') {
          silentRefreshStartedRef.current = false
          // Leaves the page for Google's account picker; the callback page's
          // escape hatch covers the case where navigation never happens.
          startGoogleAuth({
            mode: 'interactive',
            loginHint: savedEmail,
            returnTo: storedState?.returnTo || '/',
            replace: true,
          })
          return
        } else {
          if (recovery === 'clear-session') {
            clearStoredAuthSession()
          } else {
            silentRefreshStartedRef.current = false
          }
          result = {
            success: false,
            message: errorDescription || error || 'Google sign-in failed.',
            returnTo: mode === 'silent' ? '/' : (storedState?.returnTo || '/'),
            mode,
          }
        }
      }

      try {
        if (event.source && 'postMessage' in event.source) {
          ;(event.source as Window).postMessage(
            {
              type: 'google-auth-complete',
              success: result.success,
              message: result.message,
              returnTo: result.returnTo,
              mode: result.mode,
            },
            event.origin,
          )
        }
      } catch (error) {
        console.warn('Failed to notify auth window', error)
      }
    }

    window.addEventListener('message', handleOAuthMessage)
    return () => {
      window.removeEventListener('message', handleOAuthMessage)
    }
  }, [clearStoredAuthSession, consumeOAuthState, processOAuthResponse, startGoogleAuth, user])

  const renewSession = useCallback(async (options?: { returnTo?: string }): Promise<boolean> => {
    if (typeof window === 'undefined') return false
    if (window.location.pathname === AUTH_CALLBACK_PATH) return false

    // First choice: silently exchange our refresh token for a new access
    // token. No page reload, no Google, works on internet-less venue WiFi.
    // Only if the server DEFINITIVELY rejects the session (or we never had
    // one) do we fall back to the Google prompt=none redirect flow below.
    // When the server/database is merely down, redirecting to Google is
    // pointless — the id_token exchange would fail the same way — and it
    // produced a "sign-in failed" loop for scouts. In that case we wait;
    // apiClient retries the refresh on the next online/focus/interval tick.
    let action: ReturnType<typeof resolveRenewalAction> = 'google'
    try {
      action = resolveRenewalAction(await refreshBackendSessionDetailed())
    } catch {
      action = 'wait'
    }
    if (action === 'done') return true
    if (action === 'wait') return false

    const saved = localStorage.getItem('auth_user')
    const currentEmail = user?.email || (saved ? (() => {
      try {
        const parsed = JSON.parse(saved) as User
        return parsed.email
      } catch {
        return null
      }
    })() : null)
    if (!currentEmail) return false
    if (silentRefreshStartedRef.current) return false

    silentRefreshStartedRef.current = true
    // If the redirect never actually navigates (iOS PWA quirk, blocked
    // navigation), this guard used to stay set forever and "Renew now"
    // silently did nothing until a full reload. Release it after a grace
    // period so the button always does something.
    window.setTimeout(() => {
      silentRefreshStartedRef.current = false
    }, 15_000)
    return startGoogleAuth({
      prompt: 'none',
      mode: 'silent',
      loginHint: currentEmail,
      returnTo: options?.returnTo || readCurrentAppPath(),
      replace: true,
    })
  }, [user, startGoogleAuth])

  useEffect(() => {
    if (!user) {
      setRequiresAllianceConfirmation(false)
      return
    }
    setRequiresAllianceConfirmation(false)
  }, [user])

  const applyScoutProfile = useCallback((currentUser: User, currentRole: UserRole) => {
    if (currentRole === 'pending') {
      return
    }
    const trimmedName = currentUser.name?.trim()
    if (trimmedName) {
      try {
        const storedList = localStorage.getItem('scoutsList')
        const parsedList: string[] = storedList ? JSON.parse(storedList) : []
        if (!parsedList.includes(trimmedName)) {
          const updatedList = [...parsedList, trimmedName].sort((a, b) => a.localeCompare(b))
          localStorage.setItem('scoutsList', JSON.stringify(updatedList))
        }
        const existingScout = localStorage.getItem('currentScout')
        if (existingScout !== trimmedName) {
          localStorage.setItem('currentScout', trimmedName)
          localStorage.setItem('scoutName', trimmedName)
          window.dispatchEvent(new Event('scoutDataUpdated'))
        }
      } catch (error) {
        console.warn('Failed to sync scout profile for Google user', error)
      }
    }

    const setPlayerStation = (station: string) => {
      const existing = localStorage.getItem('playerStation')
      if (existing !== station) {
        localStorage.setItem('playerStation', station)
        window.dispatchEvent(new CustomEvent('playerStationUpdated', { detail: station }))
      }
    }

    if (currentRole === 'lead' || currentRole === 'tech_lead') {
      setPlayerStation('lead')
      return
    }

    try {
      const raw = localStorage.getItem(SCHEDULE_STORAGE_KEY)
      if (raw) {
        const schedule = JSON.parse(raw) as StoredScheduleState
        if (Array.isArray(schedule.assignments)) {
          const targetEmail = normalizeEmail(currentUser.email)
          for (const assignment of schedule.assignments) {
            if (!assignment || typeof assignment !== 'object') continue
            const positions = assignment.positions || {}
            for (const position of SCOUT_POSITIONS) {
              const value = positions[position]
              if (value && normalizeEmail(value) === targetEmail) {
                setPlayerStation(position)
                return
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to parse schedule automation state', error)
    }

    setPlayerStation('red-1')
  }, [])

  const login = useCallback(() => {
    startGoogleAuth({
      prompt: 'consent select_account',
      mode: 'interactive',
      returnTo: readCurrentAppPath(),
    })
  }, [startGoogleAuth])

  const logout = useCallback(() => {
    clearStoredAuthSession()
  }, [clearStoredAuthSession])

  const submitAllianceProfile = useCallback(async (input: AllianceProfileInput) => {
    if (!user) {
      return { success: false, message: 'Sign in before submitting alliance details.' }
    }
    const firstName = input.firstName.trim()
    const lastName = input.lastName.trim()
    const teamNumber = input.teamNumber.trim()

    if (!firstName || !lastName || !teamNumber) {
      return { success: false, message: 'Please complete all required fields.' }
    }
    if (!input.confirmedAlliance) {
      return { success: false, message: 'Confirm your membership in the scouting alliance first.' }
    }

    const normalized = normalizeEmail(user.email)
    const timestamp = new Date().toISOString()
    const displayName = `${firstName} ${lastName}`.trim()
    const profile: AllianceProfile = {
      email: normalized,
      firstName,
      lastName,
      displayName: displayName || undefined,
      teamNumber,
      confirmedAlliance: true,
      submittedAt: timestamp,
      lastSeenAt: timestamp,
    }

    const synced = await syncRecentUserPayload({
      email: normalized,
      name: displayName,
      picture: user.picture,
      acknowledged: false,
      firstName,
      lastName,
      teamNumber,
    })

    if (!synced) {
      return { success: false, message: 'Could not send your request to the server. Please refresh and try again.' }
    }

    setAllianceProfiles((prev) => ({
      ...prev,
      [normalized]: profile,
    }))
    setUser((current) => {
      if (!current || normalizeEmail(current.email) !== normalized || !displayName) {
        return current
      }
      const updated = { ...current, name: displayName }
      localStorage.setItem('auth_user', JSON.stringify(updated))
      return updated
    })
    setRecentUsers((prev) =>
      upsertRecentUserRecord(prev, {
        email: normalized,
        name: displayName,
        picture: user.picture,
        acknowledged: false,
        firstName,
        lastName,
        teamNumber,
      })
    )
    setRequiresAllianceConfirmation(false)
    return { success: true, message: 'Alliance confirmation submitted.' }
  }, [syncRecentUserPayload, user])

  const removeAllianceProfile = useCallback((email: string) => {
    const normalized = normalizeEmail(email)
    setAllianceProfiles((prev) => {
      if (!prev[normalized]) return prev
      const next = { ...prev }
      delete next[normalized]
      return next
    })
  }, [])

  const clearAllianceProfileSubmission = useCallback((email: string) => {
    const normalized = normalizeEmail(email)
    setAllianceProfiles((prev) => resetVerificationState({
      email: normalized,
      roles: {},
      recentUsers: [],
      allianceProfiles: prev,
    }).allianceProfiles)
    setRecentUsers((prev) => resetVerificationState({
      email: normalized,
      roles: {},
      recentUsers: prev,
      allianceProfiles: {},
    }).recentUsers)
  }, [])

  // Resolves only once the server has the new role. The local change is
  // optimistic; on failure we re-fetch so the UI snaps back to the truth
  // instead of showing an approval that never reached the server.
  const setRole = useCallback(async (email: string, role: UserRole): Promise<RoleChangeResult> => {
    const normalized = normalizeEmail(email)
    if (!normalized) {
      return { success: false, message: 'Enter an email address.' }
    }

    if (ULTRA_ADMIN_EMAILS.includes(normalized) && role !== 'tech_lead') {
      return { success: false, message: 'This account is a configured technical lead and cannot be changed.' }
    }

    if (ADMIN_EMAILS.includes(normalized) && role !== 'lead' && role !== 'tech_lead') {
      return { success: false, message: 'This account is a configured lead and cannot be given a non-lead role.' }
    }

    const isAdminRole = (r: string | undefined) => r === 'lead' || r === 'tech_lead'
    if (isAdminRole(roleAssignments[normalized]) && !isAdminRole(role)) {
      const remainingAdmins = Object.values(roleAssignments).filter((value) => isAdminRole(value)).length
      if (remainingAdmins <= 1) {
        return { success: false, message: 'Add another lead before changing the last lead.' }
      }
    }

    setRoleAssignments((prev) => ensureAdminPresence({ ...prev, [normalized]: role }))
    setRecentUsers((prev) =>
      prev.map((record) =>
        record.email === normalized ? { ...record, acknowledged: role !== 'pending' } : record
      )
    )

    try {
      await apiPut(`/roles/${encodeURIComponent(normalized)}`, { role })
    } catch (error) {
      console.error('Failed to update role on API', error)
      await fetchRoleAssignmentsFromApi().catch(() => {})
      const status = typeof error === 'object' && error && 'status' in error ? (error as { status?: number }).status : undefined
      const message = status === 403
        ? 'You do not have permission to assign that role.'
        : error instanceof Error && error.message
          ? `Could not save to the server: ${error.message}`
          : 'Could not save to the server. Check your connection and try again.'
      return { success: false, message }
    }

    await Promise.all([
      fetchRoleAssignmentsFromApi().catch(() => {}),
      fetchRecentUsersFromApi().catch(() => {}),
    ])
    return { success: true }
  }, [ensureAdminPresence, fetchRecentUsersFromApi, fetchRoleAssignmentsFromApi, roleAssignments])

  const removeRole = useCallback((email: string) => {
    const normalized = normalizeEmail(email)
    
    // Prevent removing ultra admins
    if (ULTRA_ADMIN_EMAILS.includes(normalized)) {
      console.warn('Ultra admin cannot be removed from roles')
      return
    }
    
    if (ADMIN_EMAILS.includes(normalized)) {
      console.warn('Configured admin email cannot be removed from roles')
      return
    }
    
    setRoleAssignments((prev) => {
      if (!prev[normalized]) return prev
      const next = { ...prev }
      delete next[normalized]
      const hasAdmin = Object.values(next).some((role) => role === 'lead' || role === 'tech_lead')
      if (!hasAdmin) {
        console.warn('Cannot remove last admin role assignment')
        return prev
      }
      return ensureAdminPresence(next)
    })
    setRecentUsers((prev) =>
      prev.map((record) =>
        record.email === normalized
          ? {
              ...record,
              acknowledged: false,
            }
          : record
      )
    )
    void (async () => {
      try {
        await apiDelete(`/roles/${encodeURIComponent(normalized)}`)
        await fetchRoleAssignmentsFromApi()
      } catch (error) {
        console.error('Failed to delete role on API', error)
      }
    })()
  }, [ensureAdminPresence, fetchRoleAssignmentsFromApi])

  const resetVerification = useCallback((email: string) => {
    const normalized = normalizeEmail(email)
    const isAdminRole = (roleValue: string | undefined) => roleValue === 'lead' || roleValue === 'tech_lead'

    if (ULTRA_ADMIN_EMAILS.includes(normalized)) {
      console.warn('Ultra admin verification cannot be reset')
      return
    }

    if (ADMIN_EMAILS.includes(normalized)) {
      console.warn('Configured admin verification cannot be reset')
      return
    }

    if (isAdminRole(roleAssignments[normalized])) {
      const remainingAdmins = Object.entries(roleAssignments).filter(([emailKey, roleValue]) => {
        return emailKey !== normalized && isAdminRole(roleValue)
      }).length
      if (remainingAdmins < 1) {
        console.warn('Cannot reset the last admin role assignment')
        return
      }
    }

    setRoleAssignments((prev) => {
      return ensureAdminPresence(resetVerificationState({
        email: normalized,
        roles: prev,
        recentUsers: [],
        allianceProfiles: {},
      }).roles)
    })
    setRecentUsers((prev) => resetVerificationState({
      email: normalized,
      roles: {},
      recentUsers: prev,
      allianceProfiles: {},
    }).recentUsers)
    setAllianceProfiles((prev) => resetVerificationState({
      email: normalized,
      roles: {},
      recentUsers: [],
      allianceProfiles: prev,
    }).allianceProfiles)

    void (async () => {
      try {
        await apiDelete(`/roles/${encodeURIComponent(normalized)}`)
        await Promise.all([
          fetchRoleAssignmentsFromApi().catch((error) => {
            console.error('Failed to refresh roles after verification reset', error)
          }),
          fetchRecentUsersFromApi().catch((error) => {
            console.error('Failed to refresh recent users after verification reset', error)
          }),
        ])
      } catch (error) {
        console.error('Failed to reset verification on API', error)
      }
    })()
  }, [ensureAdminPresence, fetchRecentUsersFromApi, fetchRoleAssignmentsFromApi, roleAssignments])

  const acknowledgeRecentUser = useCallback(async (email: string): Promise<boolean> => {
    const normalized = normalizeEmail(email)
    if (!normalized) return false

    setRecentUsers((prev) =>
      prev.map((record) => (record.email === normalized ? { ...record, acknowledged: true } : record))
    )

    // Always send: the PATCH is idempotent, and deciding from inside a state
    // updater (as before) skipped it whenever React deferred the updater.
    try {
      await apiPatch(`/recent-users/${encodeURIComponent(normalized)}`, { acknowledged: true })
      return true
    } catch (error) {
      console.error('Failed to acknowledge recent user on API', error)
      await fetchRecentUsersFromApi().catch(() => {})
      return false
    }
  }, [fetchRecentUsersFromApi])

  const role = useMemo<UserRole>(() => {
    if (!user) return 'pending'
    const normalized = normalizeEmail(user.email)

    const assigned = roleAssignments[normalized]

    if (assigned === 'tech_lead' || ULTRA_ADMIN_EMAILS.includes(normalized)) {
      return 'tech_lead'
    }

    if (assigned === 'lead') {
      return 'lead'
    }

    if (assigned === 'pit_scout') {
      return 'pit_scout'
    }

    if (assigned === 'drive_team') {
      return 'drive_team'
    }

    if (assigned === 'scout_plus') {
      return 'scout_plus'
    }

    if (assigned === 'scout') {
      return 'scout'
    }

    if (assigned === 'scout_minus') {
      return 'scout_minus'
    }

    if (assigned === 'blocked') {
      return 'blocked'
    }

    if (assigned === 'pending') {
      return 'pending'
    }

    return resolveDefaultRole(normalized)
  }, [roleAssignments, user])

  const canAccessPath = useCallback((path: string) => {
    const raw = path?.split('?')[0]?.split('#')[0] || '/'
    const sanitized = raw.length > 1 ? raw.replace(/\/+$/, '') : raw
    const descriptor = routePermissions.find(({ pattern }) => pattern.test(sanitized))
    const requiredRole = descriptor?.minRole
    // null minRole means public route, accessible to everyone
    if (requiredRole === null) return true
    // If no route descriptor found, require lead access
    if (requiredRole === undefined) return roleRank[role] >= roleRank['lead']
    return roleRank[role] >= roleRank[requiredRole]
  }, [role])

  const isUltraAdmin = role === 'tech_lead'
  const isAdmin = roleRank[role] >= roleRank.lead
  const isLead = roleRank[role] >= roleRank.lead

  const canRescout = useMemo<boolean>(() => {
    if (!user) return false
    const normalized = normalizeEmail(user.email)
    if (normalized in rescouterPermissions) return rescouterPermissions[normalized]
    return RESCOUTER_DEFAULT_ROLES.includes(role)
  }, [user, role, rescouterPermissions])

  const setRescouter = useCallback(async (email: string, enabled: boolean) => {
    const normalized = normalizeEmail(email)
    await apiPut(`/rescout/permissions/${encodeURIComponent(normalized)}`, { enabled })
    setRescouterPermissions(prev => ({ ...prev, [normalized]: enabled }))
  }, [])

  useEffect(() => {
    if (!isLead) return
    if (!hasUsableAuthToken()) return
    void fetchRecentUsersFromApi().catch((error) => {
      console.error('Failed to refresh recent users for lead', error)
    })
  }, [isLead, fetchRecentUsersFromApi])

  useEffect(() => {
    const handleVisibility = () => {
      if (!hasUsableAuthToken()) return
      if (document.visibilityState === 'visible') {
        void fetchRoleAssignmentsFromApi().catch((error) => {
          console.error('Failed to refresh roles on visibility change', error)
        })
        if (isLead) {
          void fetchRecentUsersFromApi().catch((error) => {
            console.error('Failed to refresh recent users on visibility change', error)
          })
        }
      }
    }

    const handleFocus = () => {
      if (!hasUsableAuthToken()) return
      void fetchRoleAssignmentsFromApi().catch((error) => {
        console.error('Failed to refresh roles on window focus', error)
      })
      if (isLead) {
        void fetchRecentUsersFromApi().catch((error) => {
          console.error('Failed to refresh recent users on window focus', error)
        })
      }
    }

    const handleOnline = () => {
      if (!hasUsableAuthToken()) return
      void fetchRoleAssignmentsFromApi().catch((error) => {
        console.error('Failed to refresh roles when back online', error)
      })
      if (isLead) {
        void fetchRecentUsersFromApi().catch((error) => {
          console.error('Failed to refresh recent users when back online', error)
        })
      }
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchRoleAssignmentsFromApi, fetchRecentUsersFromApi, isLead])
  const canDelete = isAdmin
  const defaultRoute = DEFAULT_ROUTE_BY_ROLE[role]

  const allianceProfile = useMemo(() => {
    if (!user) return null
    const normalized = normalizeEmail(user.email)
    return allianceProfiles[normalized] || null
  }, [user, allianceProfiles])

  const isAllowedDomainUser = useMemo(() => {
    if (!user) return false
    return emailMatchesAllowedDomain(normalizeEmail(user.email))
  }, [user])

  useEffect(() => {
    if (user) {
      applyScoutProfile(user, role)
    }
  }, [user, role, applyScoutProfile])

  const value = useMemo<AuthContextValue>(() => ({
    user,
    role,
    defaultRoute,
    login,
    logout,
    ready,
    authorizationReady,
    roleAssignments,
    setRole,
    removeRole,
    resetVerification,
    canDelete,
    canAccessPath,
    isAdmin,
    isLead,
    isUltraAdmin,
    recentUsers,
    allianceProfile,
    allianceProfiles,
    submitAllianceProfile,
    removeAllianceProfile,
    clearAllianceProfileSubmission,
    requiresAllianceConfirmation,
    allowedAllianceDomain: PRIMARY_ALLIANCE_DOMAIN,
    allowedAllianceDomains: ALLOWED_EMAIL_DOMAINS,
    isAllowedDomainUser,
    acknowledgeRecentUser,
    refreshRoles: fetchRoleAssignmentsFromApi,
    refreshRecentUsers: fetchRecentUsersFromApi,
    canRescout,
    rescouterPermissions,
    setRescouter,
    renewSession,
  }), [
    user,
    role,
    defaultRoute,
    login,
    logout,
    ready,
    authorizationReady,
    roleAssignments,
    setRole,
    removeRole,
    resetVerification,
    canDelete,
    canAccessPath,
    isAdmin,
    isLead,
    isUltraAdmin,
    recentUsers,
    allianceProfile,
    allianceProfiles,
    submitAllianceProfile,
    removeAllianceProfile,
    clearAllianceProfileSubmission,
    requiresAllianceConfirmation,
    isAllowedDomainUser,
    acknowledgeRecentUser,
    fetchRoleAssignmentsFromApi,
    fetchRecentUsersFromApi,
    canRescout,
    rescouterPermissions,
    setRescouter,
    renewSession,
  ])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
