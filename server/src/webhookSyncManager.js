const { prisma } = require("./db")
const { nowSeconds } = require("./utils/dbUtils")

const WEBHOOK_INTERVALS = new Set([1, 5, 10, 20])
const DEFAULT_INTERVAL_MINUTES = 5
const MAX_BODY_LENGTH = 2000

let intervalHandle = null
let inFlight = false

const toIso = (seconds) => {
  if (!seconds) return null
  return new Date(seconds * 1000).toISOString()
}

const sanitizeInterval = (value) => {
  const numeric = Number(value)
  if (WEBHOOK_INTERVALS.has(numeric)) return numeric
  return DEFAULT_INTERVAL_MINUTES
}

const ensureWebhookSyncTable = async (prismaClient) => {
  await prismaClient.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS webhook_sync_settings (
      id INT PRIMARY KEY,
      enabled TINYINT(1) NOT NULL DEFAULT 0,
      interval_minutes INT NOT NULL DEFAULT ${DEFAULT_INTERVAL_MINUTES},
      last_run_at INT NULL,
      last_status INT NULL,
      last_ok TINYINT(1) NULL,
      last_duration_ms INT NULL,
      last_body LONGTEXT NULL,
      last_error VARCHAR(512) NULL,
      updated_at INT NOT NULL
    )`
  )
}

const ensureWebhookSyncRow = async (prismaClient) => {
  await ensureWebhookSyncTable(prismaClient)
  const rows = await prismaClient.$queryRaw`
    SELECT id,
      enabled,
      interval_minutes as intervalMinutes,
      last_run_at as lastRunAt,
      last_status as lastStatus,
      last_ok as lastOk,
      last_duration_ms as lastDurationMs,
      last_body as lastBody,
      last_error as lastError,
      updated_at as updatedAt
    FROM webhook_sync_settings
    WHERE id = 1
  `
  if (rows.length > 0) {
    return rows[0]
  }
  const now = nowSeconds()
  await prismaClient.$executeRaw`
    INSERT INTO webhook_sync_settings (id, enabled, interval_minutes, updated_at)
    VALUES (1, 0, ${DEFAULT_INTERVAL_MINUTES}, ${now})
  `
  return {
    id: 1,
    enabled: 0,
    intervalMinutes: DEFAULT_INTERVAL_MINUTES,
    lastRunAt: null,
    lastStatus: null,
    lastOk: null,
    lastDurationMs: null,
    lastBody: null,
    lastError: null,
    updatedAt: now,
  }
}

const ensureActiveFormTable = async (prismaClient) => {
  await prismaClient.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS active_form_settings (
      id INT PRIMARY KEY,
      match_form_id VARCHAR(255) NULL,
      pit_form_id VARCHAR(255) NULL,
      updated_at INT NOT NULL
    )`
  )
}

const ensureActiveFormRow = async (prismaClient) => {
  await ensureActiveFormTable(prismaClient)
  const rows = await prismaClient.$queryRaw`
    SELECT id, match_form_id as matchFormId, pit_form_id as pitFormId, updated_at as updatedAt
    FROM active_form_settings
    WHERE id = 1
  `
  if (rows.length > 0) {
    return rows[0]
  }
  const now = nowSeconds()
  await prismaClient.$executeRaw`
    INSERT INTO active_form_settings (id, match_form_id, pit_form_id, updated_at)
    VALUES (1, NULL, NULL, ${now})
  `
  return { id: 1, matchFormId: null, pitFormId: null, updatedAt: now }
}

