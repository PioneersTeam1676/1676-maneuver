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

const normalizeString = (value) => (typeof value === "string" ? value.trim() : "")

const parseYear = (value) => {
  if (!value) return null
  const match = String(value).match(/(19|20)\d{2}/)
  return match ? match[0] : null
}

const resolveSeasonSelector = ({ year, formId, eventName, eventKey }) => {
  const normalizedYear = normalizeString(year)
  const inferred = parseYear(eventKey) || parseYear(eventName)
  return {
    year: normalizedYear || inferred || null,
    formId: normalizeString(formId) || null,
  }
}

const getFormForSeason = async ({ year, formId }) => {
  if (formId) {
    return mainPrisma.formDefinition.findUnique({ where: { id: formId } })
  }
  if (year) {
    return mainPrisma.formDefinition.findFirst({
      where: { year },
      orderBy: { updatedAt: "desc" },
    })
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
  const config = await getSeasonDbConfig(selector)
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
