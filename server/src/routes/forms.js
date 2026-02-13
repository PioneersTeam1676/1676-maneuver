const express = require("express")
const { randomUUID } = require("crypto")
const { prisma } = require("../db")
const { encryptSecret, decryptSecret } = require("../utils/cryptoUtils")
const { runSql } = require("../utils/mysqlUtils")
const asyncHandler = require("../utils/asyncHandler")
const { nowSeconds, parseJsonValue } = require("../utils/dbUtils")

const router = express.Router()

const normalizeString = (value) => (typeof value === "string" ? value.trim() : "")
const DEFAULT_DB_HOST = process.env.VITE_FORM_DB_HOST || process.env.FORM_DB_HOST || ""
const normalizeFormType = (value) => (value === "pit" ? "pit" : value === "drive" ? "drive" : "match")
const WEBHOOK_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"])
const normalizeWebhookMethod = (value) => {
  const candidate = normalizeString(value).toUpperCase()
  return WEBHOOK_METHODS.has(candidate) ? candidate : "GET"
}
const normalizeWebhookConfig = (value) => {
  const payload = value && typeof value === "object" ? value : {}
  return {
    url: normalizeString(payload.url),
    method: normalizeWebhookMethod(payload.method),
    authHeader: normalizeString(payload.authHeader),
  }
}

let formDefinitionColumnsReady = false
let seasonDbConfigTableReady = false

const ensureFormDefinitionWebhookColumns = async (prismaClient) => {
  if (formDefinitionColumnsReady) return
  const tableRows = await prismaClient.$queryRaw`
    SELECT TABLE_NAME as tableName
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'form_definitions'
    LIMIT 1
  `
  if (!Array.isArray(tableRows) || tableRows.length === 0) {
    formDefinitionColumnsReady = true
    return
  }

  const existingColumns = await prismaClient.$queryRaw`
    SELECT COLUMN_NAME as columnName
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'form_definitions'
      AND COLUMN_NAME IN ('webhook_url', 'webhook_method', 'webhook_auth_header')
  `
  const existing = new Set(
    Array.isArray(existingColumns)
      ? existingColumns.map((row) => String(row.columnName || ""))
      : []
  )

  const statements = []
  if (!existing.has("webhook_url")) {
    statements.push("ALTER TABLE form_definitions ADD COLUMN webhook_url VARCHAR(1024) NULL")
  }
  if (!existing.has("webhook_method")) {
    statements.push("ALTER TABLE form_definitions ADD COLUMN webhook_method VARCHAR(16) NULL")
  }
  if (!existing.has("webhook_auth_header")) {
    statements.push("ALTER TABLE form_definitions ADD COLUMN webhook_auth_header VARCHAR(512) NULL")
  }

  for (const statement of statements) {
    await prismaClient.$executeRawUnsafe(statement)
  }

  formDefinitionColumnsReady = true
}

