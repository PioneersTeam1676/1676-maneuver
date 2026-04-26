import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { API_AUTH_FAILURE_EVENT, apiDelete, apiGet, apiPatch, apiPost, apiPut, hasUsableAuthToken } from '@/lib/apiClient'

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
}

type RecentUserApiRecord = Partial<RecentUserRecord> & {
  first_seen_at?: string
  last_seen_at?: string
  display_name?: string
  photo_url?: string
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
  setRole: (email: string, role: UserRole) => void
  removeRole: (email: string) => void
  canDelete: boolean
  canAccessPath: (path: string) => boolean
  isAdmin: boolean
  isLead: boolean
  isUltraAdmin: boolean
  recentUsers: RecentUserRecord[]
  allianceProfile: AllianceProfile | null
  allianceProfiles: Record<string, AllianceProfile>
  submitAllianceProfile: (input: AllianceProfileInput) => { success: boolean; message?: string }
  removeAllianceProfile: (email: string) => void
  requiresAllianceConfirmation: boolean
  allowedAllianceDomain: string
  allowedAllianceDomains: string[]
  isAllowedDomainUser: boolean
  acknowledgeRecentUser: (email: string) => void
  refreshRoles: () => Promise<void>
  refreshRecentUsers: () => Promise<void>
  canRescout: boolean
  rescouterPermissions: Record<string, boolean>
  setRescouter: (email: string, enabled: boolean) => Promise<void>
}

const ROLE_STORAGE_KEY = 'auth_roles'
const RECENT_STORAGE_KEY = 'auth_recent_users'
const SCHEDULE_STORAGE_KEY = 'schedule_automation_state'
const OAUTH_STATE_PREFIX = 'auth_oauth_state:'
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const AUTH_ID_TOKEN_KEY = 'auth_id_token'
const ALLIANCE_PROFILE_STORAGE_KEY = 'auth_alliance_profiles'
const MAX_RECENT_USERS = 150
const AUTH_CALLBACK_PATH = '/auth/google/callback'
const AUTH_TOKEN_EXPIRY_SKEW_MS = 60_000

const normalizeEmail = (email: string) => email.trim().toLowerCase()

const parseAllowedDomains = () => {
  const domainsEnv = (import.meta.env.VITE_ALLOWED_EMAIL_DOMAINS || import.meta.env.VITE_ALLOWED_EMAIL_DOMAIN || 'pascack.org') as string
  return domainsEnv
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)
}

const ALLOWED_EMAIL_DOMAINS = parseAllowedDomains()
const PRIMARY_ALLIANCE_DOMAIN = ALLOWED_EMAIL_DOMAINS[0] || ''

const emailMatchesAllowedDomain = (email: string) =>
  ALLOWED_EMAIL_DOMAINS.some((domain) => email.endsWith(`@${domain}`))

const isAutoApprovedEmail = (email: string) => {
  const normalized = normalizeEmail(email)
  return emailMatchesAllowedDomain(normalized) || ADMIN_EMAILS.includes(normalized) || ULTRA_ADMIN_EMAILS.includes(normalized)
}

