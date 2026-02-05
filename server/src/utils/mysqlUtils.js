const mysql = require("mysql2/promise")

const toNumber = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ""), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const buildMysqlConfig = (dbConfig) => ({
  host: dbConfig.host,
  port: toNumber(dbConfig.port, 3306),
  user: dbConfig.user,
  password: dbConfig.pass || "",
  database: dbConfig.name,
  multipleStatements: true,
  connectTimeout: 10000,
})

const runSql = async (dbConfig, sql, options = {}) => {
  if (!sql || !sql.trim()) return
  const connection = await mysql.createConnection(buildMysqlConfig(dbConfig))
  try {
    const { splitStatements = false, ignoreErrors = [] } = options
    if (!splitStatements) {
      await connection.query(sql)
      return
    }
    const ignoreSet = new Set(ignoreErrors)
    const statements = sql
      .split(";")
      .map((statement) => statement.trim())
      .filter(Boolean)
    for (const statement of statements) {
      try {
        await connection.query(statement)
      } catch (error) {
        if (ignoreSet.has(error?.code)) {
          continue
        }
        throw error
      }
    }
  } finally {
    await connection.end()
  }
}

module.exports = {
  runSql,
}