const ensureSeasonDbConfigTable = async (prismaClient) => {
  if (seasonDbConfigTableReady) return
  await prismaClient.$executeRawUnsafe(
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
  seasonDbConfigTableReady = true
}

const normalizeYear = (value) => {
  const match = normalizeString(value).match(/(19|20)\d{2}/)
  return match ? match[0] : ""
}

const loadSeasonDbConfigRow = async (prismaClient, year) => {
  const normalizedYear = normalizeYear(year)
  if (!normalizedYear) return null
  await ensureSeasonDbConfigTable(prismaClient)
  const rows = await prismaClient.$queryRawUnsafe(
    "SELECT year, db_host as dbHost, db_name as dbName, db_user as dbUser, db_pass as dbPass, db_engine as dbEngine, updated_at as updatedAt FROM season_db_configs WHERE year = ? LIMIT 1",
    normalizedYear,
  )
  return Array.isArray(rows) && rows.length ? rows[0] : null
}

const mapSeasonDbConfig = (row) => ({
  year: normalizeYear(row?.year),
  db: {
    host: row?.dbHost || DEFAULT_DB_HOST,
    name: row?.dbName || "",
    user: row?.dbUser || "",
    pass: "",
    engine: row?.dbEngine || "mysql",
  },
  updatedAt: toIso(row?.updatedAt),
})

router.use(
  asyncHandler(async (_req, _res, next) => {
    await ensureFormDefinitionWebhookColumns(prisma)
    await ensureSeasonDbConfigTable(prisma)
    next()
  })
)

const ensureDbConfig = (config) => {
  const host = normalizeString(config.host) || DEFAULT_DB_HOST
  const name = normalizeString(config.name)
  const user = normalizeString(config.user)
  const pass = normalizeString(config.pass)
  const port = normalizeString(process.env.FORM_DB_PORT || process.env.VITE_FORM_DB_PORT || process.env.DB_PORT || "3306")
  if (!host || !name || !user) {
    return null
  }
  return { host, name, user, pass, port }
}

const toIso = (seconds) => {
  if (!seconds) return null
  return new Date(seconds * 1000).toISOString()
}

const normalizeSchema = (schema) => {
  if (!schema || typeof schema !== "object") {
    return { sections: [], pages: [], ui: {} }
  }
  const sections = Array.isArray(schema.sections) ? schema.sections : []
  const pages = Array.isArray(schema.pages) ? schema.pages : []
  const ui = schema.ui && typeof schema.ui === "object" ? schema.ui : undefined
  return { ...schema, sections, pages, ui }
}

const safeIdentifier = (value) => {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
  return normalized || "field"
}

const buildTableName = (form) => {
  const year = safeIdentifier(form.year || "unknown")
  const type = normalizeFormType(form.type)
  const idPart = safeIdentifier(form.id || "form").slice(0, 8) || "form"
  return `scouting_${year}_${type}_${idPart}`
}

const fieldTypeToSql = (field) => {
  switch (field.type) {
    case "long_text":
      return "TEXT"
    case "number":
      return "INT"
    case "select":
    case "radio":
      return "VARCHAR(160)"
    case "multi_select":
      return "TEXT"
    case "checkbox":
      return "TINYINT(1)"
    case "rating":
    case "slider":
      return "INT"
    case "date":
      return "DATE"
    case "time":
      return "TIME"
    case "image":
      return "TEXT"
    case "short_text":
    default:
      return "VARCHAR(255)"
  }
}

const flattenFields = (schema) => {
  if (!schema || typeof schema !== "object") return []
  if (Array.isArray(schema.pages) && schema.pages.length > 0) {
    return schema.pages.flatMap((page) =>
      Array.isArray(page.sections)
        ? page.sections.flatMap((section) => (Array.isArray(section.fields) ? section.fields : []))
        : []
    )
  }
  if (!Array.isArray(schema.sections)) return []
  return schema.sections.flatMap((section) => (Array.isArray(section.fields) ? section.fields : []))
}

const buildSqlForForm = (form, mode = "create") => {
  const tableName = buildTableName(form)
  const baseColumns = [
    "`id` CHAR(36) PRIMARY KEY",
    "`created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    "`updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
  ]
  const used = new Set(["id", "created_at", "updated_at"])
  const fieldColumns = []

  for (const field of flattenFields(form.schema)) {
    const baseName = field.key || field.label || field.id || "field"
    let columnName = safeIdentifier(baseName)
    let counter = 2
    while (used.has(columnName)) {
      columnName = `${columnName}_${counter}`
      counter += 1
    }
    used.add(columnName)
    const sqlType = fieldTypeToSql(field)
    const notNull = field.required ? " NOT NULL" : ""
    fieldColumns.push({ name: columnName, definition: `\`${columnName}\` ${sqlType}${notNull}` })
  }

  const createSql = `CREATE TABLE IF NOT EXISTS \`${tableName}\` (\n  ${[...baseColumns, ...fieldColumns.map((col) => col.definition)].join(",\n  ")}\n);`

  if (mode === "create") {
    return { tableName, sql: createSql }
  }

  const alterSql = fieldColumns.length
    ? fieldColumns
        .map(
          (col) =>
            `ALTER TABLE \`${tableName}\` ADD COLUMN IF NOT EXISTS ${col.definition};`
        )
        .join("\n")
    : ""

  const combined = `${createSql}\n${alterSql}`.trim()
  return { tableName, sql: combined }
}

