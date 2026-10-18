import type { ScoutingDataWithId } from "./scoutingDataUtils"

const QUEUE_KEY = "pendingScoutingSubmissions"
const MAX_ATTEMPTS = 5

export const PENDING_QUEUE_CHANGED_EVENT = "pending-scouting-queue-changed"

export interface PendingSubmissionError {
  name?: string
  message?: string
}

export interface PendingSubmission {
  entry: ScoutingDataWithId
  queuedAt: number
  attempts: number
  lastError?: PendingSubmissionError
}

const isBrowser = (): boolean => typeof localStorage !== "undefined"

const readQueue = (): PendingSubmission[] => {
  if (!isBrowser()) return []
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as PendingSubmission[]) : []
  } catch {
    return []
  }
}

const writeQueue = (queue: PendingSubmission[]): void => {
  if (!isBrowser()) return
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
  } catch (error) {
    // localStorage full. Keep whatever queue was stored before rather than
    // trimming it: dropping the oldest entry to fit a new one just trades one
    // lost match for another. IndexedDB is the primary store; this queue is
    // only the fallback for when that save failed.
    console.error("[pendingScoutingQueue] could not persist queue", error)
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(PENDING_QUEUE_CHANGED_EVENT))
  }
}

export const enqueuePendingSubmission = (
  entry: ScoutingDataWithId,
  error?: PendingSubmissionError,
): void => {
  const queue = readQueue()
  const existingIdx = queue.findIndex((item) => item.entry.id === entry.id)
  const next: PendingSubmission = {
    entry,
    queuedAt: existingIdx >= 0 ? queue[existingIdx].queuedAt : Date.now(),
    attempts: existingIdx >= 0 ? queue[existingIdx].attempts : 0,
    lastError: error,
  }
  if (existingIdx >= 0) {
    queue[existingIdx] = next
  } else {
    queue.push(next)
  }
  writeQueue(queue)
}

export const getPendingSubmissions = (): PendingSubmission[] => readQueue()

export const getPendingSubmissionCount = (): number => readQueue().length

export const removePendingSubmission = (id: string): void => {
  const queue = readQueue().filter((item) => item.entry.id !== id)
  writeQueue(queue)
}

export const clearPendingSubmissions = (): void => {
  writeQueue([])
}

export interface ReplayResult {
  /** Entries that left the queue: stored on the device and on the server. */
  recovered: number
  /** Entries whose on-device save is still failing (queue is the only copy). */
  remaining: number
  /** Entries stored on the device, still waiting for the server. */
  waitingForSync: number
  failed: PendingSubmission[]
}

export const replayPendingSubmissions = async (): Promise<ReplayResult> => {
  const queue = readQueue()
  if (queue.length === 0) {
    const { syncCachedScoutingEntries } = await import("./dexieDB")
    try {
      await syncCachedScoutingEntries()
    } catch {
      // ignore — surfaced via Dexie unsynced count elsewhere
    }
    return { recovered: 0, remaining: 0, waitingForSync: 0, failed: [] }
  }

  const { db, cacheScoutingEntryLocally, syncCachedScoutingEntries } = await import("./dexieDB")

  const failedSaves = new Map<string, PendingSubmission>()

  for (const item of queue) {
    try {
      await cacheScoutingEntryLocally({
        id: item.entry.id,
        data: item.entry.data,
        timestamp: item.entry.timestamp ?? Date.now(),
      })
    } catch (error) {
      const e = error as Error
      failedSaves.set(item.entry.id, {
        ...item,
        attempts: item.attempts + 1,
        lastError: { name: e?.name, message: e?.message },
      })
    }
  }

  try {
    await syncCachedScoutingEntries()
  } catch {
    // sync errors leave rows synced=false; banner picks them up
  }

  // An entry leaves the queue only once IndexedDB holds it AND the server has
  // it. One that isn't in IndexedDB (its save failed again this pass) has the
  // queue as its only copy. If IndexedDB can't even be read, keep everything.
  const confirmedSynced = new Set<string>()
  try {
    const ids = queue.map((item) => item.entry.id)
    const rows = await db.scoutingData.bulkGet(ids)
    rows.forEach((row, idx) => {
      if (row && row.synced !== false) confirmedSynced.add(ids[idx])
    })
  } catch {
    // leave confirmedSynced empty
  }

  // Re-read after the last await so a submission queued while this replay
  // ran is kept; the read-modify-write below is synchronous.
  const remaining = readQueue()
    .filter((item) => !confirmedSynced.has(item.entry.id))
    .map((item) => failedSaves.get(item.entry.id) ?? item)
  writeQueue(remaining)

  const stillFailing = remaining.filter((item) => failedSaves.has(item.entry.id))
  return {
    recovered: confirmedSynced.size,
    remaining: stillFailing.length,
    waitingForSync: remaining.length - stillFailing.length,
    failed: stillFailing.filter((item) => item.attempts >= MAX_ATTEMPTS),
  }
}
