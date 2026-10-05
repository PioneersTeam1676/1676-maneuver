const { PrismaClient } = require("@prisma/client")
const { prisma: mainPrisma } = require("./db")
const { decryptSecret } = require("./utils/cryptoUtils")
const { runSql } = require("./utils/mysqlUtils")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const DEFAULT_DB_HOST = process.env.VITE_FORM_DB_HOST || process.env.FORM_DB_HOST || ""
const DEFAULT_DB_PORT = process.env.FORM_DB_PORT || process.env.VITE_FORM_DB_PORT || process.env.DB_PORT || "3306"

const CLIENT_CACHE = new Map()
const SCHEMA_READY = new Map()
let SEASON_DB_TABLE_READY = false

const normalizeString = (value) => (typeof value === "string" ? value.trim() : "")

const parseYear = (value) => {
  if (!value) return null
  const match = String(value).match(/(19|20)\d{2}/)
  return match ? match[0] : null
}

const ensureSeasonDbConfigTable = async () => {
  if (SEASON_DB_TABLE_READY) return
  await mainPrisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS season_db_configs (
      year VARCHAR(16) PRIMARY KEY,
      db_host VARCHAR(255) NOT NULL,
      db_name VARCHAR(255) NOT NULL,
      db_user VARCHAR(255) NOT NULL,
      db_pass VARCHAR(255) NULL,
      db_engine VARCHAR(64) NOT NULL DEFAULT 'mysql',
      updated_at INT NOT NULL
    )`
  )
  SEASON_DB_TABLE_READY = true
}

const resolveSeasonSelector = ({ year, formId, eventName, eventKey }) => {
  const normalizedYear = normalizeString(year)
  const inferred = parseYear(eventKey) || parseYear(eventName)
  return {
    year: normalizedYear || inferred || null,
    formId: normalizeString(formId) || null,
  }
}

const getLatestFormForYear = async (year) => {
  if (!year) return null

  const rows = await mainPrisma.formDefinition.findMany({
    where: { year },
    orderBy: { updatedAt: "desc" },
    take: 200,
  })

  if (!rows.length) return null

  const withDbConfig = rows.find((row) => {
    return Boolean(normalizeString(row.dbHost) || DEFAULT_DB_HOST) &&
      Boolean(normalizeString(row.dbName)) &&
      Boolean(normalizeString(row.dbUser))
  })

  return withDbConfig || rows[0]
}

// Season used when a request names none (no year, no event key). It is the
// current event's year (else the newest season year with a form), not the
// most recently edited form:
// tweaking last year's form used to silently send every un-scoped read to
// last year's database while new uploads (scoped by event key) went to this
// year's, so current data seemed to vanish. ACTIVE_SEASON_YEAR pins it.
let defaultYearCache = { value: null, at: 0 }
const DEFAULT_YEAR_TTL_MS = 30_000

const resolveDefaultYear = async () => {
  if (Date.now() - defaultYearCache.at < DEFAULT_YEAR_TTL_MS) return defaultYearCache.value
  const value = await computeDefaultYear()
  defaultYearCache = { value, at: Date.now() }
  return value
}

const computeDefaultYear = async () => {
  const pinned = parseYear(process.env.ACTIVE_SEASON_YEAR)
  if (pinned) return pinned
  // Uploads are routed by their event key's year, so un-scoped reads follow
  // the current event (Event Settings) to land in the same database.
  try {
    const settings = await mainPrisma.eventSetting.findUnique({ where: { id: 1 }, select: { currentEvent: true } })
    const fromEvent = parseYear(settings?.currentEvent)
    if (fromEvent) return fromEvent
  } catch {
    // event_settings missing on a fresh database: fall through
  }
  const newest = await mainPrisma.formDefinition.findFirst({
    orderBy: [{ year: "desc" }, { updatedAt: "desc" }],
    select: { year: true },
  })
  return parseYear(newest?.year)
}

const getFormForSeason = async ({ year, formId }) => {
  if (year) {
    return getLatestFormForYear(year)
  }
  if (formId) {
    const explicitForm = await mainPrisma.formDefinition.findUnique({ where: { id: formId } })
    if (!explicitForm) return null

    const explicitYear = normalizeString(explicitForm.year)
    if (explicitYear) {
      const seasonForm = await getLatestFormForYear(explicitYear)
      if (seasonForm) return seasonForm
    }

    return explicitForm
  }
  const defaultYear = await resolveDefaultYear()
  if (defaultYear) {
    const seasonForm = await getLatestFormForYear(defaultYear)
    if (seasonForm) return seasonForm
  }
  return mainPrisma.formDefinition.findFirst({
    orderBy: { updatedAt: "desc" },
  })
}

const buildDatabaseUrl = (config) => {
  const user = encodeURIComponent(config.user || "")
  const pass = encodeURIComponent(config.pass || "")
  const auth = config.user ? `${user}:${pass}@` : ""
  return `mysql://${auth}${config.host}:${config.port}/${config.name}`
}