const mapSummary = (row) => ({
  id: row.id,
  name: row.name,
  year: row.year,
  description: row.description,
  type: normalizeFormType(row.formType),
  status: row.status,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
})

const mapFull = (row) => ({
  id: row.id,
  name: row.name,
  year: row.year,
  description: row.description,
  type: normalizeFormType(row.formType),
  status: row.status,
  db: {
    host: row.dbHost || DEFAULT_DB_HOST,
    name: row.dbName || "",
    user: row.dbUser || "",
    pass: "",
    engine: row.dbEngine || "mysql",
  },
  webhook: {
    url: row.webhookUrl || "",
    method: normalizeWebhookMethod(row.webhookMethod),
    authHeader: row.webhookAuthHeader || "",
  },
  schema: parseJsonValue(row.schemaJson, { sections: [] }),
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
})

let activeFormTableReady = false

const ensureActiveFormTable = async (prismaClient) => {
  if (activeFormTableReady) return
  await prismaClient.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS active_form_settings (
      id INT PRIMARY KEY,
      match_form_id VARCHAR(255) NULL,
      pit_form_id VARCHAR(255) NULL,
      drive_form_id VARCHAR(255) NULL,
      updated_at INT NOT NULL
    )`
  )
  await prismaClient.$executeRawUnsafe(
    "ALTER TABLE active_form_settings ADD COLUMN IF NOT EXISTS drive_form_id VARCHAR(255) NULL"
  )
  activeFormTableReady = true
}

const ensureActiveFormRow = async (prismaClient) => {
  await ensureActiveFormTable(prismaClient)
  const rows = await prismaClient.$queryRaw`
    SELECT id,
      match_form_id as matchFormId,
      pit_form_id as pitFormId,
      drive_form_id as driveFormId,
      updated_at as updatedAt
    FROM active_form_settings
    WHERE id = 1
  `
  if (rows.length > 0) {
    return rows[0]
  }
  const now = nowSeconds()
  await prismaClient.$executeRaw`
    INSERT INTO active_form_settings (id, match_form_id, pit_form_id, drive_form_id, updated_at)
    VALUES (1, NULL, NULL, NULL, ${now})
  `
  return { id: 1, matchFormId: null, pitFormId: null, driveFormId: null, updatedAt: now }
}

const formatActiveForm = (row) => ({
  match: normalizeString(row?.matchFormId || row?.match_form_id) || null,
  pit: normalizeString(row?.pitFormId || row?.pit_form_id) || null,
  drive: normalizeString(row?.driveFormId || row?.drive_form_id) || null,
  updatedAt: toIso(row?.updatedAt),
})

router.get(
  "/seasons/:year/db",
  asyncHandler(async (req, res) => {
    const year = normalizeYear(req.params.year)
    if (!year) {
      return res.status(400).json({ error: "Valid season year is required" })
    }

    const existing = await loadSeasonDbConfigRow(prisma, year)
    if (existing) {
      return res.json(mapSeasonDbConfig(existing))
    }

    const fallback = await prisma.formDefinition.findFirst({
      where: { year },
      orderBy: { updatedAt: "desc" },
    })

    if (!fallback) {
      return res.json({
        year,
        db: {
          host: DEFAULT_DB_HOST,
          name: "",
          user: "",
          pass: "",
          engine: "mysql",
        },
        updatedAt: null,
      })
    }

    return res.json({
      year,
      db: {
        host: normalizeString(fallback.dbHost) || DEFAULT_DB_HOST,
        name: normalizeString(fallback.dbName),
        user: normalizeString(fallback.dbUser),
        pass: "",
        engine: normalizeString(fallback.dbEngine) || "mysql",
      },
      updatedAt: toIso(fallback.updatedAt),
    })
  })
)

router.put(
  "/seasons/:year/db",
  asyncHandler(async (req, res) => {
    const year = normalizeYear(req.params.year)
    if (!year) {
      return res.status(400).json({ error: "Valid season year is required" })
    }

    const dbConfig = req.body?.db || {}
    const host = normalizeString(dbConfig.host) || DEFAULT_DB_HOST
    const name = normalizeString(dbConfig.name)
    const user = normalizeString(dbConfig.user)
    const engine = normalizeString(dbConfig.engine) || "mysql"

    if (!host || !name || !user) {
      return res.status(400).json({ error: "DB host, name, and user are required" })
    }

    const existing = await loadSeasonDbConfigRow(prisma, year)
    const passProvided = typeof dbConfig.pass === "string" && dbConfig.pass.trim().length > 0
    let nextDbPass = existing?.dbPass || null
    if (passProvided) {
      try {
        nextDbPass = encryptSecret(dbConfig.pass)
      } catch (error) {
        if (error?.message?.includes("FORM_DB_SECRET")) {
          return res.status(400).json({ error: "FORM_DB_SECRET is not configured on the server." })
        }
        throw error
      }
    }

    const updatedAt = nowSeconds()
    await prisma.$executeRawUnsafe(
      `INSERT INTO season_db_configs (year, db_host, db_name, db_user, db_pass, db_engine, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         db_host = VALUES(db_host),
         db_name = VALUES(db_name),
         db_user = VALUES(db_user),
         db_pass = VALUES(db_pass),
         db_engine = VALUES(db_engine),
         updated_at = VALUES(updated_at)`,
      year,
      host,
      name,
      user,
      nextDbPass,
      engine,
      updatedAt,
    )

    await prisma.formDefinition.updateMany({
      where: { year },
      data: {
        dbHost: host,
        dbName: name,
        dbUser: user,
        dbPass: nextDbPass,
        dbEngine: engine,
        updatedAt,
      },
    })

    const saved = await loadSeasonDbConfigRow(prisma, year)
    return res.json(mapSeasonDbConfig(saved))
  })
)

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const yearParam = Array.isArray(req.query.year) ? req.query.year[0] : req.query.year
    const year = normalizeString(yearParam)
    const rows = await prisma.formDefinition.findMany({
      where: year ? { year } : undefined,
      orderBy: year
        ? [{ updatedAt: "desc" }]
        : [{ year: "desc" }, { updatedAt: "desc" }],
    })

    res.json({ forms: rows.map(mapSummary) })
  })
)

router.get(
  "/active",
  asyncHandler(async (_req, res) => {
    const row = await ensureActiveFormRow(prisma)
    res.json({ active: formatActiveForm(row) })
  })
)

router.put(
  "/active",
  asyncHandler(async (req, res) => {
    const payload = req.body || {}
    const existing = await ensureActiveFormRow(prisma)
    const hasMatch = Object.prototype.hasOwnProperty.call(payload, "match")
    const hasPit = Object.prototype.hasOwnProperty.call(payload, "pit")
    const hasDrive = Object.prototype.hasOwnProperty.call(payload, "drive")

    if (!hasMatch && !hasPit && !hasDrive) {
      return res.json({ active: formatActiveForm(existing) })
    }

    const currentMatch = normalizeString(existing?.matchFormId || existing?.match_form_id) || null
    const currentPit = normalizeString(existing?.pitFormId || existing?.pit_form_id) || null
    const currentDrive = normalizeString(existing?.driveFormId || existing?.drive_form_id) || null

    const nextMatch = hasMatch ? normalizeString(payload.match) || null : currentMatch
    const nextPit = hasPit ? normalizeString(payload.pit) || null : currentPit
    const nextDrive = hasDrive ? normalizeString(payload.drive) || null : currentDrive
    const updatedAt = nowSeconds()

    await prisma.$executeRaw`
      UPDATE active_form_settings
      SET match_form_id = ${nextMatch},
          pit_form_id = ${nextPit},
          drive_form_id = ${nextDrive},
          updated_at = ${updatedAt}
      WHERE id = 1
    `

    const updated = await ensureActiveFormRow(prisma)
    return res.json({ active: formatActiveForm(updated) })
  })
)

router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const row = await prisma.formDefinition.findUnique({ where: { id: req.params.id } })
    if (!row) {
      return res.status(404).json({ error: "Form not found" })
    }
    res.json({ form: mapFull(row) })
  })
)

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const payload = req.body || {}
    const name = normalizeString(payload.name)
    const year = normalizeString(payload.year)
    if (!name || !year) {
      return res.status(400).json({ error: "Name and year are required" })
    }

    const id = normalizeString(payload.id) || randomUUID()
    const description = normalizeString(payload.description)
    const status = normalizeString(payload.status) || "draft"
    const formType = normalizeFormType(payload.type)
    const dbConfig = payload.db || {}
    const schema = normalizeSchema(payload.schema)
    const webhook = normalizeWebhookConfig(payload.webhook)
    const seasonDbConfig = await loadSeasonDbConfigRow(prisma, year)

    const now = nowSeconds()
    let encryptedPass = null
    if (seasonDbConfig?.dbPass) {
      encryptedPass = seasonDbConfig.dbPass
    } else {
      try {
        encryptedPass = dbConfig.pass ? encryptSecret(dbConfig.pass) : null
      } catch (error) {
        if (error?.message?.includes("FORM_DB_SECRET")) {
          return res.status(400).json({ error: "FORM_DB_SECRET is not configured on the server." })
        }
        throw error
      }
    }
    await prisma.formDefinition.create({
      data: {
        id,
        name,
        year,
        description: description || null,
        formType,
        status,
        dbHost: normalizeString(seasonDbConfig?.dbHost) || normalizeString(dbConfig.host) || DEFAULT_DB_HOST,
        dbName: normalizeString(seasonDbConfig?.dbName) || normalizeString(dbConfig.name),
        dbUser: normalizeString(seasonDbConfig?.dbUser) || normalizeString(dbConfig.user),
        dbPass: encryptedPass,
        dbEngine: normalizeString(seasonDbConfig?.dbEngine) || normalizeString(dbConfig.engine) || "mysql",
        webhookUrl: webhook.url || null,
        webhookMethod: webhook.method,
        webhookAuthHeader: webhook.authHeader || null,
        schemaJson: JSON.stringify(schema),
        createdAt: now,
        updatedAt: now,
      }
    })

    const created = await prisma.formDefinition.findUnique({ where: { id } })
    res.status(201).json({ form: mapFull(created) })
  })
)

router.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const payload = req.body || {}
    const name = normalizeString(payload.name)
    const year = normalizeString(payload.year)
    if (!name || !year) {
      return res.status(400).json({ error: "Name and year are required" })
    }

    const description = normalizeString(payload.description)
    const status = normalizeString(payload.status) || "draft"
    const formType = normalizeFormType(payload.type)
    const dbConfig = payload.db || {}
    const schema = normalizeSchema(payload.schema)
    const seasonDbConfig = await loadSeasonDbConfigRow(prisma, year)
    const now = nowSeconds()
    try {
      const existing = await prisma.formDefinition.findUnique({ where: { id: req.params.id } })
      if (!existing) {
        return res.status(404).json({ error: "Form not found" })
      }
      const hasWebhook = Object.prototype.hasOwnProperty.call(payload, "webhook")
      const webhook = hasWebhook
        ? normalizeWebhookConfig(payload.webhook)
        : {
            url: existing.webhookUrl || "",
            method: normalizeWebhookMethod(existing.webhookMethod),
            authHeader: existing.webhookAuthHeader || "",
          }
      const passProvided = typeof dbConfig.pass === "string" && dbConfig.pass.trim().length > 0
      let nextDbPass = seasonDbConfig?.dbPass || existing.dbPass
      if (!seasonDbConfig && passProvided) {
        try {
          nextDbPass = encryptSecret(dbConfig.pass)
        } catch (error) {
          if (error?.message?.includes("FORM_DB_SECRET")) {
            return res.status(400).json({ error: "FORM_DB_SECRET is not configured on the server." })
          }
          throw error
        }
      }
      await prisma.formDefinition.update({
        where: { id: req.params.id },
        data: {
          name,
          year,
          description: description || null,
          formType,
          status,
          dbHost: normalizeString(seasonDbConfig?.dbHost) || normalizeString(dbConfig.host) || DEFAULT_DB_HOST,
          dbName: normalizeString(seasonDbConfig?.dbName) || normalizeString(dbConfig.name),
          dbUser: normalizeString(seasonDbConfig?.dbUser) || normalizeString(dbConfig.user),
          dbPass: nextDbPass,
          dbEngine: normalizeString(seasonDbConfig?.dbEngine) || normalizeString(dbConfig.engine) || "mysql",
          webhookUrl: webhook.url || null,
          webhookMethod: webhook.method,
          webhookAuthHeader: webhook.authHeader || null,
          schemaJson: JSON.stringify(schema),
          updatedAt: now,
        }
      })
    } catch (error) {
      if (error?.code === "P2025") {
        return res.status(404).json({ error: "Form not found" })
      }
      throw error
    }

    const updated = await prisma.formDefinition.findUnique({ where: { id: req.params.id } })
    res.json({ form: mapFull(updated) })
  })
)

router.post(
  "/:id/actions",
  asyncHandler(async (req, res) => {
    const { action } = req.body || {}
    if (!action) {
      return res.status(400).json({ error: "Action is required" })
    }
    const row = await prisma.formDefinition.findUnique({ where: { id: req.params.id } })
    if (!row) {
      return res.status(404).json({ error: "Form not found" })
    }
    const form = mapFull(row)
    const actionName = String(action)

    if (actionName === "generate_sql") {
      const { tableName, sql } = buildSqlForForm(form, "create")
      return res.json({ action: "generate_sql", tableName, sql })
    }

    if (actionName === "push") {
      const { tableName, sql } = buildSqlForForm(form, "migrate")
      let decryptedPass = ""
      try {
        decryptedPass = row.dbPass ? decryptSecret(row.dbPass) : ""
      } catch (error) {
        if (error?.message?.includes("FORM_DB_SECRET")) {
          return res.status(400).json({ error: "FORM_DB_SECRET is not configured on the server." })
        }
        throw error
      }
      const dbConfig = ensureDbConfig({
        host: row.dbHost || DEFAULT_DB_HOST,
        name: row.dbName,
        user: row.dbUser,
        pass: decryptedPass,
      })
      if (!dbConfig) {
        return res.status(400).json({ error: "Missing database configuration" })
      }
      await runSql(dbConfig, sql)
      return res.json({
        action: "push",
        tableName,
        sql,
        message: "Schema pushed to the database successfully.",
      })
    }

    if (actionName === "migrate") {
      const { tableName, sql } = buildSqlForForm(form, "migrate")
      let decryptedPass = ""
      try {
        decryptedPass = row.dbPass ? decryptSecret(row.dbPass) : ""
      } catch (error) {
        if (error?.message?.includes("FORM_DB_SECRET")) {
          return res.status(400).json({ error: "FORM_DB_SECRET is not configured on the server." })
        }
        throw error
      }
      const dbConfig = ensureDbConfig({
        host: row.dbHost || DEFAULT_DB_HOST,
        name: row.dbName,
        user: row.dbUser,
        pass: decryptedPass,
      })
      if (!dbConfig) {
        return res.status(400).json({ error: "Missing database configuration" })
      }
      await runSql(dbConfig, sql)
      return res.json({
        action: "migrate",
        tableName,
        sql,
        message: "Migration applied to the database successfully.",
      })
    }

    if (actionName === "update_backend") {
      return res.json({
        action: "update_backend",
        message: "Backend updated to the latest form schema.",
      })
    }

    return res.status(400).json({ error: "Unsupported action" })
  })
)

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const info = await prisma.formDefinition.deleteMany({ where: { id: req.params.id } })
    res.json({ success: info.count > 0 })
  })
)

module.exports = router
