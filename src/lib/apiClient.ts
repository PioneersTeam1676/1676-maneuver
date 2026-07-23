const normalizeBaseUrl = (value: string | undefined | null): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.replace(/\/+$/, '')
}

const resolveBaseUrlCandidates = (): string[] => {
  const candidates: string[] = []

  const configuredRaw = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
  configuredRaw
    .split(',')
    .map((segment) => normalizeBaseUrl(segment))
    .filter((segment): segment is string => Boolean(segment))
    .forEach((segment) => {
      if (!candidates.includes(segment)) {
        candidates.push(segment)
      }
    })

  if (typeof window !== 'undefined') {
    const { protocol, hostname, port } = window.location
    const currentPort = port ? `:${port}` : ''
    const sameOriginApi = normalizeBaseUrl(`${protocol}//${hostname}${currentPort}/api`)
    const sameOriginScouting = normalizeBaseUrl(`${protocol}//${hostname}${currentPort}/scouting`)
    if (sameOriginApi && !candidates.includes(sameOriginApi)) {
      candidates.push(sameOriginApi)
    }
    if (sameOriginScouting && !candidates.includes(sameOriginScouting)) {
      candidates.push(sameOriginScouting)
    }
  }

  const localApi = normalizeBaseUrl('http://localhost:4000/api')
  const loopbackApi = normalizeBaseUrl('http://127.0.0.1:4000/api')
  if (localApi && !candidates.includes(localApi)) {
    candidates.push(localApi)
  }
  if (loopbackApi && !candidates.includes(loopbackApi)) {
    candidates.push(loopbackApi)
  }

  if (candidates.length === 0) {
    candidates.push('http://localhost:4000/api')
  }

  return candidates
}

const BASE_URL_CANDIDATES = resolveBaseUrlCandidates()
let activeBaseIndex = 0
const reportedFailures = new Set<string>()
const API_AUTH_FAILURE_EVENT = "api-auth-failure"
const AUTH_REFRESHED_EVENT = "auth-session-refreshed"
let lastAuthFailureEventAt = 0

// localStorage keys for the backend-issued session. The app exchanges the
// short-lived Google id_token for these once after login (POST /auth/session):
// - access token: app JWT, ~5 day expiry, sent as the bearer token
// - refresh token: opaque, ~60 day expiry, used to mint new access tokens
//   without any Google round-trip (works on venue WiFi with no internet)
const SESSION_ACCESS_TOKEN_KEY = "auth_session_token"
const SESSION_REFRESH_TOKEN_KEY = "auth_refresh_token"
const GOOGLE_ID_TOKEN_KEY = "auth_id_token"

// Refresh the access token in the background once it's within a day of
// expiring. Generous window: a device that only reaches the server a few
// times a day still renews long before the 5-day expiry.
const SESSION_REFRESH_WINDOW_MS = 24 * 60 * 60 * 1000

type JwtPayload = {
  exp?: number
}

const FETCH_TIMEOUT_MS = 8_000

export type ApiRequestInit = RequestInit & { timeoutMs?: number }

const fetchWithFallback = async (path: string, init: ApiRequestInit): Promise<Response> => {
  let lastError: unknown
  const { timeoutMs, ...fetchInit } = init
  const effectiveTimeout = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : FETCH_TIMEOUT_MS

  for (let offset = 0; offset < BASE_URL_CANDIDATES.length; offset += 1) {
    const index = (activeBaseIndex + offset) % BASE_URL_CANDIDATES.length
    const base = BASE_URL_CANDIDATES[index]
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout)
    try {
      const response = await fetch(`${base}${path}`, { ...fetchInit, signal: controller.signal })
      clearTimeout(timeoutId)
      activeBaseIndex = index
      return response
    } catch (error) {
      clearTimeout(timeoutId)
      lastError = error
      if (error instanceof TypeError) {
        if (!reportedFailures.has(base)) {
          console.warn(`[apiClient] Failed to reach ${base}: ${error.message}. Trying next fallback…`)
          reportedFailures.add(base)
        }
        continue
      }
      // AbortError (timeout) or any other error — don't try remaining candidates
      throw error
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }
  throw new Error('Failed to fetch API from every configured base URL')
}

