const { PrismaClient } = require("@prisma/client")

const buildDatabaseUrl = () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  const host = process.env.DB_HOST || "localhost"
  const port = process.env.DB_PORT || "3306"
  const name = process.env.DB_NAME || "maneuver"
  const user = process.env.DB_USER || "root"
  const password = process.env.DB_PASSWORD || ""

  const encodedUser = encodeURIComponent(user)
  const encodedPass = encodeURIComponent(password)
  const auth = user ? `${encodedUser}:${encodedPass}@` : ""

  return `mysql://${auth}${host}:${port}/${name}`
}

const databaseUrl = buildDatabaseUrl()
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
})

const databaseInfo = {
  engine: "mysql",
  host: process.env.DB_HOST || null,
  name: process.env.DB_NAME || null,
}

module.exports = {
  prisma,
  databaseUrl,
  databaseInfo,
}
