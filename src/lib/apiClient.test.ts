import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

describe('silent session renewal', () => {
  let storage: Map<string, string>
  const fetchMock = vi.fn<typeof fetch>()
  const dispatchEvent = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    fetchMock.mockReset()
    storage = new Map([
      ['auth_session_token', 'old-access-token'],
      ['auth_refresh_token', 'persistent-refresh-token'],
    ])
    vi.stubGlobal('window', {
      location: { protocol: 'http:', hostname: 'localhost', port: '4176' },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      dispatchEvent,
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])(
    'silently renews and retries a rejected %s without an expiry notification', async (method) => {
      fetchMock
        .mockResolvedValueOnce(json({ error: 'Unauthorized' }, 401))
        .mockResolvedValueOnce(json({ accessToken: 'new-access-token' }))
        .mockResolvedValueOnce(json({ success: true }))
      const client = await import('./apiClient')
      const body = { match: 42 }
      const init = { headers: { 'X-Season': '2026' } }
      const request = method === 'GET'
        ? client.apiGet('/scouting', init)
        : ({ POST: client.apiPost, PUT: client.apiPut, PATCH: client.apiPatch, DELETE: client.apiDelete })[
          method as 'POST' | 'PUT' | 'PATCH' | 'DELETE'
        ]('/scouting', body, init)

      await expect(request).resolves.toEqual({ success: true })
      expect(fetchMock).toHaveBeenCalledTimes(3)
      expect(String(fetchMock.mock.calls[1][0])).toMatch(/\/auth\/refresh$/)
      const retry = fetchMock.mock.calls[2][1]!
      expect(retry.method).toBe(method)
      expect(retry.body).toBe(method === 'GET' ? undefined : JSON.stringify(body))
      expect(new Headers(retry.headers).get('Authorization')).toBe('Bearer new-access-token')
      expect(new Headers(retry.headers).get('X-Season')).toBe('2026')
      expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual(['auth-session-refreshed'])
    }
  )

  it('shares one renewal between concurrent requests', async () => {
    let finishRefresh!: (response: Response) => void
    const refreshed = new Promise<Response>((resolve) => { finishRefresh = resolve })
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).endsWith('/auth/refresh')) return refreshed
      return new Headers(init?.headers).get('Authorization') === 'Bearer new-access-token'
        ? json({ success: true })
        : json({}, 401)
    })
    const { apiGet } = await import('./apiClient')
    const requests = [apiGet('/one'), apiGet('/two')]
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    finishRefresh(json({ accessToken: 'new-access-token' }))
    await expect(Promise.all(requests)).resolves.toEqual([{ success: true }, { success: true }])
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))).toHaveLength(1)
  })

  it('stops after one retry when the API still rejects the renewed token', async () => {
    fetchMock
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ accessToken: 'new-access-token' }))
      .mockResolvedValueOnce(json({}, 401))
    const { apiGet } = await import('./apiClient')
    await expect(apiGet('/scouting')).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toContain('api-auth-failure')
  })

  it('keeps saved credentials when renewal is temporarily unavailable', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({}, 503))
    const { apiGet } = await import('./apiClient')
    await expect(apiGet('/scouting')).rejects.toMatchObject({ status: 503 })
    expect(storage.get('auth_refresh_token')).toBe('persistent-refresh-token')
    expect(storage.get('auth_session_token')).toBe('old-access-token')
    const events = dispatchEvent.mock.calls.map(([event]) => event.type)
    expect(events).not.toContain('api-auth-failure')
    expect(events).toContain('api-unavailable')
  })

  it('recovers after a network outage without asking the scout to sign in', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401))
      .mockRejectedValueOnce(new DOMException('Connection timed out', 'AbortError'))
    const { apiPost } = await import('./apiClient')
    await expect(apiPost('/scouting', { match: 42 })).rejects.toMatchObject({ status: 503 })
    expect(storage.get('auth_refresh_token')).toBe('persistent-refresh-token')
    expect(dispatchEvent.mock.calls.map(([event]) => event.type)).not.toContain('api-auth-failure')
    dispatchEvent.mockClear()

    fetchMock.mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({ accessToken: 'new-access-token' }))
      .mockResolvedValueOnce(json({ success: true }))
    await expect(apiPost('/scouting', { match: 42 })).resolves.toEqual({ success: true })
    expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual(['auth-session-refreshed'])
  })

  it('clears credentials when the server rejects the saved session', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401)).mockResolvedValueOnce(json({}, 401))
    const { apiGet } = await import('./apiClient')
    await expect(apiGet('/scouting')).rejects.toMatchObject({ status: 401 })
    expect(storage.size).toBe(0)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not substitute session credentials for explicitly supplied authentication', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 401))
    const { apiGet } = await import('./apiClient')
    await expect(apiGet('/scouting', { headers: { Authorization: 'Bearer custom-token' } }))
      .rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(storage.get('auth_session_token')).toBe('old-access-token')
  })

  it('does not retry a forbidden request', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 403))
    const { apiGet } = await import('./apiClient')
    await expect(apiGet('/scouting')).rejects.toMatchObject({ status: 403 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(dispatchEvent).not.toHaveBeenCalled()
  })
})

