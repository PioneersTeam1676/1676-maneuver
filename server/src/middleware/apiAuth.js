const { OAuth2Client } = require("google-auth-library")

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

const parseDomainList = (value) =>
  String(value || "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)

const resolveAllowedDomains = () => {
  const domains = new Set()
  parseDomainList(process.env.ALLOWED_EMAIL_DOMAIN).forEach((domain) => domains.add(domain))
  parseDomainList(process.env.VITE_ALLOWED_EMAIL_DOMAIN).forEach((domain) => domains.add(domain))
  return domains
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

  return null
}

const createApiAuthMiddleware = ({ skipDomainCheck = false } = {}) => {
  const tokens = resolveAuthTokens()
  const disableGoogleAuth = normalizeToken(process.env.DISABLE_GOOGLE_ID_AUTH)
  const googleClientId = normalizeToken(process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID)
  const allowedDomains = resolveAllowedDomains()
  const googleClient = !disableGoogleAuth && googleClientId ? new OAuth2Client(googleClientId) : null
  const requireAuth = tokens.size > 0 || Boolean(googleClient)

  if (!requireAuth) {
    return (_req, _res, next) => next()
  }

  return async (req, res, next) => {
    if (req.method === "OPTIONS") {
      return next()
    }

    // Self-registration writes (PUT to recent-users) are always allowed —
    // no token needed so non-domain users can record their sign-in.
    if (skipDomainCheck && req.method === "PUT") {
      return next()
    }

    const token = extractToken(req)
    if (!token || !tokens.has(token)) {
      if (!googleClient) {
        return res.status(401).json({ error: "Unauthorized" })
      }
      try {
        const ticket = await googleClient.verifyIdToken({
          idToken: token,
          audience: googleClientId,
        })
        const payload = ticket.getPayload()
        const email = payload?.email ? String(payload.email).toLowerCase() : ""
        if (!email) {
          return res.status(401).json({ error: "Unauthorized" })
        }
        if (payload?.email_verified === false) {
          return res.status(403).json({ error: "Email not verified" })
        }
        if (!skipDomainCheck && allowedDomains.size) {
          const domain = email.split("@")[1] || ""
          if (!domain || !allowedDomains.has(domain)) {
            return res.status(403).json({ error: "Forbidden" })
          }
        }
        req.user = { email }
        return next()
      } catch (_error) {
        return res.status(401).json({ error: "Unauthorized" })
      }
    }

    return next()
  }
}

module.exports = { createApiAuthMiddleware }
