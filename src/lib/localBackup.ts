import Dexie, { type Table } from 'dexie'

// Device-side safety net: every match, pit and drive-team entry is copied
// here the moment it is saved, independent of sync state. Nothing else in the
// app ever modifies or deletes these rows (server refreshes rewrite the main
// caches, this store is untouched), so for the retention window you can
// always pull a device's raw submissions off it from the Device Backup page,
// even with no network and no working login.

export type BackupKind = 'match' | 'pit' | 'drive'

export interface BackupRecord {
  key?: number
  kind: BackupKind
  entryId: string
  savedAt: number
  teamNumber?: string
  matchNumber?: string
  eventName?: string
  scoutName?: string
  payload: unknown
}

const DEFAULT_RETENTION_HOURS = 24

const resolveRetentionMs = (): number => {
  const raw = Number(import.meta.env?.VITE_LOCAL_BACKUP_HOURS)
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_RETENTION_HOURS
  return hours * 60 * 60 * 1000
}

export const BACKUP_RETENTION_MS = resolveRetentionMs()
export const BACKUP_CHANGED_EVENT = 'local-backup-changed'

class LocalBackupDB extends Dexie {
  records!: Table<BackupRecord, number>

  constructor() {
    super('LocalBackupDB')
    this.version(1).stores({
      records: '++key, kind, entryId, savedAt',
    })
  }
}

export const backupDB = new LocalBackupDB()

const str = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined
  const text = String(value).trim()
  return text || undefined
}

const pick = (source: unknown, keys: string[]): string | undefined => {
  if (!source || typeof source !== 'object') return undefined
  const record = source as Record<string, unknown>
  for (const key of keys) {
    const value = str(record[key])
    if (value) return value
  }
  const nested = record.data
  if (nested && typeof nested === 'object' && nested !== source) {
    return pick(nested, keys)
  }
  return undefined
}

// Structured clone drops functions/DOM nodes and would throw on them; JSON
// round-tripping gives a plain, exportable snapshot of exactly what was saved.
const snapshot = (value: unknown): unknown => {
  try {
    return JSON.parse(JSON.stringify(value ?? null))
  } catch {
    return String(value)
  }
}

let lastPruneAt = 0

export const pruneLocalBackups = async (now = Date.now()): Promise<number> => {
  lastPruneAt = now
  return backupDB.records.where('savedAt').below(now - BACKUP_RETENTION_MS).delete()
}

const notifyChanged = () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(BACKUP_CHANGED_EVENT))
  }
}

// Never throws: a backup failure must not block the real save.
export const recordLocalBackup = async (kind: BackupKind, entry: unknown): Promise<void> => {
  try {
    const now = Date.now()
    const entryId = pick(entry, ['id', 'clientId']) || `${kind}-${now}`
    await backupDB.records.add({
      kind,
      entryId,
      savedAt: now,
      teamNumber: pick(entry, ['teamNumber', 'selectTeam']),
      matchNumber: pick(entry, ['matchNumber']),
      eventName: pick(entry, ['eventName']),
      scoutName: pick(entry, ['scoutName']),
      payload: snapshot(entry),
    })
    if (now - lastPruneAt > 10 * 60 * 1000) {
      await pruneLocalBackups(now)
    }
    notifyChanged()
  } catch (error) {
    console.warn('[localBackup] could not record backup copy', error)
  }
}

export const listLocalBackups = async (kind?: BackupKind): Promise<BackupRecord[]> => {
  await pruneLocalBackups().catch(() => 0)
  const rows = await backupDB.records.orderBy('savedAt').reverse().toArray()
  return kind ? rows.filter((row) => row.kind === kind) : rows
}

export const clearLocalBackups = async (): Promise<void> => {
  await backupDB.records.clear()
  notifyChanged()
}

// The newest copy of each entry (an entry saved twice keeps both copies in
// the store; exports default to the latest one per entry).
export const latestPerEntry = (rows: BackupRecord[]): BackupRecord[] => {
  const seen = new Map<string, BackupRecord>()
  for (const row of rows) {
    const id = `${row.kind}:${row.entryId}`
    const current = seen.get(id)
    if (!current || row.savedAt > current.savedAt) seen.set(id, row)
  }
  return Array.from(seen.values()).sort((a, b) => b.savedAt - a.savedAt)
}

export const buildBackupJson = (rows: BackupRecord[], meta: Record<string, unknown> = {}): string =>
  JSON.stringify(
    {
      format: 'maneuver-local-backup',
      version: 1,
      exportedAt: new Date().toISOString(),
      retentionHours: BACKUP_RETENTION_MS / 3_600_000,
      count: rows.length,
      ...meta,
      records: rows.map((row) => {
        const rest = { ...row }
        delete rest.key
        return { ...rest, savedAtIso: new Date(rest.savedAt).toISOString() }
      }),
    },
    null,
    2,
  )

const flatten = (value: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> => {
  if (value === null || value === undefined) {
    if (prefix) out[prefix] = ''
    return out
  }
  if (Array.isArray(value)) {
    out[prefix] = JSON.stringify(value)
    return out
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      flatten(nested, prefix ? `${prefix}.${key}` : key, out)
    }
    return out
  }
  out[prefix] = String(value)
  return out
}

const csvCell = (value: string): string => {
  const needsQuote = /[",\r\n]/.test(value) || /^[=+\-@]/.test(value)
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value
  return needsQuote ? `"${safe.replace(/"/g, '""')}"` : safe
}

// One row per record; the payload's fields become columns (nested keys are
// dotted). Image data URLs are replaced so the CSV stays openable.
export const buildBackupCsv = (rows: BackupRecord[]): string => {
  const flatRows = rows.map((row) => {
    const payload = flatten(row.payload)
    for (const key of Object.keys(payload)) {
      if (payload[key].startsWith('data:image/')) payload[key] = '[image]'
    }
    return {
      kind: row.kind,
      entryId: row.entryId,
      savedAt: new Date(row.savedAt).toISOString(),
      teamNumber: row.teamNumber ?? '',
      matchNumber: row.matchNumber ?? '',
      eventName: row.eventName ?? '',
      scoutName: row.scoutName ?? '',
      ...Object.fromEntries(Object.entries(payload).map(([key, value]) => [`payload.${key}`, value])),
    } as Record<string, string>
  })
  const headers: string[] = []
  const seen = new Set<string>()
  for (const row of flatRows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        headers.push(key)
      }
    }
  }
  const lines = [headers.map(csvCell).join(',')]
  for (const row of flatRows) {
    lines.push(headers.map((header) => csvCell(row[header] ?? '')).join(','))
  }
  return lines.join('\r\n')
}
