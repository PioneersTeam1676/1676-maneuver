import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { apiDelete, apiGet, apiPatch, apiPut } from '@/lib/apiClient'

type User = {
  name: string
  email: string
  picture?: string
  sub: string // Google subject (user id)
}

export type UserRole = 'pending' | 'scout' | 'lead' | 'form_maker' | 'admin' | 'ultra_admin'

type RoleAssignments = Record<string, UserRole>

type AllianceProfile = {
  email: string
  firstName: string
  lastName: string
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
}

const ROLE_STORAGE_KEY = 'auth_roles'
const RECENT_STORAGE_KEY = 'auth_recent_users'
const SCHEDULE_STORAGE_KEY = 'schedule_automation_state'
const OAUTH_STATE_PREFIX = 'auth_oauth_state:'
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const AUTH_ID_TOKEN_KEY = 'auth_id_token'
const ALLIANCE_PROFILE_STORAGE_KEY = 'auth_alliance_profiles'
const MAX_RECENT_USERS = 150

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

const VALID_ROLES: UserRole[] = ['pending', 'scout', 'lead', 'form_maker', 'admin', 'ultra_admin']

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
}

type GoogleIdTokenPayload = {
  email?: string
  name?: string
  picture?: string
  sub?: string
  nonce?: string
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

const generateOpaqueString = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('')
}

const roleRank: Record<UserRole, number> = {
  pending: 1,
  scout: 1,
  lead: 2,
  form_maker: 3,
  admin: 4,
  ultra_admin: 5,
}

const routePermissions: Array<{ pattern: RegExp; minRole: UserRole | null }> = [
  { pattern: /^\/$/, minRole: 'scout' }, // Home page for verified users only
  { pattern: /^\/game-start$/, minRole: 'scout' },
  { pattern: /^\/auto-start$/, minRole: 'scout' },
  { pattern: /^\/scout-form$/, minRole: 'scout' },
  { pattern: /^\/auto-scoring$/, minRole: 'scout' },
  { pattern: /^\/teleop-scoring$/, minRole: 'scout' },
  { pattern: /^\/endgame$/, minRole: 'scout' },
  { pattern: /^\/tos$/, minRole: null }, // Public terms of service
  { pattern: /^\/terms$/, minRole: null }, // Public terms of service
  { pattern: /^\/privacy$/, minRole: null }, // Public privacy policy
  { pattern: /^\/match-strategy$/, minRole: 'lead' },
  { pattern: /^\/team-stats$/, minRole: 'lead' },
  { pattern: /^\/pit-scouting$/, minRole: 'lead' },
  { pattern: /^\/pick-list$/, minRole: 'lead' },
  { pattern: /^\/strategy-overview$/, minRole: 'lead' },
  { pattern: /^\/pit-assignments$/, minRole: 'lead' },
  { pattern: /^\/verification-center$/, minRole: 'lead' },
  { pattern: /^\/match-data-qr$/, minRole: 'lead' },
  { pattern: /^\/schedule-automation$/, minRole: 'lead' },
  { pattern: /^\/achievements$/, minRole: 'lead' },
  { pattern: /^\/event-settings$/, minRole: 'lead' },
  { pattern: /^\/scout-management$/, minRole: 'admin' },
  { pattern: /^\/admin$/, minRole: 'ultra_admin' },
  { pattern: /^\/pi-panel$/, minRole: 'admin' },
  { pattern: /^\/form-maker/, minRole: 'form_maker' },
  { pattern: /^\/data-management$/, minRole: 'ultra_admin' },
  { pattern: /^\/clear-data$/, minRole: 'ultra_admin' },
  { pattern: /^\/json-transfer$/, minRole: 'admin' },
  { pattern: /^\/qr-data-transfer$/, minRole: 'admin' },
  { pattern: /^\/api-data$/, minRole: 'ultra_admin' },
  { pattern: /^\/dev-utilities$/, minRole: 'ultra_admin' },
  { pattern: /^\/user-management$/, minRole: 'ultra_admin' },
  { pattern: /^\/scout-activity$/, minRole: 'admin' },
  { pattern: /^\/alliance-onboarding$/, minRole: null }, // Accessible to anyone, including pending/unverified
  { pattern: /^\/auth\/google\/callback$/, minRole: null }, // Accessible to anyone for OAuth flow
]

