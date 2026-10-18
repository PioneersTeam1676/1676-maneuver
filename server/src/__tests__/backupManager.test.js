const fs = require("fs")
const os = require("os")
const path = require("path")

describe("server snapshots", () => {
  let dir
  const saved = { ...process.env }

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "maneuver-backups-"))
    process.env.BACKUP_DIR = dir
    jest.resetModules()
    jest.doMock("../db", () => ({
      prisma: {
        scoutingEntry: { findMany: jest.fn(async () => [{ id: 1, clientId: "a", timestamp: BigInt(5) }]) },
        pitEntry: { findMany: jest.fn(async () => []) },
      },
    }))
    jest.doMock("../seasonDb", () => ({ getSeasonPrisma: jest.fn(async () => ({ source: "main" })) }))
  })

  afterEach(() => {
    process.env = { ...saved }
    fs.rmSync(dir, { recursive: true, force: true })
  })

  test("writes a readable snapshot and prunes ones past retention", async () => {
    const { createBackupSnapshot, listBackups, pruneBackups } = require("../backupManager")
    const name = await createBackupSnapshot()
    const content = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"))
    expect(content.sources.main.scoutingEntries[0]).toMatchObject({ clientId: "a", timestamp: 5 })
    expect(await listBackups()).toHaveLength(1)

    const old = path.join(dir, "snapshot-2000-01-01T00-00-00-000Z.json")
    fs.writeFileSync(old, "{}")
    fs.utimesSync(old, new Date(2000, 0, 1), new Date(2000, 0, 1))
    expect(await pruneBackups()).toBe(1)
    expect(fs.existsSync(old)).toBe(false)
  })

  test("rejects path traversal in backup names", () => {
    const { resolveBackupPath } = require("../backupManager")
    expect(resolveBackupPath("../../etc/passwd")).toBeNull()
    expect(resolveBackupPath("snapshot-2026-01-01T00-00-00-000Z.json")).toContain(dir)
  })
})
