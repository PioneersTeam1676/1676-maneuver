import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const html = (status = 200) => new Response('<!doctype html><html></html>', {
  status,
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
})

describe('api base URL candidates', () => {
  it('uses only the configured URL on a production host', async () => {
    const { resolveBaseUrlCandidates } = await import('./apiClient')
    expect(resolveBaseUrlCandidates('https://api.team1676.org/scouting/', {
      protocol: 'https:', hostname: 'scouting.team1676.org', port: '',
    })).toEqual(['https://api.team1676.org/scouting'])
  })

  it('falls back to same-origin and localhost when nothing is configured', async () => {
    const { resolveBaseUrlCandidates } = await import('./apiClient')
    expect(resolveBaseUrlCandidates('', { protocol: 'http:', hostname: 'atlas.local', port: '4176' })).toEqual([
      'http://atlas.local:4176/api',
      'http://atlas.local:4176/scouting',
      'http://localhost:4000/api',
      'http://127.0.0.1:4000/api',
    ])
  })
})

describe('wrong-host responses', () => {
  let storage: Map<string, string>
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    vi.resetModules()
    fetchMock.mockReset()
    storage = new Map([
      ['auth_session_token', 'access'],
      ['auth_refresh_token', 'refresh'],
    ])
    vi.stubGlobal('window', {
      location: { protocol: 'http:', hostname: 'localhost', port: '4176' },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      dispatchEvent: vi.fn(),
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('skips a candidate that serves the web app and uses the real API', async () => {
    fetchMock.mockResolvedValueOnce(html()).mockResolvedValueOnce(json({ success: true }))
    const { apiPost } = await import('./apiClient')
    await expect(apiPost('/scouting', { entry: { id: 'x' } })).resolves.toEqual({ success: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never reports an upload as successful when every candidate returns HTML', async () => {
    fetchMock.mockImplementation(async () => html())
    const { apiPost } = await import('./apiClient')
    await expect(apiPost('/scouting', { entry: { id: 'x' } })).rejects.toMatchObject({ status: 502 })
  })

  it('keeps the refresh token when a captive portal answers the refresh with an HTML 401', async () => {
    fetchMock.mockImplementation(async () => html(401))
    const { refreshBackendSessionDetailed } = await import('./apiClient')
    await expect(refreshBackendSessionDetailed()).resolves.toBe('unavailable')
    expect(storage.get('auth_refresh_token')).toBe('refresh')
  })
})
