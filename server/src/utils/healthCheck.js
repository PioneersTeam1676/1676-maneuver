// Real liveness probe for /health. The old handler answered 200 while MySQL
// was unreachable, which hid a full outage behind a green check.

const DEFAULT_TIMEOUT_MS = 3000

const checkDatabaseHealth = async (prisma, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) => {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Database health check timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
  })
  try {
    await Promise.race([prisma.$queryRawUnsafe("SELECT 1"), timeout])
    return { status: "ok" }
  } catch (error) {
    // Prisma prepends the failing invocation to its message; keep the
    // human-readable last line only.
    const raw = String(error?.message || error || "unknown error")
    const message = raw.split("\n").map((line) => line.trim()).filter(Boolean).pop() || raw
    return { status: "unreachable", error: message }
  } finally {
    clearTimeout(timer)
  }
}

module.exports = { checkDatabaseHealth }
