const { OAuth2Client } = require("google-auth-library")
const { prisma } = require("../db")
const { upsertRecentUser } = require("../utils/recentUserUtils")
const { getAllowedEmailDomains } = require("../utils/authDomains")

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
        const explicitRole = await prisma.role.findUnique({
          where: { email },
          select: { role: true },
        })
        if (explicitRole?.role === "blocked" && !allowBlocked) {
          return res.status(403).json({ error: "Forbidden" })
        }
        if (!skipDomainCheck && allowedDomains.size) {
          const domain = email.split("@")[1] || ""
          if (!domain || !allowedDomains.has(domain)) {
            if (!allowPendingRole && (!explicitRole || explicitRole.role === "pending")) {
              return res.status(403).json({ error: "Forbidden" })
            }
          }
        }
        req.user = {
          email,
          name: payload?.name ? String(payload.name) : null,
          picture: payload?.picture ? String(payload.picture) : null,
        }
        try {
          await upsertRecentUser(prisma, {
            email,
            lastSeenAt: new Date().toISOString(),
            displayName: payload?.name ? String(payload.name) : undefined,
            photoUrl: payload?.picture ? String(payload.picture) : undefined,
            acknowledged: skipDomainCheck ? undefined : (explicitRole?.role && explicitRole.role !== "pending" ? true : undefined),
          })
        } catch (error) {
          console.warn("Failed to auto-upsert recent user from authenticated request", error?.message || error)
        }
        return next()
      } catch (_error) {
        return res.status(401).json({ error: "Unauthorized" })
      }
    }

    return next()
  }
}

module.exports = { createApiAuthMiddleware }
