const { OAuth2Client } = require("google-auth-library")
const { prisma } = require("../db")
const { upsertRecentUser } = require("../utils/recentUserUtils")
const { getAllowedEmailDomains } = require("../utils/authDomains")
const { verifyAppToken } = require("../utils/appJwt")
const { isDatabaseUnavailableError } = require("../utils/serviceErrors")

const normalizeToken = (value) => {
  if (!value) return null
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const parseTokenList = (value) =>
  String(value || "")
    .split(",")
    .map((token) => normalizeToken(token))
    .filter(Boolean)

const resolveAuthTokens = () => {
  const tokens = new Set()
  const single = normalizeToken(process.env.API_AUTH_TOKEN)
  if (single) tokens.add(single)
  parseTokenList(process.env.API_AUTH_TOKENS).forEach((token) => tokens.add(token))
  return tokens
}

const extractToken = (req) => {
  const authHeader = req.get("authorization")
  if (authHeader) {
    const [scheme, ...rest] = authHeader.split(" ")
    if (rest.length > 0) {
      const candidate = normalizeToken(rest.join(" "))
      if (candidate && (!scheme || scheme.toLowerCase() === "bearer")) {
        return candidate
      }
    }
    const raw = normalizeToken(authHeader)
    if (raw) return raw
  }

  const apiKeyHeaders = ["x-api-key", "x-api-token", "x-scouting-token", "x-scouting-auth", "x-id-token"]
  for (const header of apiKeyHeaders) {
    const value = normalizeToken(req.get(header))
    if (value) return value
  }

  const queryToken = normalizeToken(req.query?.api_key)
  if (queryToken) return queryToken

  return null
}

// Shared role/domain gate used by both the app-JWT path and the legacy
// Google path. Returns { ok: true } or { ok: false, status, error }.
const authorizeEmail = async (email, { skipDomainCheck, allowBlocked, allowPendingRole, allowedDomains }) => {
  const explicitRole = await prisma.role.findUnique({
    where: { email },
    select: { role: true },
  })
  if (explicitRole?.role === "blocked" && !allowBlocked) {
    return { ok: false, status: 403, error: "Forbidden" }
  }
  if (!skipDomainCheck && allowedDomains.size) {
    const domain = email.split("@")[1] || ""
    if (!domain || !allowedDomains.has(domain)) {
      if (!allowPendingRole && (!explicitRole || explicitRole.role === "pending")) {
        return { ok: false, status: 403, error: "Forbidden" }
      }
    }
  }
  return { ok: true, explicitRole }
}

// Every 401 carries a machine-readable reason so an outage can be told apart
// from a genuinely dead credential from the server log alone (morgan only
// prints the status, and all 401 bodies used to be byte-identical).
const reject = (req, res, reason, detail) => {
  // google-auth-library appends the decoded token payload (email, name) to
  // its error message; keep only the first clause so no PII lands in logs.
  const safeDetail = detail ? String(detail).split(/[:{]/)[0].trim().slice(0, 120) : ""
  console.warn(
    `[apiAuth] 401 ${req.method} ${req.originalUrl} reason=${reason}` + (safeDetail ? ` detail=${safeDetail}` : "")
  )
  return res.status(401).json({ error: "Unauthorized", reason })
}

// Our JWTs carry iss "maneuver-api"; Google's carry accounts.google.com.
const looksLikeAppToken = (token) => {
  try {
    const parts = String(token).split(".")
    if (parts.length !== 3) return false
    const claims = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"))
    return claims?.iss === "maneuver-api"
  } catch {
    return false
  }
}

// The identity was verified but the role lookup itself blew up. Express 4
// does not catch async rejections, so without this the request would hang
// until the client's own timeout — and the old code mapped it to 401.
const respondAuthorizationFailure = (res, error) => {
  if (isDatabaseUnavailableError(error)) {
    console.error("[apiAuth] database unavailable during authorization:", error?.message || error)
    return res.status(503).json({ error: "Service temporarily unavailable", reason: "database_unavailable" })
  }
  console.error("[apiAuth] authorization failed:", error)
  return res.status(500).json({ error: "Internal server error" })
}

// Every authenticated request used to do a read + write on recent_users,
// tripling database load during a bulk sync. "Last seen" only needs minute
// resolution, so write it at most once per interval per account.
const RECENT_USER_TOUCH_INTERVAL_MS = 5 * 60 * 1000
const lastTouchedAt = new Map()

const touchRecentUser = async (user, explicitRole, skipDomainCheck) => {
  const now = Date.now()
  const key = `${user.email}|${explicitRole?.role || ""}`
  if (now - (lastTouchedAt.get(key) || 0) < RECENT_USER_TOUCH_INTERVAL_MS) return
  try {
    await upsertRecentUser(prisma, {
      email: user.email,
      lastSeenAt: new Date().toISOString(),
      displayName: user.name || undefined,
      photoUrl: user.picture || undefined,
      acknowledged: skipDomainCheck ? undefined : (explicitRole?.role && explicitRole.role !== "pending" ? true : undefined),
    })
    // Only throttle after a successful write so a DB blip (or a failed first
    // registration) is retried on the next request instead of 5 minutes later.
    if (lastTouchedAt.size > 5000) lastTouchedAt.clear()
    lastTouchedAt.set(key, now)
  } catch (error) {
    console.warn("Failed to auto-upsert recent user from authenticated request", error?.message || error)
  }
}

const createApiAuthMiddleware = ({ skipDomainCheck = false, allowBlocked = false, allowPendingRole = false } = {}) => {
  const tokens = resolveAuthTokens()
  const disableGoogleAuth = normalizeToken(process.env.DISABLE_GOOGLE_ID_AUTH)
  const googleClientId = normalizeToken(process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID)
  const allowedDomains = new Set(getAllowedEmailDomains())
  const googleClient = !disableGoogleAuth && googleClientId ? new OAuth2Client(googleClientId) : null
  const requireAuth = tokens.size > 0 || Boolean(googleClient)

  if (!requireAuth) {
    return (_req, _res, next) => next()
  }

  return async (req, res, next) => {
    if (req.method === "OPTIONS") {
      return next()
    }

    const token = extractToken(req)
    if (token && tokens.has(token)) {
      req.userRole = "api_token"
      return next()
    }

    if (!token) {
      return reject(req, res, "no_token")
    }

    // Fast path: app-issued JWT from POST /auth/session. Verified locally
    // with an HMAC — no network round-trip to Google on every request.
    const appPayload = verifyAppToken(token)
    if (appPayload?.email) {
      const email = String(appPayload.email).toLowerCase()
      let authz
      try {
        authz = await authorizeEmail(email, { skipDomainCheck, allowBlocked, allowPendingRole, allowedDomains })
      } catch (error) {
        return respondAuthorizationFailure(res, error)
      }
      if (!authz.ok) {
        return res.status(authz.status).json({ error: authz.error })
      }
      req.user = {
        email,
        name: appPayload.name ? String(appPayload.name) : null,
        picture: appPayload.picture ? String(appPayload.picture) : null,
      }
      req.userRole = authz.explicitRole?.role || "pending"
      await touchRecentUser(req.user, authz.explicitRole, skipDomainCheck)
      return next()
    }

    // An app-signed token that failed verification is either expired or was
    // signed with a different AUTH_JWT_SECRET (server restarted without one).
    if (looksLikeAppToken(token)) {
      return reject(req, res, "app_token_invalid")
    }

    // Legacy path: raw Google ID token as bearer. Kept so old clients keep
    // working during rollout; new clients exchange it for an app JWT.
    if (!googleClient) {
      return reject(req, res, "google_auth_disabled")
    }
    // Only the Google verification itself may turn into a 401. Anything
    // that fails AFTER the identity is proven (our database) is our fault
    // and is reported as 503 so clients keep their session.
    let payload
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: googleClientId,
      })
      payload = ticket.getPayload()
    } catch (error) {
      const message = String(error?.message || "")
      const reason = /expired|used too late/i.test(message) ? "google_token_expired" : "google_token_invalid"
      return reject(req, res, reason, message)
    }
    const email = payload?.email ? String(payload.email).toLowerCase() : ""
    if (!email) {
      return reject(req, res, "google_token_no_email")
    }
    if (payload?.email_verified === false) {
      return res.status(403).json({ error: "Email not verified" })
    }
    let authz
    try {
      authz = await authorizeEmail(email, { skipDomainCheck, allowBlocked, allowPendingRole, allowedDomains })
    } catch (error) {
      return respondAuthorizationFailure(res, error)
    }
    if (!authz.ok) {
      return res.status(authz.status).json({ error: authz.error })
    }
    req.user = {
      email,
      name: payload?.name ? String(payload.name) : null,
      picture: payload?.picture ? String(payload.picture) : null,
    }
    req.userRole = authz.explicitRole?.role || "pending"
    await touchRecentUser(req.user, authz.explicitRole, skipDomainCheck)
    return next()
  }
}

module.exports = { createApiAuthMiddleware }
