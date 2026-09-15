// Classifies errors that mean "the backend cannot serve anyone right now"
// (MySQL unreachable, connection pool exhausted) so routes and middleware
// answer 503 instead of 500 or, worse, 401.
//
// Why it matters: the client treats 401 as "your session is dead" and starts
// a Google re-login loop. A database outage must never look like that.

const PRISMA_UNAVAILABLE_CODES = new Set([
  "P1001", // Can't reach database server
  "P1002", // Database server reached but timed out
  "P1008", // Operations timed out
  "P1017", // Server has closed the connection
  "P2024", // Timed out fetching a new connection from the pool
])

const SOCKET_UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EAI_AGAIN",
])

const isDatabaseUnavailableError = (error) => {
  if (!error || typeof error !== "object") return false
  const name = String(error.name || error.constructor?.name || "")
  if (name === "PrismaClientInitializationError") return true
  const code = typeof error.code === "string" ? error.code : ""
  if (PRISMA_UNAVAILABLE_CODES.has(code)) return true
  if (SOCKET_UNAVAILABLE_CODES.has(code)) return true
  const message = String(error.message || "")
  return /can't reach database server|database server .* not running/i.test(message)
}

const resolveErrorResponse = (error) => {
  if (isDatabaseUnavailableError(error)) {
    return {
      status: 503,
      body: { error: "Service temporarily unavailable", reason: "database_unavailable" },
    }
  }
  return { status: 500, body: { error: "Internal server error" } }
}

module.exports = { isDatabaseUnavailableError, resolveErrorResponse }