export const getCurrentApiBaseUrl = (): string => BASE_URL_CANDIDATES[activeBaseIndex] ?? BASE_URL_CANDIDATES[0]

const defaultHeaders = {
  "Content-Type": "application/json",
}

const decodeJwtPayload = (token: string): JwtPayload | null => {
  try {
    const parts = token.split(".")
    if (parts.length < 2) return null
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    const json = atob(padded)
    return JSON.parse(json) as JwtPayload
  } catch {
    return null
  }
}

const isJwtFresh = (token: string, minRemainingMs = 0): boolean => {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload.exp !== "number") {
    return true
  }
  return payload.exp * 1000 > Date.now() + minRemainingMs
}

const readStoredToken = (key: string): string | null => {
  if (typeof window === "undefined") return null
  const value = window.localStorage?.getItem(key)
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

// IMPORTANT: this must never DELETE tokens. An earlier version removed the
// token from localStorage the moment it looked expired — including while
// offline, when there was no way to get a new one — which silently killed
// sessions mid-competition. The server is the sole authority on token
// validity: we always send what we have and react to real 401 responses.
const resolveAuthToken = (): string | null => {
  // Preferred: backend-issued session token (long-lived, refreshable).
  const sessionToken = readStoredToken(SESSION_ACCESS_TOKEN_KEY)
  if (sessionToken) return sessionToken
  // Fallback: raw Google id_token from a login where the session exchange
  // hasn't completed yet (or an old app version).
  const idToken = readStoredToken(GOOGLE_ID_TOKEN_KEY)
  if (idToken) return idToken
  const stored = readStoredToken("api_auth_token")
  if (stored) return stored
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_AUTH_TOKEN) {
    const token = String(import.meta.env.VITE_API_AUTH_TOKEN).trim()
    if (token) return token
  }
  return null
}

export const hasUsableAuthToken = (): boolean => Boolean(resolveAuthToken())

const withAuthHeaders = (initHeaders?: HeadersInit): HeadersInit => {
  const token = resolveAuthToken()
  if (!token) return initHeaders ?? {}
  if (initHeaders instanceof Headers) {
    const next = new Headers(initHeaders)
    if (!next.has("Authorization")) {
      next.set("Authorization", `Bearer ${token}`)
    }
    if (!next.has("X-API-Key")) {
      next.set("X-API-Key", token)
    }
    return next
  }
  if (Array.isArray(initHeaders)) {
    const existing = new Set(initHeaders.map(([key]) => key.toLowerCase()))
    const next = [...initHeaders]
    if (!existing.has("authorization")) {
      next.push(["Authorization", `Bearer ${token}`])
    }
    if (!existing.has("x-api-key")) {
      next.push(["X-API-Key", token])
    }
    return next
  }
  const existing = Object.fromEntries(Object.entries(initHeaders ?? {}).map(([key, value]) => [key.toLowerCase(), value]))
  return {
    ...initHeaders,
    ...(existing.authorization ? {} : { Authorization: `Bearer ${token}` }),
    ...(existing["x-api-key"] ? {} : { "X-API-Key": token }),
  }
}

class ApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type")
  const isJson = contentType && contentType.includes("application/json")
  const body = isJson ? await response.json() : await response.text()
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      // Try a silent refresh first — if it succeeds it dispatches
      // AUTH_REFRESHED_EVENT, which re-triggers all the sync paths in
      // App.tsx. Only surface the failure banner if refresh can't help.
      void refreshBackendSession()
      const now = Date.now()
      if (now - lastAuthFailureEventAt > 1500) {
        lastAuthFailureEventAt = now
        window.dispatchEvent(new CustomEvent(API_AUTH_FAILURE_EVENT, { detail: { status: 401 } }))
      }
    }
    const message = isJson && body?.error ? body.error : `Request failed with ${response.status}`
    throw new ApiError(message, response.status)
  }
  return body as T
}

