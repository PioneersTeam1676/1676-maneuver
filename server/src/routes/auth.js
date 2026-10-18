const express = require("express")
const { OAuth2Client } = require("google-auth-library")
const { prisma } = require("../db")
const asyncHandler = require("../utils/asyncHandler")
const { isDatabaseUnavailableError } = require("../utils/serviceErrors")
const {
  ACCESS_TOKEN_TTL_SECONDS,
  signAppToken,
  verifyAppToken,
  signRefreshToken,
  hashRefreshToken,
} = require("../utils/appJwt")
const { ensureConfiguredAdmins, getConfiguredRole } = require("../utils/configuredAdmins")

// Backend session endpoints.
//
// Why this exists: Google ID tokens expire after ~1 hour and cannot be
// refreshed offline. At a competition venue with bad WiFi that meant every
// device lost its session an hour after login. Instead, the client trades
// its Google token ONCE for:
//   - an app-signed access token (JWT, 5-day expiry — outlives an event)
//   - a signed refresh token (valid until logout)
// POST /auth/refresh exchanges the refresh token for a fresh access token
// with no Google round-trip, so sessions survive as long as the device
// occasionally reaches OUR server — no Google connectivity needed.
//
// Neither endpoint REQUIRES MySQL. Signing in while the database was down
// used to fail the exchange, leaving the client on its raw 1-hour Google
// token — an hour later every request 401'd and scouts saw "Session
// expired" even though the real problem was the database. The database is
// only consulted for revocations (logout) and blocked accounts, and those
// checks fail open when it is unreachable; the per-request middleware
// re-checks roles anyway (and answers 503 while the DB is down).

const router = express.Router()

// Runtime-schema pattern (see seasonDb.js): create tables on first use so no
// manual migration step is required. auth_sessions only serves legacy
// opaque refresh tokens issued before signed ones existed.
const tableReady = new Map()
const ensureTable = (name, ddl) => {
  if (!tableReady.has(name)) {
    tableReady.set(
      name,
      prisma.$executeRawUnsafe(ddl).catch((error) => {
        tableReady.delete(name)
        throw error
      })
    )
  }
  return tableReady.get(name)
}

const ensureAuthSessionTable = () =>
  ensureTable(
    "auth_sessions",
    `CREATE TABLE IF NOT EXISTS auth_sessions (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      token_hash VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255) NULL,
      picture VARCHAR(512) NULL,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      last_used_at BIGINT NOT NULL,
      UNIQUE KEY uniq_auth_sessions_token_hash (token_hash),
      KEY idx_auth_sessions_email (email)
    )`
  )

const ensureRevokedTable = () =>
  ensureTable(
    "auth_revoked_sessions",
    `CREATE TABLE IF NOT EXISTS auth_revoked_sessions (
      sid VARCHAR(64) NOT NULL PRIMARY KEY,
      revoked_at BIGINT NOT NULL
    )`
  )

const normalize = (value) => {
  if (typeof value !== "string") return ""
  return value.trim()
}

const googleClientId = normalize(process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID)
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null

// Runs a database check that may be skipped while MySQL is unreachable.
// Returns `fallback` on an outage; any other error still propagates.
const failOpen = async (label, fallback, fn) => {
  try {
    return await fn()
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) throw error
    console.warn(`[auth] database unavailable, skipping ${label}:`, error?.message || error)
    return fallback
  }
}

const isBlocked = (email) =>
  failOpen("blocked-account check", false, async () => {
    const explicitRole = await prisma.role.findUnique({ where: { email }, select: { role: true } })
    return explicitRole?.role === "blocked"
  })

const isRevoked = (sid) =>
  failOpen("revocation check", false, async () => {
    await ensureRevokedTable()
    const rows = await prisma.$queryRawUnsafe(`SELECT sid FROM auth_revoked_sessions WHERE sid = ? LIMIT 1`, sid)
    return Array.isArray(rows) && rows.length > 0
  })

const toUser = ({ email, name, picture }) => ({
  email,
  name: name ? String(name) : null,
  picture: picture ? String(picture) : null,
})

const issueAccessToken = (user) => {
  const { token: accessToken, expiresAt: accessTokenExpiresAt } = signAppToken(
    { email: user.email, name: user.name || undefined, picture: user.picture || undefined },
    { expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS }
  )
  return { accessToken, accessTokenExpiresAt, user }
}