const resolveDefaultRole = (email: string): UserRole => {
  const normalized = normalizeEmail(email)
  if (ULTRA_ADMIN_EMAILS.includes(normalized)) return 'tech_lead'
  if (ADMIN_EMAILS.includes(normalized)) return 'lead'
  return 'pending'
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

const removeCachedRoleForUser = (assignments: RoleAssignments, email: string): RoleAssignments => {
  const normalized = normalizeEmail(email)
  if (!normalized || ULTRA_ADMIN_EMAILS.includes(normalized) || ADMIN_EMAILS.includes(normalized)) {
    return assignments
  }
  if (!(normalized in assignments)) {
    return assignments
  }
  const next = { ...assignments }
  delete next[normalized]
  return next
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

const upsertRecentUserRecord = (
  existing: RecentUserRecord[],
  payload: { email: string; name?: string | null; picture?: string | null; acknowledged?: boolean }
): RecentUserRecord[] => {
  const email = normalizeEmail(payload.email)
  if (!email) return existing

  const timestamp = new Date().toISOString()
  const index = existing.findIndex((item) => item.email === email)

  if (index >= 0) {
    const updated = [...existing]
    const current = updated[index]
    updated[index] = {
      ...current,
      lastSeenAt: timestamp,
      displayName: payload.name?.trim() || current.displayName,
      photoUrl: payload.picture || current.photoUrl,
      acknowledged: payload.acknowledged ?? current.acknowledged,
    }
    return updated.sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
  }

  const nextRecord: RecentUserRecord = {
    email,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
    acknowledged: payload.acknowledged ?? false,
    displayName: payload.name?.trim() || undefined,
    photoUrl: payload.picture || undefined,
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

const readStoredIdToken = (): string | null => {
  if (typeof window === 'undefined') return null
  const stored = localStorage.getItem(AUTH_ID_TOKEN_KEY)
  const trimmed = stored?.trim()
  return trimmed || null
}

const isIdTokenFresh = (token: string | null, minRemainingMs = AUTH_TOKEN_EXPIRY_SKEW_MS): boolean => {
  if (!token) return false
  try {
    const payload = decodeIdToken(token)
    if (typeof payload.exp !== 'number') {
      return true
    }
    return payload.exp * 1000 > Date.now() + minRemainingMs
  } catch {
    return false
  }
}

const readCurrentAppPath = () => {
  if (typeof window === 'undefined') return '/'
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
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
  }) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      console.warn('Cannot start Google login without VITE_GOOGLE_CLIENT_ID')
      return false
    }

    const configuredRedirect = import.meta.env.VITE_GOOGLE_REDIRECT_URI
    const currentOrigin = window.location.origin
    let redirectUri = `${currentOrigin}${AUTH_CALLBACK_PATH}`

    if (configuredRedirect) {
      try {
        const parsed = new URL(configuredRedirect)
        if (parsed.origin === currentOrigin) {
          redirectUri = parsed.toString()
        } else {
          console.warn(
            `Configured Google redirect (${parsed.origin}) does not match current origin (${currentOrigin}); using current origin callback instead. ` +
            `Add ${redirectUri} to the OAuth client in Google Cloud to avoid this fallback.`,
          )
        }
      } catch (error) {
        console.warn('Invalid VITE_GOOGLE_REDIRECT_URI; falling back to current origin callback.', error)
      }
    }

    const stateValue = generateOpaqueString()
    const nonce = generateOpaqueString()
    storeOAuthState(stateValue, nonce, {
      returnTo: options?.returnTo || readCurrentAppPath(),
      mode: options?.mode || 'interactive',
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
    if (options?.replace) {
      window.location.replace(authUrl)
    } else {
      window.location.assign(authUrl)
    }
    return true
  }, [storeOAuthState])

  const attemptSilentReauth = useCallback((loginHint?: string | null) => {
    if (typeof window === 'undefined') return false
    if (window.location.pathname === AUTH_CALLBACK_PATH) return false
    if (silentRefreshStartedRef.current) return false

    const normalizedHint = loginHint ? normalizeEmail(loginHint) : undefined
    const started = startGoogleAuth({
      prompt: 'none',
      mode: 'silent',
      returnTo: readCurrentAppPath(),
      loginHint: normalizedHint,
      replace: true,
    })

    if (started) {
      silentRefreshStartedRef.current = true
    }

    return started
  }, [startGoogleAuth])

  const syncRecentUserRecord = useCallback(async (record: RecentUserRecord) => {
    try {
      await apiPut(`/recent-users/${encodeURIComponent(record.email)}`, {
        email: record.email,
        firstSeenAt: record.firstSeenAt,
        lastSeenAt: record.lastSeenAt,
        acknowledged: Boolean(record.acknowledged),
        displayName: record.displayName || undefined,
        photoUrl: record.photoUrl || undefined,
      })
    } catch (error) {
      console.error("Failed to sync recent user record", error)
    }
  }, [])

  const upsertRecentUser = useCallback(
    (payload: { email: string; name?: string | null; picture?: string | null; acknowledged?: boolean }) => {
      const normalizedEmail = normalizeEmail(payload.email)
      if (!normalizedEmail) return

      let syncedRecord: RecentUserRecord | null = null

      setRecentUsers((prev) => {
        const next = upsertRecentUserRecord(prev, {
          email: normalizedEmail,
          name: payload.name,
          picture: payload.picture,
          acknowledged: payload.acknowledged,
        })
        syncedRecord = next.find((record) => record.email === normalizedEmail) ?? null
        return next
      })

      if (syncedRecord) {
        void syncRecentUserRecord(syncedRecord)
      }
    },
    [syncRecentUserRecord]
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
        const storedToken = readStoredIdToken()

        if (!isIdTokenFresh(storedToken)) {
          if (!attemptSilentReauth(normalized)) {
            clearStoredAuthSession()
            setReady(true)
          }
          return
        }

        setUser((current) => {
          if (current && normalizeEmail(current.email) === normalized) {
            return current
          }
          return parsed
        })

        setRoleAssignments((prev) => {
          const next = ensureAdminPresence(removeCachedRoleForUser(prev, normalized))
          return areRoleAssignmentsEqual(prev, next) ? prev : next
        })

        upsertRecentUser({
          email: normalized,
          name: parsed.name,
          picture: parsed.picture,
          acknowledged: isAutoApprovedEmail(normalized),
        })

        // Covers the "returning user" path where processOAuthResponse is never called.
        // Safe: the endpoint is a no-op when they already have a non-pending role.
        void apiPost('/recent-users/self-register-role', {}).catch(() => {
          // Silent refresh listener handles token expiry/re-auth.
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
  }, [attemptSilentReauth, cleanupExpiredOAuthState, clearStoredAuthSession, ensureAdminPresence, upsertRecentUser])

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
    try {
      const response = await apiGet<{ roleAssignments?: Record<string, string> }>('/roles')

      const remoteAssignments = Object.entries(response.roleAssignments || {}).reduce<RoleAssignments>((acc, [email, roleValue]) => {
        const normalizedEmail = normalizeEmail(email)
        if (!normalizedEmail || !isUserRole(roleValue)) {
          return acc
        }
        acc[normalizedEmail] = roleValue
        return acc
      }, {})

      setRoleAssignments((prev) => {
        const next = ensureAdminPresence(remoteAssignments)
        return areRoleAssignmentsEqual(prev, next) ? prev : next
      })
    } catch (error) {
      const status = typeof error === 'object' && error && 'status' in error ? (error as { status?: number }).status : undefined
      if ((status === 401 || status === 403) && user?.email) {
        const normalizedCurrentEmail = normalizeEmail(user.email)
        try {
          const response = await apiPost<{ email: string; role: UserRole }>('/recent-users/self-register-role', {})
          const normalizedEmail = normalizeEmail(response.email || user.email)
          const nextRole = isUserRole(response.role) ? response.role : resolveDefaultRole(normalizedEmail)

          setRoleAssignments((prev) => {
            const next: RoleAssignments = {
              ...prev,
              [normalizedEmail]: nextRole,
            }
            return areRoleAssignmentsEqual(prev, next) ? prev : next
          })
          return
        } catch (fallbackError) {
          setRoleAssignments((prev) => {
            const withoutStaleRole = removeCachedRoleForUser(prev, normalizedCurrentEmail)
            const next = ensureAdminPresence({
              ...withoutStaleRole,
              [normalizedCurrentEmail]: resolveDefaultRole(normalizedCurrentEmail),
            })
            return areRoleAssignmentsEqual(prev, next) ? prev : next
          })
          console.error('Failed to fetch current user role from fallback endpoint', fallbackError)
        }
      }
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
            (current.photoUrl || "") === (record.photoUrl || "")
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

    setAuthorizationReady(false)
    let cancelled = false

    const run = async () => {
      try {
        await fetchRoleAssignmentsFromApi()
        void fetchRescouterPermissions()
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load roles from API', error)
        }
      } finally {
        if (!cancelled) {
          setAuthorizationReady(true)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [ready, user, fetchRoleAssignmentsFromApi, fetchRescouterPermissions])

  useEffect(() => {
    if (!ready || !user?.email) return
    upsertRecentUser({
      email: user.email,
      name: user.name,
      picture: user.picture,
      acknowledged: isAutoApprovedEmail(user.email),
    })
  }, [ready, user, upsertRecentUser])

  useEffect(() => {
    if (!ready || !user?.email) return

    let cancelled = false

    const ensureBackendUser = async () => {
      if (!hasUsableAuthToken()) {
        return
      }
      try {
        await apiPost('/recent-users/self-register-role', {})
        if (!cancelled) {
          await fetchRoleAssignmentsFromApi()
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to ensure backend scout role on app open', error)
        }
      }
    }

    void ensureBackendUser()

    return () => {
      cancelled = true
    }
  }, [ready, user, fetchRoleAssignmentsFromApi])

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
      const resolvedName = payload.name?.trim() || payload.email
      const existingProfile = allianceProfiles[normalizedEmail]

      const nextUser: User = {
        name: resolvedName,
        email: normalizedEmail,
        picture: payload.picture,
        sub: payload.sub || normalizedEmail,
      }

      silentRefreshStartedRef.current = false
      setUser(nextUser)
      localStorage.setItem('auth_user', JSON.stringify(nextUser))
      localStorage.setItem(AUTH_ID_TOKEN_KEY, idToken)

      setRoleAssignments((prev) => {
        const next = ensureAdminPresence(removeCachedRoleForUser(prev, normalizedEmail))
        return areRoleAssignmentsEqual(prev, next) ? prev : next
      })

      upsertRecentUser({
        email: normalizedEmail,
        name: resolvedName,
        picture: payload.picture,
        acknowledged: isAutoApprovedEmail(normalizedEmail),
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
        if (mode === 'silent') {
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
  }, [clearStoredAuthSession, consumeOAuthState, processOAuthResponse])

  useEffect(() => {
    const handleApiAuthFailure = () => {
      if (window.location.pathname === AUTH_CALLBACK_PATH) return

      const saved = localStorage.getItem('auth_user')
      const currentEmail = user?.email || (saved ? (() => {
        try {
          const parsed = JSON.parse(saved) as User
          return parsed.email
        } catch {
          return null
        }
      })() : null)

      if (!currentEmail) return
      if (isIdTokenFresh(readStoredIdToken())) return

      if (!attemptSilentReauth(currentEmail)) {
        clearStoredAuthSession()
      }
    }

    window.addEventListener(API_AUTH_FAILURE_EVENT, handleApiAuthFailure as EventListener)
    return () => {
      window.removeEventListener(API_AUTH_FAILURE_EVENT, handleApiAuthFailure as EventListener)
    }
  }, [attemptSilentReauth, clearStoredAuthSession, user])

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

  const submitAllianceProfile = useCallback((input: AllianceProfileInput) => {
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
    const profile: AllianceProfile = {
      email: normalized,
      firstName,
      lastName,
      displayName: `${firstName} ${lastName}`.trim() || undefined,
      teamNumber,
      confirmedAlliance: true,
      submittedAt: timestamp,
      lastSeenAt: timestamp,
    }

    setAllianceProfiles((prev) => ({
      ...prev,
      [normalized]: profile,
    }))
    setRequiresAllianceConfirmation(false)
    return { success: true, message: 'Alliance confirmation submitted.' }
  }, [user])

  const removeAllianceProfile = useCallback((email: string) => {
    const normalized = normalizeEmail(email)
    setAllianceProfiles((prev) => {
      if (!prev[normalized]) return prev
      const next = { ...prev }
      delete next[normalized]
      return next
    })
  }, [])

  const setRole = useCallback((email: string, role: UserRole) => {
    const normalized = normalizeEmail(email)
    
    // Prevent changing ultra admin emails
    if (ULTRA_ADMIN_EMAILS.includes(normalized) && role !== 'tech_lead') {
      console.warn('Ultra admin email cannot be assigned a different role')
      return
    }
    
    if (ADMIN_EMAILS.includes(normalized) && role !== 'lead' && role !== 'tech_lead') {
      console.warn('Configured admin email cannot be assigned a non-lead role')
      return
    }
    
    setRoleAssignments((prev) => {
      const currentRole = prev[normalized]
      const isAdminRole = (r: string) => r === 'lead' || r === 'tech_lead'

      if (isAdminRole(currentRole) && !isAdminRole(role)) {
        const remainingAdmins = Object.values(prev).filter((value) => isAdminRole(value)).length
        if (remainingAdmins <= 1) {
          console.warn('Cannot demote the last admin role assignment')
          return prev
        }
      }
      const next = { ...prev }
      if (role === 'pending') {
        delete next[normalized]
      } else {
        next[normalized] = role
      }
      const ensured = ensureAdminPresence(next)
      return ensured
    })
    upsertRecentUser({
      email: normalized,
      acknowledged: true,
    })
    void (async () => {
      try {
        if (role === 'pending') {
          await apiDelete(`/roles/${encodeURIComponent(normalized)}`)
        } else {
          await apiPut(`/roles/${encodeURIComponent(normalized)}`, { role })
        }
        await fetchRoleAssignmentsFromApi()
      } catch (error) {
        console.error('Failed to update role on API', error)
      }
    })()
  }, [ensureAdminPresence, upsertRecentUser, fetchRoleAssignmentsFromApi])

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

  const acknowledgeRecentUser = useCallback((email: string) => {
    const normalized = normalizeEmail(email)
    if (!normalized) return

    let shouldSync = false

    setRecentUsers((prev) => {
      let found = false
      const updated = prev.map((record) => {
        if (record.email !== normalized) {
          return record
        }
        found = true
        if (record.acknowledged) {
          return record
        }
        shouldSync = true
        return {
          ...record,
          acknowledged: true,
        }
      })

      if (!found || !shouldSync) {
        return prev
      }

      return updated
    })

    if (shouldSync) {
      void (async () => {
        try {
          await apiPatch(`/recent-users/${encodeURIComponent(normalized)}`, { acknowledged: true })
        } catch (error) {
          console.error('Failed to acknowledge recent user on API', error)
        }
      })()
    }
  }, [])

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
    requiresAllianceConfirmation,
    isAllowedDomainUser,
    acknowledgeRecentUser,
    fetchRoleAssignmentsFromApi,
    fetchRecentUsersFromApi,
    canRescout,
    rescouterPermissions,
    setRescouter,
  ])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
