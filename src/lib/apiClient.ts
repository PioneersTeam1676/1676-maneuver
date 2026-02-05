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

const fetchWithFallback = async (path: string, init: RequestInit): Promise<Response> => {
  let lastError: unknown

  for (let offset = 0; offset < BASE_URL_CANDIDATES.length; offset += 1) {
    const index = (activeBaseIndex + offset) % BASE_URL_CANDIDATES.length
    const base = BASE_URL_CANDIDATES[index]
    try {
      const response = await fetch(`${base}${path}`, init)
      activeBaseIndex = index
      return response
    } catch (error) {
      lastError = error
      if (error instanceof TypeError) {
        if (!reportedFailures.has(base)) {
          console.warn(`[apiClient] Failed to reach ${base}: ${error.message}. Trying next fallback…`)
          reportedFailures.add(base)
        }
        continue
      }
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

const resolveAuthToken = (): string | null => {
  if (typeof window !== "undefined") {
    const idToken = window.localStorage?.getItem("auth_id_token")
    if (idToken && idToken.trim()) return idToken.trim()
    const stored = window.localStorage?.getItem("api_auth_token")
    if (stored && stored.trim()) return stored.trim()
  }
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_AUTH_TOKEN) {
    const token = String(import.meta.env.VITE_API_AUTH_TOKEN).trim()
    if (token) return token
  }
  return null
}

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
    const message = isJson && body?.error ? body.error : `Request failed with ${response.status}`
    throw new ApiError(message, response.status)
  }
  return body as T
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetchWithFallback(path, {
    method: "GET",
    headers: withAuthHeaders(init?.headers),
    ...init,
  })
  return handleResponse<T>(response)
}

export async function apiPost<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const response = await fetchWithFallback(path, {
    method: "POST",
    headers: withAuthHeaders({
      ...defaultHeaders,
      ...(init?.headers ?? {}),
    }),
    body: body ? JSON.stringify(body) : undefined,
    ...init,
  })
  return handleResponse<T>(response)
}

export async function apiPut<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const response = await fetchWithFallback(path, {
    method: "PUT",
    headers: withAuthHeaders({
      ...defaultHeaders,
      ...(init?.headers ?? {}),
    }),
    body: body ? JSON.stringify(body) : undefined,
    ...init,
  })
  return handleResponse<T>(response)
}

export async function apiPatch<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const response = await fetchWithFallback(path, {
    method: "PATCH",
    headers: withAuthHeaders({
      ...defaultHeaders,
      ...(init?.headers ?? {}),
    }),
    body: body ? JSON.stringify(body) : undefined,
    ...init,
  })
  return handleResponse<T>(response)
}

export async function apiDelete<T>(path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const response = await fetchWithFallback(path, {
    method: "DELETE",
    headers: withAuthHeaders(body ? {
      ...defaultHeaders,
      ...(init?.headers ?? {}),
    } : (init?.headers ?? {})),
    body: body ? JSON.stringify(body) : undefined,
    ...init,
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

export type ApiHealth = {
  status?: string
  database?: string
  basePath?: string
}

export async function pingApi(): Promise<ApiHealth> {
  return apiGet<ApiHealth>("/health")
}
