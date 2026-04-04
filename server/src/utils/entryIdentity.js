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

module.exports = {
  ensureEntryIdentitySchema,
  normalizeEmail,
  updateScoutingEntryEmail,
  updatePitEntryEmail,
}
