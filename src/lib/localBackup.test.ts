import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  BACKUP_RETENTION_MS,
  backupDB,
  buildBackupCsv,
  buildBackupJson,
  latestPerEntry,
  listLocalBackups,
  pruneLocalBackups,
  recordLocalBackup,
} from './localBackup'

beforeEach(async () => {
  await backupDB.records.clear()
})

describe('local backup', () => {
  it('records a copy with searchable metadata', async () => {
    await recordLocalBackup('match', { id: 'm1', teamNumber: '1676', matchNumber: '12', data: { scoutName: 'Ada' } })
    const [row] = await listLocalBackups()
    expect(row).toMatchObject({ kind: 'match', entryId: 'm1', teamNumber: '1676', matchNumber: '12', scoutName: 'Ada' })
  })

  it('drops copies older than the retention window', async () => {
    const now = Date.now()
    await backupDB.records.bulkAdd([
      { kind: 'match', entryId: 'old', savedAt: now - BACKUP_RETENTION_MS - 1000, payload: {} },
      { kind: 'match', entryId: 'new', savedAt: now - 1000, payload: {} },
    ])
    await pruneLocalBackups(now)
    expect((await backupDB.records.toArray()).map((row) => row.entryId)).toEqual(['new'])
  })

  it('exports the latest copy of each entry as JSON and CSV', async () => {
    await backupDB.records.bulkAdd([
      { kind: 'match', entryId: 'a', savedAt: 1, payload: { id: 'a', note: 'first' } },
      { kind: 'match', entryId: 'a', savedAt: 2, payload: { id: 'a', note: 'second, "quoted"' } },
      { kind: 'pit', entryId: 'p', savedAt: 3, payload: { id: 'p', photo: 'data:image/png;base64,AAAA' } },
    ])
    const latest = latestPerEntry(await backupDB.records.toArray())
    expect(latest).toHaveLength(2)
    const json = JSON.parse(buildBackupJson(latest))
    expect(json.format).toBe('maneuver-local-backup')
    expect(json.records.find((r: { entryId: string }) => r.entryId === 'a').payload.note).toBe('second, "quoted"')
    const csv = buildBackupCsv(latest)
    expect(csv).toContain('"second, ""quoted"""')
    expect(csv).toContain('[image]')
  })
})