const ensureFormDefinitionWebhookColumns = async (prismaClient) => {
  const tableRows = await prismaClient.$queryRaw`
    SELECT TABLE_NAME as tableName
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'form_definitions'
    LIMIT 1
  `
  if (!Array.isArray(tableRows) || tableRows.length === 0) {
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
}

const getActiveMatchFormId = async () => {
  const row = await ensureActiveFormRow(prisma)
  const id = row?.matchFormId || row?.match_form_id
  return typeof id === "string" && id.trim() ? id.trim() : null
}

const getWebhookConfig = async () => {
  await ensureFormDefinitionWebhookColumns(prisma)
  const activeMatchFormId = await getActiveMatchFormId()
  if (!activeMatchFormId) {
    return { error: "No active match form is set.", activeFormId: null }
  }
  const form = await prisma.formDefinition.findUnique({ where: { id: activeMatchFormId } })
  if (!form) {
    return { error: "Active match form not found.", activeFormId: activeMatchFormId }
  }
  const url = String(form.webhookUrl || "").trim()
  if (!url) {
    return { error: "Webhook URL is not configured for the active form.", activeFormId: activeMatchFormId }
  }
  const method = String(form.webhookMethod || "GET").trim().toUpperCase() || "GET"
  const authHeader = String(form.webhookAuthHeader || "").trim()
  return { url, method, authHeader, activeFormId: activeMatchFormId }
}

const formatStatus = (row, activeFormId) => ({
  enabled: Boolean(row?.enabled),
  intervalMinutes: Number(row?.intervalMinutes) || DEFAULT_INTERVAL_MINUTES,
  lastRunAt: toIso(row?.lastRunAt),
  lastStatus: row?.lastStatus ?? null,
  lastOk: row?.lastOk == null ? null : Boolean(row.lastOk),
  lastDurationMs: row?.lastDurationMs ?? null,
  lastBody: row?.lastBody ?? null,
  lastError: row?.lastError ?? null,
  activeFormId: activeFormId ?? null,
})

const updateWebhookRow = async (payload) => {
  const now = nowSeconds()
  const normalized = {
    enabled: payload.enabled ? 1 : 0,
    intervalMinutes: Number(payload.intervalMinutes) || DEFAULT_INTERVAL_MINUTES,
    lastRunAt: payload.lastRunAt ?? null,
    lastStatus: payload.lastStatus ?? null,
    lastOk: payload.lastOk ?? null,
    lastDurationMs: payload.lastDurationMs ?? null,
    lastBody: payload.lastBody ?? null,
    lastError: payload.lastError ?? null,
  }
  await prisma.$executeRaw`
    UPDATE webhook_sync_settings
    SET enabled = ${normalized.enabled},
        interval_minutes = ${normalized.intervalMinutes},
        last_run_at = ${normalized.lastRunAt},
        last_status = ${normalized.lastStatus},
        last_ok = ${normalized.lastOk},
        last_duration_ms = ${normalized.lastDurationMs},
        last_body = ${normalized.lastBody},
        last_error = ${normalized.lastError},
        updated_at = ${now}
    WHERE id = 1
  `
}

const runWebhookOnce = async () => {
  if (inFlight) {
    return { skipped: true }
  }
  inFlight = true
  const startedAt = Date.now()
  const now = nowSeconds()
  const existing = await ensureWebhookSyncRow(prisma)
  const currentInterval = Number(existing.intervalMinutes) || DEFAULT_INTERVAL_MINUTES
  const currentEnabled = existing.enabled ? 1 : 0
  try {
    const config = await getWebhookConfig()
    if (config.error) {
      await updateWebhookRow({
        enabled: currentEnabled,
        intervalMinutes: currentInterval,
        lastRunAt: now,
        lastStatus: null,
        lastOk: 0,
        lastDurationMs: Date.now() - startedAt,
        lastBody: "",
        lastError: config.error,
      })
      return { ok: false, error: config.error, activeFormId: config.activeFormId || null }
    }

    const headers = {}
    if (config.authHeader) {
      headers.Authorization = config.authHeader
    }
    const response = await fetch(config.url, { method: config.method, headers })
    let bodyText = ""
    try {
      bodyText = await response.text()
    } catch {
      bodyText = ""
    }
    const trimmedBody = bodyText.length > MAX_BODY_LENGTH ? `${bodyText.slice(0, MAX_BODY_LENGTH)}…` : bodyText
    const durationMs = Date.now() - startedAt
    await updateWebhookRow({
      enabled: currentEnabled,
      intervalMinutes: currentInterval,
      lastRunAt: nowSeconds(),
      lastStatus: response.status,
      lastOk: response.ok ? 1 : 0,
      lastDurationMs: durationMs,
      lastBody: trimmedBody,
      lastError: response.ok ? "" : `HTTP ${response.status}`,
    })
    return { ok: response.ok, activeFormId: config.activeFormId }
  } catch (error) {
    await updateWebhookRow({
      enabled: currentEnabled,
      intervalMinutes: currentInterval,
      lastRunAt: now,
      lastStatus: null,
      lastOk: 0,
      lastDurationMs: Date.now() - startedAt,
      lastBody: "",
      lastError: error instanceof Error ? error.message : "Unknown error",
    })
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" }
  } finally {
    inFlight = false
  }
}

const startInterval = (minutes) => {
  if (intervalHandle) {
    clearInterval(intervalHandle)
  }
  const intervalMs = minutes * 60 * 1000
  intervalHandle = setInterval(() => {
    void runWebhookOnce()
  }, intervalMs)
}

const stopInterval = () => {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
  }
}

const getStatus = async () => {
  const row = await ensureWebhookSyncRow(prisma)
  const activeFormId = await getActiveMatchFormId()
  return formatStatus(row, activeFormId)
}

const startSync = async (intervalMinutes) => {
  const row = await ensureWebhookSyncRow(prisma)
  const sanitized = sanitizeInterval(intervalMinutes ?? row.intervalMinutes)
  await updateWebhookRow({
    enabled: 1,
    intervalMinutes: sanitized,
    lastRunAt: row.lastRunAt,
    lastStatus: row.lastStatus,
    lastOk: row.lastOk,
    lastDurationMs: row.lastDurationMs,
    lastBody: row.lastBody,
    lastError: row.lastError,
  })
  startInterval(sanitized)
  await runWebhookOnce()
  return getStatus()
}

const stopSync = async () => {
  const row = await ensureWebhookSyncRow(prisma)
  await updateWebhookRow({
    enabled: 0,
    intervalMinutes: row.intervalMinutes || DEFAULT_INTERVAL_MINUTES,
    lastRunAt: row.lastRunAt,
    lastStatus: row.lastStatus,
    lastOk: row.lastOk,
    lastDurationMs: row.lastDurationMs,
    lastBody: row.lastBody,
    lastError: row.lastError,
  })
  stopInterval()
  return getStatus()
}

const testSync = async () => {
  const row = await ensureWebhookSyncRow(prisma)
  if (!row.enabled) {
    await runWebhookOnce()
  } else {
    await runWebhookOnce()
  }
  return getStatus()
}

const initWebhookSync = async () => {
  const row = await ensureWebhookSyncRow(prisma)
  if (row.enabled) {
    const minutes = sanitizeInterval(row.intervalMinutes)
    startInterval(minutes)
  }
}

module.exports = {
  getStatus,
  startSync,
  stopSync,
  testSync,
  initWebhookSync,
}
