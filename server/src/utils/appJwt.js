const crypto = require("crypto")

// App-issued JWTs (HS256) replace per-request Google ID token verification.
// Google tokens expire after ~1 hour with no way to refresh offline, which
// killed sessions mid-competition. The server now verifies Google ONCE at
// login (POST /auth/session) and signs its own long-lived token with this
// helper. Implemented with node:crypto instead of the `jsonwebtoken` package
// so there is no extra dependency to keep patched.

// Access tokens must outlive a full multi-day competition (Thu-Sun + slack).
const ACCESS_TOKEN_TTL_SECONDS = 5 * 24 * 60 * 60 // 5 days
// Refresh tokens let a device re-establish a session without re-prompting
// Google. Long enough to cover a whole season of events.
const REFRESH_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60 // 60 days

let cachedSecret = null

const resolveJwtSecret = () => {
  if (cachedSecret) return cachedSecret
  const configured =
    process.env.AUTH_JWT_SECRET || process.env.APP_SECRET || process.env.FORM_DB_SECRET
  if (configured && String(configured).trim()) {
    cachedSecret = crypto.createHash("sha256").update(String(configured).trim()).digest()
    return cachedSecret
  }
  // No secret configured: generate a random one for this process. Tokens
  // survive until the server restarts, then clients silently re-auth via
  // their refresh token / Google. Warn so ops can set AUTH_JWT_SECRET.
  console.warn(
    "[appJwt] AUTH_JWT_SECRET not set — using a random per-boot secret. " +
      "Access tokens will be invalidated on every server restart. " +
      "Set AUTH_JWT_SECRET in the environment to fix this."
  )
  cachedSecret = crypto.randomBytes(32)
  return cachedSecret
}

const base64UrlEncode = (input) =>
  Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

const base64UrlDecode = (input) => {
  const normalized = String(input).replace(/-/g, "+").replace(/_/g, "/")
  return Buffer.from(normalized, "base64")
}

const hmacSign = (data) =>
  crypto.createHmac("sha256", resolveJwtSecret()).update(data).digest()

const signAppToken = (payload, { expiresInSeconds = ACCESS_TOKEN_TTL_SECONDS } = {}) => {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const body = {
    ...payload,
    iss: "maneuver-api",
    iat: nowSeconds,
    exp: nowSeconds + expiresInSeconds,
  }
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const claims = base64UrlEncode(JSON.stringify(body))
  const signature = base64UrlEncode(hmacSign(`${header}.${claims}`))
  return { token: `${header}.${claims}.${signature}`, expiresAt: body.exp * 1000 }
}

// Returns the decoded payload, or null when the token is not one of ours,
// has been tampered with, or is expired. Never throws.
const verifyAppToken = (token) => {
  try {
    if (typeof token !== "string") return null
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const [header, claims, signature] = parts

    const headerJson = JSON.parse(base64UrlDecode(header).toString("utf8"))
    if (headerJson.alg !== "HS256") return null

    const expected = hmacSign(`${header}.${claims}`)
    const provided = base64UrlDecode(signature)
    if (
      expected.length !== provided.length ||
      !crypto.timingSafeEqual(expected, provided)
    ) {
      return null
    }

    const payload = JSON.parse(base64UrlDecode(claims).toString("utf8"))
    if (payload.iss !== "maneuver-api") return null
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

// Opaque refresh tokens are random bytes; only a SHA-256 hash is stored in
// the database so a leaked DB dump cannot be replayed as live tokens.
const generateRefreshToken = () => crypto.randomBytes(48).toString("hex")

const hashRefreshToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex")

module.exports = {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  signAppToken,
  verifyAppToken,
  generateRefreshToken,
  hashRefreshToken,
}
