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
  recovered: number
  remaining: number
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
    return { recovered: 0, remaining: 0, failed: [] }
  }

  const { db, cacheScoutingEntryLocally, syncCachedScoutingEntries } = await import("./dexieDB")

  const survivors: PendingSubmission[] = []
  const failed: PendingSubmission[] = []
  let recovered = 0

  for (const item of queue) {
    try {
      await cacheScoutingEntryLocally({
        id: item.entry.id,
        data: item.entry.data,
        timestamp: item.entry.timestamp ?? Date.now(),
      })
      recovered += 1
    } catch (error) {
      const e = error as Error
      const nextAttempts = item.attempts + 1
      const updated: PendingSubmission = {
        ...item,
        attempts: nextAttempts,
        lastError: { name: e?.name, message: e?.message },
      }
      if (nextAttempts >= MAX_ATTEMPTS) {
        failed.push(updated)
      }
      survivors.push(updated)
    }
  }

  writeQueue(survivors)

  try {
    await syncCachedScoutingEntries()
  } catch {
    // sync errors leave rows synced=false; banner picks them up
  }

  // Drop queue entries that successfully synced to server
  if (recovered > 0) {
    const stillUnsynced = await db.scoutingData
      .filter((entry) => entry.synced === false)
      .toArray()
    const unsyncedIds = new Set(stillUnsynced.map((entry) => entry.id))
    const remainingQueue = readQueue().filter((item) => unsyncedIds.has(item.entry.id))
    writeQueue(remainingQueue)
  }

  return { recovered, remaining: survivors.length, failed }
}
