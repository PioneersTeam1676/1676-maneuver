const path = require("path")
const dotenv = require("dotenv")

dotenv.config({ path: path.resolve(__dirname, "../../.env") })
dotenv.config({ path: path.resolve(__dirname, "../.env") })
dotenv.config()
const express = require("express")
const cors = require("cors")
const morgan = require("morgan")
const fs = require("fs/promises")

const rolesRouter = require("./routes/roles")
const scoutingRouter = require("./routes/scouting")
const pitRouter = require("./routes/pit")
const gameRouter = require("./routes/game")
const eventsRouter = require("./routes/events")
const recentUsersRouter = require("./routes/recentUsers")
const verifiedUsersRouter = require("./routes/verifiedUsers")
const scheduleRouter = require("./routes/schedule")
const pushRouter = require("./routes/push")
const formsRouter = require("./routes/forms")
const webhookSyncRouter = require("./routes/webhookSync")
const { createApiAuthMiddleware } = require("./middleware/apiAuth")
const { scheduleBackups } = require("./backupManager")
const { databaseInfo } = require("./db")
const { initWebhookSync } = require("./webhookSyncManager")
const { imageStorageDir } = require("./utils/imagePermalinkStore")

const compression = require("compression")

const app = express()
const PORT = process.env.PORT || 4000
const ALLOWED_ORIGIN = process.env.CORS_ORIGIN || "*"
const API_BASE_PATH = process.env.API_BASE_PATH || "/api"
const EXTRA_API_PREFIXES = process.env.EXTRA_API_PREFIXES || ""

const normalizePrefix = (prefix) => {
  if (!prefix || typeof prefix !== "string") return "/api"
  let value = prefix.trim()
  if (!value.startsWith("/")) {
    value = `/${value}`
  }
  if (value.length > 1 && value.endsWith("/")) {
    value = value.slice(0, -1)
  }
  return value
}

const prefixSet = new Set([normalizePrefix(API_BASE_PATH), "/api", "/scouting"])

EXTRA_API_PREFIXES.split(",")
  .map((value) => value.trim())
  .filter(Boolean)
  .forEach((prefix) => {
    prefixSet.add(normalizePrefix(prefix))
  })

const routePrefixes = Array.from(prefixSet)

const parseCorsOrigins = (value) => {
  if (!value) return true
  const trimmed = value.trim()
  if (trimmed === "*" || trimmed === '"*"') {
    return true
  }
  return trimmed
    .split(",")
    .map((origin) => normalizeOrigin(origin.trim().replace(/^"|"$/g, "")))
    .filter(Boolean)
}

const normalizeOrigin = (origin) => {
  if (!origin || typeof origin !== "string") return null
  return origin.trim().replace(/\/+$/, "")
}

const isLocalhostOrigin = (origin) => {
  try {
    const url = new URL(origin)
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1"
  } catch {
    return false
  }
}

const corsOrigins = parseCorsOrigins(ALLOWED_ORIGIN)
const defaultCorsOrigins = ["https://scouting.team1676.org", "https://api.team1676.org"]
  .map(normalizeOrigin)
  .filter(Boolean)

const extractOrigin = (value) => {
  try {
    if (!value) return null
    const url = new URL(value)
    return url.origin
  } catch {
    return null
  }
}

if (Array.isArray(corsOrigins)) {
  defaultCorsOrigins.forEach((origin) => {
    if (origin && !corsOrigins.includes(origin)) {
      corsOrigins.push(origin)
    }
  })
  const appUrlOrigin = extractOrigin(process.env.VITE_APP_URL || process.env.APP_URL)
  if (appUrlOrigin && !corsOrigins.includes(appUrlOrigin)) {
    corsOrigins.push(appUrlOrigin)
  }
}

