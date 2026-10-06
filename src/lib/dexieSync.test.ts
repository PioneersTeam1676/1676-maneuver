import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn(),
}))

vi.mock('./apiClient', () => api)
vi.mock('@/lib/scoutingSeason', () => ({
  withScoutingSeasonBody: <T,>(body: T) => body,
  withScoutingSeasonParams: <T,>(params: T) => params,
}))

import {
  db,
  pitDB,
  importScoutingData,
  loadAllPitScoutingEntries,
  loadAllScoutingEntries,
  loadScoutingEntriesByTeam,
  syncCachedPitScoutingEntries,
  syncCachedScoutingEntries,
  type ScoutingEntryDB,
} from './dexieDB'

const entry = (id: string, note: string, synced: boolean, teamNumber = '1676'): ScoutingEntryDB => ({
  id,
  teamNumber,
  data: { selectTeam: teamNumber, note },
  timestamp: 1_000,
  synced,
})

beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: true })
  vi.stubGlobal('requestAnimationFrame', (cb: () => void) => setTimeout(cb, 0))
  await db.scoutingData.clear()
  await pitDB.pitScoutingData.clear()
  Object.values(api).forEach((fn) => fn.mockReset())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('uploading unsynced entries', () => {
  it('marks uploaded entries as synced', async () => {
    await db.scoutingData.put(entry('a', 'v1', false))
    api.apiPost.mockResolvedValue({ success: true })

    await syncCachedScoutingEntries()

    expect((await db.scoutingData.get('a'))?.synced).toBe(true)
  })

  it('keeps an edit made while the upload was in flight', async () => {
    await db.scoutingData.put(entry('a', 'v1', false))
    api.apiPost.mockImplementation(async () => {
      await db.scoutingData.put(entry('a', 'v2', false))
      return { success: true }
    })

    await syncCachedScoutingEntries()

    const stored = await db.scoutingData.get('a')
    expect(stored?.data.note).toBe('v2')
    expect(stored?.synced).toBe(false)
  })

  it('leaves failed entries unsynced and marks the rest', async () => {
    await db.scoutingData.bulkPut([entry('ok', 'x', false), entry('bad', 'y', false)])
    api.apiPost.mockImplementation(async (path: string, body: { entry?: ScoutingEntryDB }) => {
      if (path === '/scouting/bulk') throw new Error('bulk down')
      if (body.entry?.id === 'bad') throw new Error('rejected')
      return { success: true }
    })

    await expect(syncCachedScoutingEntries()).rejects.toThrow(/1 of 2/)

    expect((await db.scoutingData.get('ok'))?.synced).toBe(true)
    expect((await db.scoutingData.get('bad'))?.synced).toBe(false)
  })

  it('keeps a pit edit made while the upload was in flight', async () => {
    await pitDB.pitScoutingData.put({ id: 'p', teamNumber: 1676, eventName: 'e', notes: 'v1', synced: false } as never)
    api.apiPost.mockImplementation(async () => {
      await pitDB.pitScoutingData.put({ id: 'p', teamNumber: 1676, eventName: 'e', notes: 'v2', synced: false } as never)
      return { success: true }
    })

    await syncCachedPitScoutingEntries()

    const stored = (await pitDB.pitScoutingData.get('p')) as unknown as { notes: string; synced: boolean }
    expect(stored.notes).toBe('v2')
    expect(stored.synced).toBe(false)
  })
})

describe('refreshing from the server', () => {
  it('keeps unsynced entries and drops rows the server no longer has', async () => {
    await db.scoutingData.bulkPut([
      entry('edited', 'local-v2', false),
      entry('local-only', 'new', false),
      entry('stale', 'gone-from-server', true),
    ])
    api.apiPost.mockRejectedValue(new Error('offline'))
    api.apiGet.mockResolvedValue({
      entries: [entry('edited', 'server-v1', true), entry('server-only', 's', true)],
    })

    await loadAllScoutingEntries()

    const rows = await db.scoutingData.toArray()
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]))
    expect(byId.edited.data.note).toBe('local-v2')
    expect(byId.edited.synced).toBe(false)
    expect(byId['local-only'].synced).toBe(false)
    expect(byId['server-only'].synced).toBe(true)
    expect(byId.stale).toBeUndefined()
  })

  it('falls back to local data when the server is unreachable', async () => {
    await db.scoutingData.put(entry('a', 'v1', false))
    api.apiPost.mockRejectedValue(new Error('offline'))
    api.apiGet.mockRejectedValue(new Error('offline'))

    const rows = await loadAllScoutingEntries()

    expect(rows.map((row) => row.id)).toEqual(['a'])
  })

  it('filtered loads do not overwrite unsynced edits', async () => {
    await db.scoutingData.put(entry('edited', 'local-v2', false))
    api.apiGet.mockResolvedValue({ entries: [entry('edited', 'server-v1', true), entry('other', 'o', true)] })

    const result = await loadScoutingEntriesByTeam('1676')

    expect(result.find((row) => row.id === 'edited')?.data.note).toBe('local-v2')
    expect((await db.scoutingData.get('edited'))?.synced).toBe(false)
    expect((await db.scoutingData.get('other'))?.synced).toBe(true)
  })

  it('pit refresh keeps unsynced local pit entries', async () => {
    await pitDB.pitScoutingData.put({ id: 'p', teamNumber: 1676, eventName: 'e', notes: 'local', synced: false } as never)
    api.apiPost.mockResolvedValue({ success: true })
    api.apiGet.mockImplementation(async () => {
      // A new pit entry is saved while the refresh is running.
      await pitDB.pitScoutingData.put({ id: 'new', teamNumber: 254, eventName: 'e', notes: 'mid', synced: false } as never)
      return { entries: [{ id: 'p', teamNumber: 1676, eventName: 'e', notes: 'local' }] }
    })

    await loadAllPitScoutingEntries()

    expect(await pitDB.pitScoutingData.get('new')).toBeDefined()
    expect(((await pitDB.pitScoutingData.get('p')) as unknown as { synced: boolean }).synced).toBe(true)
  })
})

describe('importing', () => {
  it('keeps imported entries locally when the upload fails', async () => {
    api.apiPost.mockRejectedValue(new Error('offline'))

    const result = await importScoutingData({ entries: [entry('imp', 'qr', true)] })

    expect(result.success).toBe(false)
    expect((await db.scoutingData.get('imp'))?.synced).toBe(false)
  })
})

describe('chunked uploads', () => {
  it('uploads a large backlog in several bulk requests', async () => {
    await db.scoutingData.bulkPut(Array.from({ length: 120 }, (_, i) => entry(`e${i}`, 'n', false)))
    api.apiPost.mockResolvedValue({ success: true })

    await syncCachedScoutingEntries()

    const bulkCalls = api.apiPost.mock.calls.filter(([path]) => path === '/scouting/bulk')
    expect(bulkCalls.map(([, body]) => (body as { entries: unknown[] }).entries.length)).toEqual([50, 50, 20])
    expect(await db.scoutingData.filter((row) => row.synced === false).count()).toBe(0)
  })

  it('keeps going past a chunk whose bulk call fails', async () => {
    await db.scoutingData.bulkPut(Array.from({ length: 60 }, (_, i) => entry(`e${i}`, 'n', false)))
    let bulkCount = 0
    api.apiPost.mockImplementation(async (path: string) => {
      if (path === '/scouting/bulk' && bulkCount++ === 0) throw new Error('413')
      return { success: true }
    })

    await syncCachedScoutingEntries()

    expect(await db.scoutingData.filter((row) => row.synced === false).count()).toBe(0)
  })
})
