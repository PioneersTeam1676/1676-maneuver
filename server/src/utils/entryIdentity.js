const ensuredSchemas = new WeakMap()

const normalizeEmail = (value) => {
  if (typeof value !== "string") return null
  const trimmed = value.trim().toLowerCase()
  return trimmed && trimmed.includes("@") ? trimmed : null
}

const ensureColumn = async (prisma, tableName, columnName, columnSql) => {
  const columns = await prisma.$queryRawUnsafe(
    `SHOW COLUMNS FROM ${tableName} LIKE '${columnName}'`,
  )
  if (Array.isArray(columns) && columns.length) {
    return
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnSql}`,
  )
}

const ensureIndex = async (prisma, tableName, indexName, columnsSql) => {
  const indexes = await prisma.$queryRawUnsafe(
    `SHOW INDEX FROM ${tableName} WHERE Key_name = '${indexName}'`,
  )
  if (Array.isArray(indexes) && indexes.length) {
    return
  }

  await prisma.$executeRawUnsafe(
    `CREATE INDEX ${indexName} ON ${tableName} (${columnsSql})`,
  )
}

const ensureEntryIdentitySchema = async (prisma) => {
  if (ensuredSchemas.has(prisma)) {
    await ensuredSchemas.get(prisma)
    return
  }

  const promise = (async () => {
    await ensureColumn(prisma, "scouting_entries", "scout_email", "VARCHAR(255) NULL")
    await ensureIndex(prisma, "scouting_entries", "idx_scouting_scout_email", "scout_email")

    await ensureColumn(prisma, "pit_entries", "scout_email", "VARCHAR(255) NULL")
    await ensureIndex(prisma, "pit_entries", "idx_pit_scout_email", "scout_email")
  })().catch((error) => {
    ensuredSchemas.delete(prisma)
    throw error
  })

  ensuredSchemas.set(prisma, promise)
  await promise
}

const updateScoutingEntryEmail = async (prisma, clientId, scoutEmail) => {
  const normalizedEmail = normalizeEmail(scoutEmail)
  if (!clientId || !normalizedEmail) return
  await ensureEntryIdentitySchema(prisma)
  await prisma.$executeRawUnsafe(
    "UPDATE scouting_entries SET scout_email = ? WHERE client_id = ?",
    normalizedEmail,
    String(clientId),
  )
}

const updatePitEntryEmail = async (prisma, entryId, scoutEmail) => {
  const normalizedEmail = normalizeEmail(scoutEmail)
  if (!entryId || !normalizedEmail) return
  await ensureEntryIdentitySchema(prisma)
  await prisma.$executeRawUnsafe(
    "UPDATE pit_entries SET scout_email = ? WHERE id = ?",
    normalizedEmail,
    String(entryId),
  )
}

const ENTRY_TABLES = {
  scouting: { table: "scouting_entries", idColumn: "client_id" },
  pit: { table: "pit_entries", idColumn: "id" },
}
const OWNER_LOOKUP_CHUNK = 500

// Of `ids`, the ones that are already stored and were NOT submitted by
// `email` (including legacy rows with no recorded submitter). Used to stop
// callers who aren't approved from overwriting someone else's entry via the
// id-keyed upserts.
const findEntriesOwnedByOthers = async (prisma, kind, ids, email) => {
  const { table, idColumn } = ENTRY_TABLES[kind]
  const owner = normalizeEmail(email)
  const unique = [...new Set(ids.map(String))]
  const foreign = []
  for (let i = 0; i < unique.length; i += OWNER_LOOKUP_CHUNK) {
    const chunk = unique.slice(i, i + OWNER_LOOKUP_CHUNK)
    const rows = await prisma.$queryRawUnsafe(
      `SELECT ${idColumn} AS entry_id, scout_email FROM ${table} WHERE ${idColumn} IN (${chunk.map(() => "?").join(",")})`,
      ...chunk,
    )
    rows.forEach((row) => {
      if (!owner || normalizeEmail(row.scout_email) !== owner) foreign.push(String(row.entry_id))
    })
  }
  return foreign
}

module.exports = {
  findEntriesOwnedByOthers,
  ensureEntryIdentitySchema,
  normalizeEmail,
  updateScoutingEntryEmail,
  updatePitEntryEmail,
}