describe('refreshBackendSessionDetailed', () => {
  let storage: Map<string, string>
  const fetchMock = vi.fn<typeof fetch>()
  const dispatchEvent = vi.fn()

  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    fetchMock.mockReset()
    storage = new Map([
      ['auth_session_token', 'old-access-token'],
      ['auth_refresh_token', 'persistent-refresh-token'],
    ])
    vi.stubGlobal('window', {
      location: { protocol: 'http:', hostname: 'localhost', port: '4176' },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      dispatchEvent,
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('reports "refreshed" and stores the new access token', async () => {
    fetchMock.mockResolvedValueOnce(json({ accessToken: 'new-access-token' }))
    const { refreshBackendSessionDetailed } = await import('./apiClient')
    await expect(refreshBackendSessionDetailed()).resolves.toBe('refreshed')
    expect(storage.get('auth_session_token')).toBe('new-access-token')
  })

  it('reports "unavailable" on 503 and keeps every credential', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Service temporarily unavailable' }, 503))
    const { refreshBackendSessionDetailed } = await import('./apiClient')
    await expect(refreshBackendSessionDetailed()).resolves.toBe('unavailable')
    expect(storage.get('auth_refresh_token')).toBe('persistent-refresh-token')
    expect(storage.get('auth_session_token')).toBe('old-access-token')
    expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toContain('api-unavailable')
  })

  it('reports "unavailable" on a 500 and on a network failure', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Internal server error' }, 500))
    const client = await import('./apiClient')
    await expect(client.refreshBackendSessionDetailed()).resolves.toBe('unavailable')
    fetchMock.mockRejectedValueOnce(new DOMException('timeout', 'AbortError'))
    await expect(client.refreshBackendSessionDetailed()).resolves.toBe('unavailable')
    expect(storage.get('auth_refresh_token')).toBe('persistent-refresh-token')
  })

  it('reports "rejected" on 401 and clears the session credentials', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Invalid refresh token' }, 401))
    const { refreshBackendSessionDetailed } = await import('./apiClient')
    await expect(refreshBackendSessionDetailed()).resolves.toBe('rejected')
    expect(storage.has('auth_refresh_token')).toBe(false)
    expect(storage.has('auth_session_token')).toBe(false)
  })

  it('reports "no-credentials" when nothing is stored', async () => {
    storage.clear()
    const { refreshBackendSessionDetailed } = await import('./apiClient')
    await expect(refreshBackendSessionDetailed()).resolves.toBe('no-credentials')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('announces api-unavailable on a 503 from any request and api-reachable on the next success', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'Service temporarily unavailable' }, 503))
    const { apiGet } = await import('./apiClient')
    await expect(apiGet('/roles/me')).rejects.toMatchObject({ status: 503 })
    expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual(['api-unavailable'])
    fetchMock.mockResolvedValueOnce(json({ role: 'scout' }))
    await expect(apiGet('/roles/me')).resolves.toEqual({ role: 'scout' })
    expect(dispatchEvent.mock.calls.map(([event]) => event.type)).toEqual(['api-unavailable', 'api-reachable'])
  })
})
