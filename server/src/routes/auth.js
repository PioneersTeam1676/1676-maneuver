const express = require("express")
const { OAuth2Client } = require("google-auth-library")
const { prisma } = require("../db")
const asyncHandler = require("../utils/asyncHandler")
const {
  ACCESS_TOKEN_TTL_SECONDS,
  signAppToken,
  generateRefreshToken,
  hashRefreshToken,
} = require("../utils/appJwt")

// Backend session endpoints.
//
// Why this exists: Google ID tokens expire after ~1 hour and cannot be
// refreshed offline. At a competition venue with bad WiFi that meant every
// device lost its session an hour after login. Instead, the client trades
// its Google token ONCE for:
//   - an app-signed access token (JWT, 5-day expiry — outlives an event)
//   - an opaque refresh token (valid until logout, stored hashed in auth_sessions)
// POST /auth/refresh exchanges the refresh token for a fresh access token
// with no Google round-trip, so sessions survive as long as the device
// occasionally reaches OUR server — no Google connectivity needed.

const router = express.Router()

let sessionTableReady = null

// Follows the repo's existing runtime-schema pattern (see seasonDb.js):
// create the table on first use so no manual migration step is required.
const ensureAuthSessionTable = () => {
  if (!sessionTableReady) {
    sessionTableReady = prisma
      .$executeRawUnsafe(
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
      .catch((error) => {
        sessionTableReady = null
        throw error
      })
  }
  return sessionTableReady
}

const normalize = (value) => {
  if (typeof value !== "string") return ""
  return value.trim()
}

const googleClientId = normalize(process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID)
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null

const issueSession = async ({ email, name, picture }) => {
  await ensureAuthSessionTable()

  const now = Date.now()
  const refreshToken = generateRefreshToken()

  await prisma.$executeRawUnsafe(
    `INSERT INTO auth_sessions (token_hash, email, name, picture, created_at, expires_at, last_used_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    hashRefreshToken(refreshToken),
    email,
    name || null,
    picture || null,
    now,
    0, // Retain the legacy NOT NULL column; sessions no longer expire by age.
    now
  )

  const { token: accessToken, expiresAt: accessTokenExpiresAt } = signAppToken(
    { email, name: name || undefined, picture: picture || undefined },
    { expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS }
  )

  return {
    accessToken,
    accessTokenExpiresAt,
    refreshToken,
    refreshTokenExpiresAt: null,
    user: { email, name: name || null, picture: picture || null },
  }
}

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
    const explicitRole = await prisma.role.findUnique({
      where: { email },
      select: { role: true },
    })
    if (explicitRole?.role === "blocked") {
      return res.status(403).json({ error: "Forbidden" })
    }

    const session = await issueSession({
      email,
      name: payload?.name ? String(payload.name) : null,
      picture: payload?.picture ? String(payload.picture) : null,
    })
    res.json(session)
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

    await ensureAuthSessionTable()

    const tokenHash = hashRefreshToken(refreshToken)
    const rows = await prisma.$queryRawUnsafe(
      `SELECT email, name, picture FROM auth_sessions WHERE token_hash = ? LIMIT 1`,
      tokenHash
    )
    const session = Array.isArray(rows) ? rows[0] : null
    if (!session) {
      return res.status(401).json({ error: "Invalid refresh token" })
    }
    // Existing sessions also stay signed in: ignore their legacy expires_at.
    // Logout still deletes the row, and blocked accounts cannot refresh.

    const email = String(session.email || "").toLowerCase()
    const explicitRole = await prisma.role.findUnique({
      where: { email },
      select: { role: true },
    })
    if (explicitRole?.role === "blocked") {
      return res.status(403).json({ error: "Forbidden" })
    }

    await prisma
      .$executeRawUnsafe(`UPDATE auth_sessions SET last_used_at = ? WHERE token_hash = ?`, Date.now(), tokenHash)
      .catch(() => {})

    const { token: accessToken, expiresAt: accessTokenExpiresAt } = signAppToken(
      {
        email,
        name: session.name ? String(session.name) : undefined,
        picture: session.picture ? String(session.picture) : undefined,
      },
      { expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS }
    )

    res.json({
      accessToken,
      accessTokenExpiresAt,
      user: { email, name: session.name || null, picture: session.picture || null },
    })
  })
)

// Invalidate a refresh token on logout. Best-effort — losing the row is the
// worst case and that just forces a fresh Google login.
router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const refreshToken = normalize(req.body?.refreshToken)
    if (refreshToken) {
      await ensureAuthSessionTable()
      await prisma
        .$executeRawUnsafe(`DELETE FROM auth_sessions WHERE token_hash = ?`, hashRefreshToken(refreshToken))
        .catch(() => {})
    }
    res.json({ success: true })
  })
)

module.exports = router
