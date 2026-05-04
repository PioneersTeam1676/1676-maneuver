import type { StoredScheduleState } from '@/types/schedule'
import type { RemoteScheduleState } from './scheduleApi'

export const SCHEDULE_CACHE_KEY = 'schedule_automation_state'

export const coerceCachedScheduleState = (value: unknown): RemoteScheduleState | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<StoredScheduleState> & Partial<RemoteScheduleState>
  if (!record.eventKey || !Array.isArray(record.assignments) || !Array.isArray(record.matches)) {
    return null
  }

  const eventKey = String(record.eventKey)

  return {
    eventKey,
    assignments: record.assignments,
    matches: record.matches,
    aliases: record.aliases ?? {},
    mode: record.mode ?? 'auto',
    updatedAt: record.updatedAt ?? null,
    lastCompletedMatch: record.lastCompletedMatch ?? null,
  }
}

export const readCachedScheduleState = (eventKey?: string): RemoteScheduleState | null => {
  if (typeof window === 'undefined') return null
  try {
    const cached = coerceCachedScheduleState(JSON.parse(localStorage.getItem(SCHEDULE_CACHE_KEY) || 'null'))
    if (!cached) return null
    if (eventKey && cached.eventKey !== eventKey) return null
    return cached
  } catch {
    return null
  }
}

export const writeCachedScheduleState = (state: RemoteScheduleState | null | undefined) => {
  if (typeof window === 'undefined' || !state?.eventKey) return
  const cached = coerceCachedScheduleState(state)
  if (!cached) return
  const stored: StoredScheduleState = {
    eventKey: cached.eventKey || '',
    assignments: cached.assignments,
    matches: cached.matches,
    aliases: cached.aliases ?? {},
    mode: cached.mode ?? 'auto',
  }
  localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(stored))
  window.dispatchEvent(new Event('scheduleAutomationUpdated'))
}