const DEFAULT_ROUTE_BY_ROLE: Record<UserRole, string> = {
  ultra_admin: '/',
  admin: '/',
  form_maker: '/form-maker',
  lead: '/',
  scout: '/',
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
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignments>(() => {
    try {
      const raw = localStorage.getItem(ROLE_STORAGE_KEY)
      if (!raw) return {}
      const parsed = JSON.parse(raw) as RoleAssignments
      const validRoles = new Set<UserRole>(['pending', 'scout', 'lead', 'form_maker', 'admin', 'ultra_admin'])
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
          normalizedAssignments[ultraAdminEmail] = 'ultra_admin'
        }
      })
      ADMIN_EMAILS.forEach((adminEmail: string) => {
        if (adminEmail && !ULTRA_ADMIN_EMAILS.includes(adminEmail)) {
          normalizedAssignments[adminEmail] = 'admin'
        }
      })
      return normalizedAssignments
    } catch (error) {
      console.warn('Failed to parse stored role assignments', error)
      const fallback: RoleAssignments = {}
      ULTRA_ADMIN_EMAILS.forEach((ultraAdminEmail: string) => {
        if (ultraAdminEmail) {
          fallback[ultraAdminEmail] = 'ultra_admin'
        }
      })
      ADMIN_EMAILS.forEach((adminEmail: string) => {
        if (adminEmail && !ULTRA_ADMIN_EMAILS.includes(adminEmail)) {
          fallback[adminEmail] = 'admin'
        }
      })
      return fallback
    }
  })
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

  const storeOAuthState = useCallback((stateValue: string, nonce: string) => {
    const payload: StoredOAuthState = {
      nonce,
      createdAt: Date.now(),
    }
    localStorage.setItem(`${OAUTH_STATE_PREFIX}${stateValue}`, JSON.stringify(payload))
  }, [])

  const ensureAdminPresence = useCallback((assignments: RoleAssignments, candidateEmail?: string): RoleAssignments => {
    const next = { ...assignments }

    // Ensure ultra admins always have ultra_admin role
    ULTRA_ADMIN_EMAILS.forEach((ultraAdminEmail) => {
      if (ultraAdminEmail) {
        next[ultraAdminEmail] = 'ultra_admin'
      }
    })

    // Ensure regular admins have admin role (but not if they're ultra admins)
    ADMIN_EMAILS.forEach((adminEmail) => {
      if (adminEmail && !ULTRA_ADMIN_EMAILS.includes(adminEmail)) {
        next[adminEmail] = 'admin'
      }
    })

    const hasAdmin = Object.values(next).some((roleValue) => roleValue === 'admin' || roleValue === 'ultra_admin')
    if (!hasAdmin) {
      if (candidateEmail) {
        next[candidateEmail] = 'admin'
      } else if (user) {
        next[normalizeEmail(user.email)] = 'admin'
      }
    }

    return next
  }, [user])

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      console.warn('VITE_GOOGLE_CLIENT_ID not set; Google login disabled')
    }
    cleanupExpiredOAuthState()

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

        upsertRecentUser({
          email: normalized,
          name: parsed.name,
          picture: parsed.picture,
          acknowledged: true,
        })

        setRoleAssignments((prev) => {
          const next = { ...prev }
          let changed = false

          const assignRole = (email: string, role: UserRole) => {
            if (!email) return
            const key = normalizeEmail(email)
            if (next[key] !== role) {
              next[key] = role
              changed = true
            }
          }

          ADMIN_EMAILS.forEach((adminEmail) => assignRole(adminEmail, 'admin'))

          const existingRole = next[normalized]
          const isConfiguredAdmin = ADMIN_EMAILS.includes(normalized)

          if (!existingRole) {
            assignRole(normalized, isConfiguredAdmin ? 'admin' : 'scout')
          } else if (isConfiguredAdmin && existingRole !== 'admin') {
            next[normalized] = 'admin'
            changed = true
          }

          const hasAdmin = Object.values(next).some((roleValue) => roleValue === 'admin')
          if (!hasAdmin) {
            assignRole(normalized, 'admin')
          }

          return changed ? next : prev
        })
      } catch (error) {
        console.warn('Failed to restore saved user', error)
      }
    }

    setReady(true)
  }, [cleanupExpiredOAuthState])

  useEffect(() => {
    // Clean up any invalid roles from localStorage on mount
    const validRoles = new Set<UserRole>(['pending', 'scout', 'lead', 'admin', 'ultra_admin'])
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
          cleaned[ultraAdminEmail] = 'ultra_admin'
        }
      })
      ADMIN_EMAILS.forEach((adminEmail: string) => {
        if (adminEmail && !ULTRA_ADMIN_EMAILS.includes(adminEmail)) {
          cleaned[adminEmail] = 'admin'
        }
      })
      
      return cleaned
    })
  }, [])

  useEffect(() => {
    localStorage.setItem(ROLE_STORAGE_KEY, JSON.stringify(roleAssignments))
  }, [roleAssignments])

  const fetchRoleAssignmentsFromApi = useCallback(async () => {
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
        const merged = ensureAdminPresence({ ...prev, ...remoteAssignments })
        return areRoleAssignmentsEqual(prev, merged) ? prev : merged
      })
    } catch (error) {
      console.error('Failed to fetch role assignments from API', error)
      throw error
    }
  }, [ensureAdminPresence, user])

  const fetchRecentUsersFromApi = useCallback(async () => {
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

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        await fetchRoleAssignmentsFromApi()
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load roles from API', error)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [fetchRoleAssignmentsFromApi])

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
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentUsers))
  }, [recentUsers])

  useEffect(() => {
    localStorage.setItem(ALLIANCE_PROFILE_STORAGE_KEY, JSON.stringify(allianceProfiles))
  }, [allianceProfiles])

  const processOAuthResponse = useCallback((idToken: string, stateValue: string | undefined) => {
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
      const isAllowedDomainUser = emailMatchesAllowedDomain(normalizedEmail)
      const isConfiguredAdmin = ADMIN_EMAILS.includes(normalizedEmail)
      const existingProfile = allianceProfiles[normalizedEmail]

      const nextUser: User = {
        name: resolvedName,
        email: normalizedEmail,
        picture: payload.picture,
        sub: payload.sub || normalizedEmail,
      }

      setUser(nextUser)
      localStorage.setItem('auth_user', JSON.stringify(nextUser))
      localStorage.setItem(AUTH_ID_TOKEN_KEY, idToken)

      upsertRecentUser({
        email: normalizedEmail,
        name: resolvedName,
        picture: payload.picture,
        acknowledged: isAllowedDomainUser || isConfiguredAdmin,
      })

      setRoleAssignments((prev) => {
        const next = { ...prev }
        const existingRole = next[normalizedEmail]

        if (existingRole) {
          if (isConfiguredAdmin && existingRole !== 'admin') {
            next[normalizedEmail] = 'admin'
          }
        } else if (isConfiguredAdmin) {
          next[normalizedEmail] = 'admin'
        } else if (isAllowedDomainUser) {
          next[normalizedEmail] = 'scout'
        } else {
          next[normalizedEmail] = 'pending'
        }

        return ensureAdminPresence(next, normalizedEmail)
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

      if (!isConfiguredAdmin && !isAllowedDomainUser) {
        setRequiresAllianceConfirmation(!(existingProfile?.confirmedAlliance))
      } else {
        setRequiresAllianceConfirmation(false)
      }

      void fetchRoleAssignmentsFromApi().catch((error) => {
        console.error('Failed to refresh roles after login', error)
      })

      return { success: true as const, message: `Signed in as ${resolvedName}` }
    } catch (error) {
      console.error('Failed to process OAuth response', error)
      return { success: false as const, message: error instanceof Error ? error.message : 'Unknown OAuth error.' }
    }
  }, [allianceProfiles, consumeOAuthState, ensureAdminPresence, fetchRoleAssignmentsFromApi, setAllianceProfiles, setRecentUsers, setRoleAssignments])

  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data
      if (!data || typeof data !== 'object') return
      if (data.type !== 'google-oauth-token') return

      const { idToken, state } = data as { idToken?: string; state?: string }
      const result = processOAuthResponse(idToken || '', state)
      try {
        if (event.source && 'postMessage' in event.source) {
          ;(event.source as Window).postMessage(
            {
              type: 'google-auth-complete',
              success: result.success,
              message: result.message,
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
  }, [processOAuthResponse])

  useEffect(() => {
    if (!user) {
      setRequiresAllianceConfirmation(false)
      return
    }
    const normalized = normalizeEmail(user.email)
    if (ADMIN_EMAILS.includes(normalized)) {
      setRequiresAllianceConfirmation(false)
      return
    }
    if (emailMatchesAllowedDomain(normalized)) {
      setRequiresAllianceConfirmation(false)
      return
    }
    const profile = allianceProfiles[normalized]
    setRequiresAllianceConfirmation(!(profile?.confirmedAlliance))
  }, [user, allianceProfiles])

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

    if (currentRole === 'admin' || currentRole === 'lead' || currentRole === 'ultra_admin') {
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

  useEffect(() => {
    if (!user) return
    void fetchRoleAssignmentsFromApi().catch((error) => {
      console.error('Failed to refresh roles after user change', error)
    })
  }, [user, fetchRoleAssignmentsFromApi])


  const login = useCallback(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      console.warn('Cannot start Google login without VITE_GOOGLE_CLIENT_ID')
      return
    }

    const configuredRedirect = import.meta.env.VITE_GOOGLE_REDIRECT_URI
    const currentOrigin = window.location.origin
    let redirectUri = `${currentOrigin}/auth/google/callback`

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
    storeOAuthState(stateValue, nonce)

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'id_token',
      scope: 'openid email profile',
      prompt: 'consent select_account',
      state: stateValue,
      nonce,
    })

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    window.location.assign(authUrl)
  }, [storeOAuthState])

  const logout = useCallback(() => {
    setUser(null)
    localStorage.removeItem('auth_user')
    localStorage.removeItem(AUTH_ID_TOKEN_KEY)
    setRequiresAllianceConfirmation(false)
  }, [])

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
    if (ULTRA_ADMIN_EMAILS.includes(normalized) && role !== 'ultra_admin') {
      console.warn('Ultra admin email cannot be assigned a different role')
      return
    }
    
    if (ADMIN_EMAILS.includes(normalized) && role !== 'admin' && role !== 'ultra_admin') {
      console.warn('Configured admin email cannot be assigned a non-admin role')
      return
    }
    
    setRoleAssignments((prev) => {
      const currentRole = prev[normalized]
      const isAdminRole = (r: string) => r === 'admin' || r === 'ultra_admin'
      
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
      const ensured = ensureAdminPresence(next, normalized)
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
      const hasAdmin = Object.values(next).some((role) => role === 'admin' || role === 'ultra_admin')
      if (!hasAdmin) {
        console.warn('Cannot remove last admin role assignment')
        return prev
      }
      return ensureAdminPresence(next)
    })
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

    if (assigned === 'ultra_admin' || ULTRA_ADMIN_EMAILS.includes(normalized)) {
      return 'ultra_admin'
    }

    if (assigned === 'admin') {
      return 'admin'
    }

    if (assigned === 'form_maker') {
      return 'form_maker'
    }

    if (assigned === 'lead') {
      return 'lead'
    }

    if (assigned === 'scout') {
      return 'scout'
    }

    if (assigned === 'pending') {
      return emailMatchesAllowedDomain(normalized) ? 'scout' : 'pending'
    }

    if (ADMIN_EMAILS.includes(normalized)) {
      return 'admin'
    }

    return emailMatchesAllowedDomain(normalized) ? 'scout' : 'pending'
  }, [roleAssignments, user])

  const canAccessPath = useCallback((path: string) => {
    const raw = path?.split('?')[0]?.split('#')[0] || '/'
    const sanitized = raw.length > 1 ? raw.replace(/\/+$/, '') : raw
    const descriptor = routePermissions.find(({ pattern }) => pattern.test(sanitized))
    const requiredRole = descriptor?.minRole
    // null minRole means public route, accessible to everyone
    if (requiredRole === null) return true
    // If no route descriptor found, require admin access
    if (requiredRole === undefined) return roleRank[role] >= roleRank['admin']
    return roleRank[role] >= roleRank[requiredRole]
  }, [role])

  const isUltraAdmin = role === 'ultra_admin'
  const isAdmin = roleRank[role] >= roleRank.admin
  const isLead = roleRank[role] >= roleRank.lead

  useEffect(() => {
    if (!isLead) return
    void fetchRecentUsersFromApi().catch((error) => {
      console.error('Failed to refresh recent users for lead', error)
    })
  }, [isLead, fetchRecentUsersFromApi])

  useEffect(() => {
    const handleVisibility = () => {
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
  }), [
    user,
    role,
    defaultRoute,
    login,
    logout,
    ready,
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
  ])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