const isAllowedOrigin = (origin) => {
  if (!origin) return true
  if (isLocalhostOrigin(origin)) return true
  if (corsOrigins === true) return true
  const normalized = normalizeOrigin(origin)
  if (!normalized) return false
  if (Array.isArray(corsOrigins)) {
    return corsOrigins.includes(normalized)
  }
  return normalizeOrigin(corsOrigins) === normalized
}

app.enable("trust proxy")

const corsOptions = {
  origin: (origin, callback) => {
    callback(null, isAllowedOrigin(origin))
  },
  credentials: true,
  methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
  preflightContinue: false,
  optionsSuccessStatus: 204,
}

app.use(compression())
app.use(cors(corsOptions))
app.options("*", cors(corsOptions))

app.use(express.json({ limit: "5mb" }))
app.use(morgan("dev"))

// Backward-compat alias:
// old pit image links could include a field suffix (e.g. 3314-field.png).
// Serve those files when the new canonical path (/images/pit/<event>/<team>.png) is requested.
app.get("/images/pit/:eventCode/:filename", async (req, res, next) => {
  try {
    const eventCode = String(req.params.eventCode || "")
    const filename = String(req.params.filename || "")

    if (!eventCode || !filename.toLowerCase().endsWith(".png")) {
      return next()
    }

    const ext = ".png"
    const base = filename.slice(0, -ext.length)
    const duplicateMatch = base.match(/^(.*)-(\d+)$/)
    const legacyCandidates = duplicateMatch
      ? [`${duplicateMatch[1]}-field-${duplicateMatch[2]}${ext}`, `${base}-field${ext}`]
      : [`${base}-field${ext}`]

    for (const legacyFilename of legacyCandidates) {
      const legacyPath = path.join(imageStorageDir, "pit", eventCode, legacyFilename)
      try {
        await fs.access(legacyPath)
        return res.sendFile(legacyPath)
      } catch {
        // keep trying fallback candidates
      }
    }

    return next()
  } catch {
    return next()
  }
})
app.use("/images", express.static(imageStorageDir))

const apiAuthMiddleware = createApiAuthMiddleware()

const registerRoutes = (prefix = "") => {
  const resolvePath = (suffix) => {
    if (!prefix) return suffix
    return `${prefix}${suffix}`
  }

  app.get(resolvePath("/health"), (_req, res) => {
    res.json({ status: "ok", database: databaseInfo, basePath: prefix || "/" })
  })

  app.use(resolvePath("/roles"), apiAuthMiddleware, rolesRouter)
  app.use(resolvePath("/scouting"), apiAuthMiddleware, scoutingRouter)
  app.use(resolvePath("/pit"), apiAuthMiddleware, pitRouter)
  app.use(resolvePath("/game"), apiAuthMiddleware, gameRouter)
  app.use(resolvePath("/events"), apiAuthMiddleware, eventsRouter)
  app.use(resolvePath("/recent-users"), apiAuthMiddleware, recentUsersRouter)
  app.use(resolvePath("/verified-users"), apiAuthMiddleware, verifiedUsersRouter)
  app.use(resolvePath("/schedule"), apiAuthMiddleware, scheduleRouter)
  app.use(resolvePath("/push"), apiAuthMiddleware, pushRouter)
  app.use(resolvePath("/forms"), apiAuthMiddleware, formsRouter)
  app.use(resolvePath("/webhook-sync"), apiAuthMiddleware, webhookSyncRouter)
}

for (const prefix of routePrefixes) {
  registerRoutes(prefix)
}

registerRoutes("")

app.use((err, _req, res, _next) => {
  console.error("API error", err)
  res.status(500).json({ error: "Internal server error" })
})

scheduleBackups()
initWebhookSync().catch((error) => {
  console.error("Failed to initialize webhook sync", error)
})

const shutdown = async () => {
  try {
    const { prisma } = require("./db")
    await prisma.$disconnect()
  } catch (error) {
    console.warn("Failed to disconnect Prisma", error)
  }
}

process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)

app.listen(PORT, () => {
  console.log(`Maneuver API listening on port ${PORT}`)
})