const ensureSeasonSchema = async (dbConfig, cacheKey) => {
  if (SCHEMA_READY.has(cacheKey)) {
    return SCHEMA_READY.get(cacheKey)
  }

  const schemaPath = path.join(__dirname, "../prisma/season_schema.sql")
  const schemaSql = fs.readFileSync(schemaPath, "utf8")

  const promise = runSql(dbConfig, schemaSql, {
    splitStatements: true,
    ignoreErrors: ["ER_DUP_KEYNAME"],
  })
    .catch((error) => {
      SCHEMA_READY.delete(cacheKey)
      throw error
    })

  SCHEMA_READY.set(cacheKey, promise)
  await promise
}

const getSeasonDbConfig = async (selector) => {
  if (selector?.year) {
    try {
      await ensureSeasonDbConfigTable()
      const rows = await mainPrisma.$queryRawUnsafe(
        "SELECT year, db_host as dbHost, db_name as dbName, db_user as dbUser, db_pass as dbPass FROM season_db_configs WHERE year = ? LIMIT 1",
        selector.year,
      )
      const seasonConfig = Array.isArray(rows) && rows.length ? rows[0] : null
      if (seasonConfig) {
        const host = normalizeString(seasonConfig.dbHost) || DEFAULT_DB_HOST
        const name = normalizeString(seasonConfig.dbName)
        const user = normalizeString(seasonConfig.dbUser)
        const pass = seasonConfig.dbPass ? decryptSecret(seasonConfig.dbPass) : ""
        const port = normalizeString(DEFAULT_DB_PORT) || "3306"

        if (host && name && user) {
          return {
            formId: null,
            year: selector.year,
            host,
            name,
            user,
            pass,
            port,
          }
        }
      }
    } catch (error) {
      console.warn("Failed to load season_db_configs row, falling back to form definitions", error)
    }
  }

  const form = await getFormForSeason(selector)
  if (!form) return null

  const host = normalizeString(form.dbHost) || DEFAULT_DB_HOST
  const name = normalizeString(form.dbName)
  const user = normalizeString(form.dbUser)
  const pass = form.dbPass ? decryptSecret(form.dbPass) : ""
  const port = normalizeString(DEFAULT_DB_PORT) || "3306"

  if (!host || !name || !user) {
    return null
  }

  return {
    formId: form.id,
    year: form.year,
    host,
    name,
    user,
    pass,
    port,
  }
}

const getSeasonPrisma = async (selector = {}) => {
  let effective = selector || {}
  if (!effective.year && !effective.formId) {
    // Lets a season_db_configs row for the default year apply to un-scoped
    // requests too, not only form-level DB settings.
    const defaultYear = await resolveDefaultYear().catch(() => null)
    if (defaultYear) effective = { ...effective, year: defaultYear }
  }
  const config = await getSeasonDbConfig(effective)
  if (!config) {
    return { prisma: mainPrisma, config: null, source: "main" }
  }

  const url = buildDatabaseUrl(config)
  const cacheKey = crypto.createHash("sha256").update(url).digest("hex")

  if (!CLIENT_CACHE.has(cacheKey)) {
    CLIENT_CACHE.set(
      cacheKey,
      new PrismaClient({
        datasources: {
          db: { url },
        },
      })
    )
  }

  const prisma = CLIENT_CACHE.get(cacheKey)
  await ensureSeasonSchema(config, cacheKey)

  return { prisma, config, source: "season" }
}

module.exports = {
  resolveSeasonSelector,
  getSeasonPrisma,
  parseYear,
}
