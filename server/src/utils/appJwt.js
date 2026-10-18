const crypto = require("crypto")
const fs = require("fs")
const path = require("path")

// App-issued JWTs (HS256) replace per-request Google ID token verification.
// Google tokens expire after ~1 hour with no way to refresh offline, which
// killed sessions mid-competition. The server now verifies Google ONCE at
// login (POST /auth/session) and signs its own long-lived token with this
// helper. Implemented with node:crypto instead of the `jsonwebtoken` package
// so there is no extra dependency to keep patched.

// Access tokens must outlive a full multi-day competition (Thu-Sun + slack).
const ACCESS_TOKEN_TTL_SECONDS = 5 * 24 * 60 * 60 // 5 days
// Refresh tokens persist until logout so access-token renewal never requires
// a scout to sign in again just because time has passed.

let cachedSecret = null

// Where the generated fallback secret is kept when AUTH_JWT_SECRET is unset.
// server/data is the Docker volume, so the key survives container rebuilds.
const SECRET_FILE = process.env.AUTH_JWT_SECRET_FILE
  ? path.resolve(process.env.AUTH_JWT_SECRET_FILE)
  : path.resolve(__dirname, "../../data/.auth-jwt-secret")

const loadOrCreateSecretFile = () => {
  try {
    const existing = fs.readFileSync(SECRET_FILE, "utf8").trim()
    if (existing.length >= 32) return existing
  } catch {
    // missing or unreadable: create below
  }
  const generated = crypto.randomBytes(48).toString("hex")
  try {
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true })
    fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 })
    console.warn(
      `[appJwt] AUTH_JWT_SECRET not set: generated a signing key and saved it to ${SECRET_FILE}. ` +
        "Sessions survive restarts as long as that file is kept."
    )
    return generated
  } catch (error) {
    console.warn(
      "[appJwt] AUTH_JWT_SECRET not set and the key file could not be written " +
        `(${error?.message || error}). Using a random per-boot secret: every server restart will sign everyone out. ` +
        "Set AUTH_JWT_SECRET in the environment to fix this."
    )
    return null
  }
}

const resolveJwtSecret = () => {
  if (cachedSecret) return cachedSecret
  const configured =
    process.env.AUTH_JWT_SECRET || process.env.APP_SECRET || process.env.FORM_DB_SECRET
  const material = configured && String(configured).trim() ? String(configured).trim() : loadOrCreateSecretFile()
  cachedSecret = material
    ? crypto.createHash("sha256").update(material).digest()
    : crypto.randomBytes(32)
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
// has been tampered with, is expired, or is of the wrong kind (a refresh
// token must never be accepted as a bearer access token). Never throws.
const verifyAppToken = (token, { typ = "access" } = {}) => {
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
    // Access tokens predate the typ claim, so a missing typ means access.
    if ((payload.typ || "access") !== typ) return null
    return payload
  } catch {
    return null
  }
}

// Refresh tokens are signed, so /auth/session and /auth/refresh keep working
// while MySQL is unreachable. The database only holds revocations (logout);
// `sid` is the revocation handle. Long expiry = "valid until logout".
const REFRESH_TOKEN_TTL_SECONDS = 10 * 365 * 24 * 60 * 60

const signRefreshToken = (payload) =>
  signAppToken(
    { ...payload, typ: "refresh", sid: crypto.randomBytes(16).toString("hex") },
    { expiresInSeconds: REFRESH_TOKEN_TTL_SECONDS }
  ).token

// Legacy opaque refresh tokens are random bytes; only a SHA-256 hash is stored in
// the database so a leaked DB dump cannot be replayed as live tokens.
const generateRefreshToken = () => crypto.randomBytes(48).toString("hex")

const hashRefreshToken = (token) =>
  crypto.createHash("sha256").update(String(token)).digest("hex")

module.exports = {
  ACCESS_TOKEN_TTL_SECONDS,
  signAppToken,
  verifyAppToken,
  signRefreshToken,
  generateRefreshToken,
  hashRefreshToken,
}
