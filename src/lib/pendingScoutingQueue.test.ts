import { beforeEach, describe, expect, it, vi } from 'vitest'

// In-memory stand-ins for the parts of dexieDB the replay touches. `dexieRows`
// is what IndexedDB holds after a pass; `failCacheFor` makes the local save of
// those ids throw, like a broken/full IndexedDB would.
const dexie = vi.hoisted(() => {
  const state = {
    dexieRows: new Map<string, { id: string; synced: boolean }>(),
    failCacheFor: new Set<string>(),
    syncMarksSynced: true,
    beforeCache: null as null | ((id: string) => Promise<void>),
  }
  return {
    state,
    cacheScoutingEntryLocally: vi.fn(async (entry: { id: string }) => {
      if (state.beforeCache) await state.beforeCache(entry.id)
      if (state.failCacheFor.has(entry.id)) throw new Error('QuotaExceededError')
      state.dexieRows.set(entry.id, { id: entry.id, synced: false })
    }),
    syncCachedScoutingEntries: vi.fn(async () => {
      if (!state.syncMarksSynced) throw new Error('offline')
      state.dexieRows.forEach((row) => { row.synced = true })
    }),
    db: {
      scoutingData: {
        bulkGet: vi.fn(async (ids: string[]) => ids.map((id) => state.dexieRows.get(id))),
        filter: (fn: (row: { synced: boolean }) => boolean) => ({
          toArray: async () => [...state.dexieRows.values()].filter(fn),
        }),
      },
    },
  }
})

vi.mock('./dexieDB', () => dexie)

import {
  enqueuePendingSubmission,
  getPendingSubmissions,
  replayPendingSubmissions,
} from './pendingScoutingQueue'

const entry = (id: string) => ({ id, data: { selectTeam: '1676', matchNumber: id }, timestamp: 1 })
const queuedIds = () => getPendingSubmissions().map((item) => item.entry.id).sort()

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  })
  dexie.state.dexieRows.clear()
  dexie.state.failCacheFor.clear()
  dexie.state.syncMarksSynced = true
  dexie.state.beforeCache = null
})

describe('replayPendingSubmissions', () => {
  it('drops entries once they are stored locally and synced', async () => {
    enqueuePendingSubmission(entry('a'))

    await replayPendingSubmissions()

    expect(queuedIds()).toEqual([])
  })

  it('keeps entries that reached IndexedDB but have not synced yet', async () => {
    dexie.state.syncMarksSynced = false
    enqueuePendingSubmission(entry('a'))

    await replayPendingSubmissions()

    expect(queuedIds()).toEqual(['a'])
  })

  it('keeps an entry whose local save fails again, even when another entry recovers', async () => {
    // b's only copy is this queue: losing it here loses the match.
    dexie.state.failCacheFor.add('b')
    enqueuePendingSubmission(entry('a'))
    enqueuePendingSubmission(entry('b'))

    await replayPendingSubmissions()

    expect(queuedIds()).toEqual(['b'])
    expect(getPendingSubmissions()[0].attempts).toBe(1)
  })

  it('keeps an entry queued while the replay was running', async () => {
    enqueuePendingSubmission(entry('a'))
    dexie.state.beforeCache = async () => {
      // A scout submits a new match (whose IndexedDB save failed) mid-replay.
      dexie.state.beforeCache = null
      dexie.state.failCacheFor.add('c')
      enqueuePendingSubmission(entry('c'))
    }

    await replayPendingSubmissions()

    expect(queuedIds()).toEqual(['c'])
  })

  it('reports counts the banner can act on without toasting every retry', async () => {
    // Server unreachable but the device save works: nothing "recovered" and
    // nothing "failing" — the entry is just waiting, so no toast should fire.
    dexie.state.syncMarksSynced = false
    enqueuePendingSubmission(entry('a'))
    expect(await replayPendingSubmissions()).toMatchObject({ recovered: 0, remaining: 0, waitingForSync: 1 })

    dexie.state.syncMarksSynced = true
    expect(await replayPendingSubmissions()).toMatchObject({ recovered: 1, remaining: 0, waitingForSync: 0 })

    dexie.state.failCacheFor.add('b')
    enqueuePendingSubmission(entry('b'))
    expect(await replayPendingSubmissions()).toMatchObject({ recovered: 0, remaining: 1, waitingForSync: 0 })
  })

  it('keeps every entry when IndexedDB cannot even be read back', async () => {
    enqueuePendingSubmission(entry('a'))
    dexie.db.scoutingData.bulkGet.mockRejectedValueOnce(new Error('InvalidStateError'))

    await replayPendingSubmissions()

    expect(queuedIds()).toEqual(['a'])
  })
})
