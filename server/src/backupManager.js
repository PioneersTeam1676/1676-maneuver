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

// Rows are read in id-ordered pages and appended to the file as they arrive,
// so memory stays at one page (pit rows can carry large payloads) rather than
// the whole database, and nothing is stringified twice. On disk the snapshot
// is roughly the size of the `data` columns plus ~10% JSON overhead, times the
// 24 retained files.
const PAGE_SIZE = positiveNumber(process.env.BACKUP_PAGE_SIZE, 200)

const writeTable = async (handle, model) => {
  let first = true
  let cursor
  await handle.write("[")
  for (;;) {
    const page = await model.findMany({
      take: PAGE_SIZE,
      orderBy: { id: "asc" },
      ...(cursor !== undefined ? { cursor: { id: cursor }, skip: 1 } : {}),
    })
    if (!page.length) break
    for (const row of toPlain(page)) {
      await handle.write(`${first ? "" : ","}${JSON.stringify(row)}`)
      first = false
    }
    if (page.length < PAGE_SIZE) break
    cursor = page[page.length - 1].id
  }
  await handle.write("]")
}

const writeSource = async (handle, prisma) => {
  await handle.write('{"scoutingEntries":')
  await writeTable(handle, prisma.scoutingEntry)
  await handle.write(',"pitEntries":')
  await writeTable(handle, prisma.pitEntry)
  await handle.write("}")
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

  const sources = [["main", mainPrisma]]
  let seasonError = null
  try {
    const season = await getSeasonPrisma()
    if (season.source === "season") {
      sources.push([`season-${season.config?.year || "active"}`, season.prisma])
    }
  } catch (error) {
    seasonError = String(error?.message || error)
  }

  await fs.mkdir(BACKUP_DIRECTORY, { recursive: true })
  const createdAt = new Date()
  const name = `snapshot-${createdAt.toISOString().replace(/[:.]/g, "-")}.json`
  const tmpPath = path.join(BACKUP_DIRECTORY, `.${name}.tmp`)
  const handle = await fs.open(tmpPath, "w")
  try {
    await handle.write(
      `{"format":"maneuver-server-snapshot","version":1,"createdAt":${JSON.stringify(createdAt)},"sources":{`
    )
    for (let i = 0; i < sources.length; i += 1) {
      await handle.write(`${i ? "," : ""}${JSON.stringify(sources[i][0])}:`)
      await writeSource(handle, sources[i][1])
    }
    if (seasonError) {
      await handle.write(`${sources.length ? "," : ""}"seasonError":${JSON.stringify(seasonError)}`)
    }
    await handle.write("}}")
  } catch (error) {
    await handle.close().catch(() => {})
    await fs.unlink(tmpPath).catch(() => {})
    throw error
  }
  await handle.close()
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