// Legacy opaque refresh tokens live in auth_sessions. They need the
// database; an outage answers 503 so the client keeps the token and retries.
const lookupLegacySession = async (refreshToken) => {
  await ensureAuthSessionTable()
  const tokenHash = hashRefreshToken(refreshToken)
  const rows = await prisma.$queryRawUnsafe(
    `SELECT email, name, picture FROM auth_sessions WHERE token_hash = ? LIMIT 1`,
    tokenHash
  )
  const session = Array.isArray(rows) ? rows[0] : null
  if (!session) return null
  await prisma
    .$executeRawUnsafe(`UPDATE auth_sessions SET last_used_at = ? WHERE token_hash = ?`, Date.now(), tokenHash)
    .catch(() => {})
  return toUser({ ...session, email: String(session.email || "").toLowerCase() })
}

const databaseUnavailable = (res) =>
  res.status(503).json({ error: "Service temporarily unavailable", reason: "database_unavailable" })

// Exchange a (still-valid) Google ID token for an app session. This is the
// ONLY place the server talks to Google.
router.post(
  "/session",
  asyncHandler(async (req, res) => {
    const idToken = normalize(req.body?.idToken)
    if (!idToken) {
      return res.status(400).json({ error: "idToken is required" })
    }
    if (!googleClient) {
      return res.status(503).json({ error: "Google auth is not configured on the server" })
    }

    let payload
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: googleClientId,
      })
      payload = ticket.getPayload()
    } catch {
      return res.status(401).json({ error: "Invalid Google token" })
    }

    const email = payload?.email ? String(payload.email).toLowerCase() : ""
    if (!email) {
      return res.status(401).json({ error: "Google token has no email" })
    }
    if (payload?.email_verified === false) {
      return res.status(403).json({ error: "Email not verified" })
    }

    // Blocked users get no session at all. Other role/domain checks stay in
    // the per-request middleware (roles can change mid-session).
    if (await isBlocked(email)) {
      return res.status(403).json({ error: "Forbidden" })
    }

    // A configured admin signing in for the first time on a fresh database
    // must not be stuck without a role (see configuredAdmins.js).
    if (getConfiguredRole(email)) {
      await failOpen("configured admin bootstrap", 0, () => ensureConfiguredAdmins(prisma))
    }

    const user = toUser({ email, name: payload?.name, picture: payload?.picture })
    res.json({
      ...issueAccessToken(user),
      refreshToken: signRefreshToken(user),
      refreshTokenExpiresAt: null,
    })
  })
)

// Exchange a refresh token for a new access token. No Google involved, so
// this works on venue WiFi that can reach our server but not the internet.
router.post(
  "/refresh",
  asyncHandler(async (req, res) => {
    const refreshToken = normalize(req.body?.refreshToken)
    if (!refreshToken) {
      return res.status(400).json({ error: "refreshToken is required" })
    }

    let user
    const claims = verifyAppToken(refreshToken, { typ: "refresh" })
    if (claims) {
      if (!claims.email || !claims.sid || (await isRevoked(String(claims.sid)))) {
        return res.status(401).json({ error: "Invalid refresh token" })
      }
      user = toUser({ email: String(claims.email).toLowerCase(), name: claims.name, picture: claims.picture })
    } else {
      try {
        user = await lookupLegacySession(refreshToken)
      } catch (error) {
        if (isDatabaseUnavailableError(error)) return databaseUnavailable(res)
        throw error
      }
      if (!user) {
        return res.status(401).json({ error: "Invalid refresh token" })
      }
    }

    if (await isBlocked(user.email)) {
      return res.status(403).json({ error: "Forbidden" })
    }
    res.json(issueAccessToken(user))
  })
)

// Invalidate a refresh token on logout. Best-effort — if the database is
// down the token stays technically valid, but the client already deleted it.
router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const refreshToken = normalize(req.body?.refreshToken)
    if (refreshToken) {
      const claims = verifyAppToken(refreshToken, { typ: "refresh" })
      const revoke = claims?.sid
        ? ensureRevokedTable().then(() =>
            prisma.$executeRawUnsafe(
              `INSERT IGNORE INTO auth_revoked_sessions (sid, revoked_at) VALUES (?, ?)`,
              String(claims.sid),
              Date.now()
            )
          )
        : ensureAuthSessionTable().then(() =>
            prisma.$executeRawUnsafe(`DELETE FROM auth_sessions WHERE token_hash = ?`, hashRefreshToken(refreshToken))
          )
      await revoke.catch((error) => {
        console.warn("[auth] failed to revoke refresh token:", error?.message || error)
      })
    }
    res.json({ success: true })
  })
)

module.exports = router