type SessionResponse = {
  accessToken?: string
  accessTokenExpiresAt?: number
  refreshToken?: string
  refreshTokenExpiresAt?: number
}

const dispatchAuthRefreshed = (): void => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(AUTH_REFRESHED_EVENT))
  }
}

// Auth endpoints use this instead of apiPost so a 401 here can't recursively
// re-trigger refreshBackendSession via the handleResponse hook above.
const authEndpointPost = async (path: string, body: unknown): Promise<SessionResponse | null> => {
  const response = await fetchWithFallback(path, {
    method: "POST",
    headers: defaultHeaders,
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const status = response.status
    // 401/403 mean the credential itself is bad — caller should discard it.
    throw new ApiError(`Auth request failed with ${status}`, status)
  }
  return (await response.json()) as SessionResponse
}

// Exchange a Google id_token for a backend session. Called once after each
// Google login. Failure is non-fatal: the raw id_token keeps working for
// about an hour, and maybeRefreshBackendSession() retries the exchange.
export const establishBackendSession = async (idToken: string): Promise<boolean> => {
  if (typeof window === "undefined") return false
  try {
    const session = await authEndpointPost("/auth/session", { idToken })
    if (!session?.accessToken || !session.refreshToken) return false
    window.localStorage?.setItem(SESSION_ACCESS_TOKEN_KEY, session.accessToken)
    window.localStorage?.setItem(SESSION_REFRESH_TOKEN_KEY, session.refreshToken)
    dispatchAuthRefreshed()
    return true
  } catch (error) {
    console.warn("[apiClient] Failed to establish backend session", error)
    return false
  }
}

let refreshSessionPromise: Promise<boolean> | null = null

// Trade the stored refresh token for a new access token. De-duped so an
// interval tick, a focus event, and a 401 handler firing together produce a
// single request. Network errors leave the stored tokens untouched (they may
// still be fine — we might just be offline); only a definitive 401/403 from
// the server clears them.
export const refreshBackendSession = (): Promise<boolean> => {
  if (typeof window === "undefined") return Promise.resolve(false)
  if (refreshSessionPromise) return refreshSessionPromise

  const refreshToken = readStoredToken(SESSION_REFRESH_TOKEN_KEY)
  if (!refreshToken) {
    // No backend session yet — retry the id_token exchange if we still have
    // a fresh Google token (e.g. the exchange failed right after login).
    const idToken = readStoredToken(GOOGLE_ID_TOKEN_KEY)
    if (idToken && isJwtFresh(idToken)) {
      refreshSessionPromise = establishBackendSession(idToken).finally(() => {
        refreshSessionPromise = null
      })
      return refreshSessionPromise
    }
    return Promise.resolve(false)
  }

  refreshSessionPromise = (async () => {
    try {
      const session = await authEndpointPost("/auth/refresh", { refreshToken })
      if (!session?.accessToken) return false
      window.localStorage?.setItem(SESSION_ACCESS_TOKEN_KEY, session.accessToken)
      dispatchAuthRefreshed()
      return true
    } catch (error) {
      const status = error instanceof ApiError ? error.status : undefined
      if (status === 401 || status === 403) {
        // The server definitively rejected this refresh token — it's dead.
        window.localStorage?.removeItem(SESSION_ACCESS_TOKEN_KEY)
        window.localStorage?.removeItem(SESSION_REFRESH_TOKEN_KEY)
      } else {
        console.warn("[apiClient] Session refresh failed (will retry later)", error)
      }
      return false
    } finally {
      refreshSessionPromise = null
    }
  })()

  return refreshSessionPromise
}

// Cheap check used by online/focus/interval handlers: refresh in the
// background before the access token actually expires so requests never see
// a 401 during normal operation.
export const maybeRefreshBackendSession = (): void => {
  if (typeof window === "undefined") return
  if (typeof navigator !== "undefined" && !navigator.onLine) return
  const accessToken = readStoredToken(SESSION_ACCESS_TOKEN_KEY)
  if (accessToken && isJwtFresh(accessToken, SESSION_REFRESH_WINDOW_MS)) {
    return
  }
  const hasRefreshToken = Boolean(readStoredToken(SESSION_REFRESH_TOKEN_KEY))
  const hasFreshIdToken = (() => {
    const idToken = readStoredToken(GOOGLE_ID_TOKEN_KEY)
    return Boolean(idToken && isJwtFresh(idToken))
  })()
  if (!hasRefreshToken && !hasFreshIdToken) return
  void refreshBackendSession()
}

// Full local sign-out: drop the backend session (best-effort server-side
// invalidation) plus any stored Google token.
export const clearBackendSession = (): void => {
  if (typeof window === "undefined") return
  const refreshToken = readStoredToken(SESSION_REFRESH_TOKEN_KEY)
  window.localStorage?.removeItem(SESSION_ACCESS_TOKEN_KEY)
  window.localStorage?.removeItem(SESSION_REFRESH_TOKEN_KEY)
  if (refreshToken) {
    void authEndpointPost("/auth/logout", { refreshToken }).catch(() => {
      // Offline logout is fine — the row expires server-side on its own.
    })
  }
}

// Note: caller-supplied `init` is spread FIRST so the computed method,
// auth headers, and body always win. An earlier version spread `init` last,
// which silently replaced the Authorization headers whenever a caller passed
// its own `headers` — every such request then failed with a 401.
export async function apiGet<T>(path: string, init?: ApiRequestInit): Promise<T> {
  const response = await fetchWithFallback(path, {
    ...init,
    method: "GET",
    headers: withAuthHeaders(init?.headers),
  })
  return handleResponse<T>(response)
}

export async function apiPost<T>(path: string, body?: unknown, init?: ApiRequestInit): Promise<T> {
  const response = await fetchWithFallback(path, {
    ...init,
    method: "POST",
    headers: withAuthHeaders({
      ...defaultHeaders,
      ...(init?.headers ?? {}),
    }),
    body: body ? JSON.stringify(body) : undefined,
  })
  return handleResponse<T>(response)
}

export async function apiPut<T>(path: string, body?: unknown, init?: ApiRequestInit): Promise<T> {
  const response = await fetchWithFallback(path, {
    ...init,
    method: "PUT",
    headers: withAuthHeaders({
      ...defaultHeaders,
      ...(init?.headers ?? {}),
    }),
    body: body ? JSON.stringify(body) : undefined,
  })
  return handleResponse<T>(response)
}

export async function apiPatch<T>(path: string, body?: unknown, init?: ApiRequestInit): Promise<T> {
  const response = await fetchWithFallback(path, {
    ...init,
    method: "PATCH",
    headers: withAuthHeaders({
      ...defaultHeaders,
      ...(init?.headers ?? {}),
    }),
    body: body ? JSON.stringify(body) : undefined,
  })
  return handleResponse<T>(response)
}

export async function apiDelete<T>(path: string, body?: unknown, init?: ApiRequestInit): Promise<T> {
  const response = await fetchWithFallback(path, {
    ...init,
    method: "DELETE",
    headers: withAuthHeaders(body ? {
      ...defaultHeaders,
      ...(init?.headers ?? {}),
    } : (init?.headers ?? {})),
    body: body ? JSON.stringify(body) : undefined,
  })
  return handleResponse<T>(response)
}

export const setApiAuthToken = (token: string | null): void => {
  if (typeof window === "undefined") return
  if (!token) {
    window.localStorage?.removeItem("api_auth_token")
    return
  }
  const trimmed = token.trim()
  if (!trimmed) return
  window.localStorage?.setItem("api_auth_token", trimmed)
}

export { ApiError }
export { API_AUTH_FAILURE_EVENT, AUTH_REFRESHED_EVENT }

export type ApiHealth = {
  status?: string
  database?: string
  basePath?: string
}

export async function pingApi(): Promise<ApiHealth> {
  return apiGet<ApiHealth>("/health")
}
