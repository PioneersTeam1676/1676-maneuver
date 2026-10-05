const fs = require("fs/promises")
const path = require("path")

// Rolling JSON snapshots of every scouting and pit entry, written to
// server/data/backups (the Docker volume) so data can be pulled off the
// server by hand even if MySQL is later lost or a bad import wipes a table.
// Defaults: one snapshot an hour, kept for 24 hours. Leads can also list and
// download them from GET /backups.

const BACKUP_DIRECTORY = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : path.resolve(__dirname, "../data/backups")

const positiveNumber = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const INTERVAL_MS = positiveNumber(process.env.BACKUP_INTERVAL_MINUTES, 60) * 60 * 1000
const RETENTION_MS = positiveNumber(process.env.BACKUP_RETENTION_HOURS, 24) * 60 * 60 * 1000
const FILE_PATTERN = /^snapshot-[0-9TZ-]+\.json$/

const toPlain = (value) =>
  JSON.parse(JSON.stringify(value, (_key, nested) => (typeof nested === "bigint" ? Number(nested) : nested)))

const readTables = async (prisma) => {
  const [scouting, pit] = await Promise.all([
    prisma.scoutingEntry.findMany({ orderBy: { timestamp: "asc" } }),
    prisma.pitEntry.findMany({ orderBy: { timestamp: "asc" } }),
  ])
  return toPlain({ scoutingEntries: scouting, pitEntries: pit })
}

const pruneBackups = async (now = Date.now()) => {
  let removed = 0
  const names = await fs.readdir(BACKUP_DIRECTORY).catch(() => [])
  for (const name of names) {
    if (!FILE_PATTERN.test(name)) continue
    const fullPath = path.join(BACKUP_DIRECTORY, name)
    const stat = await fs.stat(fullPath).catch(() => null)
    if (stat && now - stat.mtimeMs > RETENTION_MS) {
      await fs.unlink(fullPath).catch(() => {})
      removed += 1
    }
  }
  return removed
}

const createBackupSnapshot = async () => {
  // Required lazily so tests can load this module without a database.
  const { prisma: mainPrisma } = require("./db")
  const { getSeasonPrisma } = require("./seasonDb")

  const sources = { main: await readTables(mainPrisma) }
  try {
    const season = await getSeasonPrisma()
    if (season.source === "season") {
      sources[`season-${season.config?.year || "active"}`] = await readTables(season.prisma)
    }
  } catch (error) {
    sources.seasonError = String(error?.message || error)
  }

  await fs.mkdir(BACKUP_DIRECTORY, { recursive: true })
  const createdAt = new Date()
  const name = `snapshot-${createdAt.toISOString().replace(/[:.]/g, "-")}.json`
  const tmpPath = path.join(BACKUP_DIRECTORY, `.${name}.tmp`)
  await fs.writeFile(tmpPath, JSON.stringify({ format: "maneuver-server-snapshot", version: 1, createdAt, sources }))
  await fs.rename(tmpPath, path.join(BACKUP_DIRECTORY, name))
  await pruneBackups()
  return name
}

const listBackups = async () => {
  const names = await fs.readdir(BACKUP_DIRECTORY).catch(() => [])
  const rows = []
  for (const name of names) {
    if (!FILE_PATTERN.test(name)) continue
    const stat = await fs.stat(path.join(BACKUP_DIRECTORY, name)).catch(() => null)
    if (stat) rows.push({ name, size: stat.size, createdAt: stat.mtime.toISOString() })
  }
  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

const resolveBackupPath = (name) => {
  if (!FILE_PATTERN.test(String(name || ""))) return null
  return path.join(BACKUP_DIRECTORY, name)
}

let timer = null

const scheduleBackups = () => {
  if (process.env.DISABLE_DB_BACKUPS === "true") {
    console.log("[backup] Snapshots disabled via DISABLE_DB_BACKUPS")
    return
  }
  const run = () =>
    createBackupSnapshot()
      .then((name) => console.log(`[backup] wrote ${name}`))
      .catch((error) => console.warn("[backup] snapshot failed:", error?.message || error))
  // First snapshot shortly after boot, then on the interval.
  setTimeout(run, 60_000).unref()
  timer = setInterval(run, INTERVAL_MS)
  timer.unref()
  console.log(
    `[backup] JSON snapshots every ${INTERVAL_MS / 60000} min, kept ${RETENTION_MS / 3600000} h, in ${BACKUP_DIRECTORY}`
  )
}

module.exports = {
  scheduleBackups,
  createBackupSnapshot,
  listBackups,
  pruneBackups,
  resolveBackupPath,
  BACKUP_DIRECTORY,
}
