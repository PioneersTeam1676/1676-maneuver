const {
  signAppToken,
  verifyAppToken,
  generateRefreshToken,
  hashRefreshToken,
} = require("../appJwt")

describe("appJwt", () => {
  test("sign/verify round-trip preserves the payload", () => {
    const { token, expiresAt } = signAppToken({ email: "scout@pascack.org", name: "Scout" })
    expect(expiresAt).toBeGreaterThan(Date.now())

    const payload = verifyAppToken(token)
    expect(payload).not.toBeNull()
    expect(payload.email).toBe("scout@pascack.org")
    expect(payload.name).toBe("Scout")
    expect(payload.iss).toBe("maneuver-api")
  })

  test("rejects a tampered payload", () => {
    const { token } = signAppToken({ email: "scout@pascack.org" })
    const [header, claims, signature] = token.split(".")
    const forged = Buffer.from(
      JSON.stringify({ email: "attacker@evil.com", iss: "maneuver-api", exp: Math.floor(Date.now() / 1000) + 3600 })
    )
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
    expect(verifyAppToken(`${header}.${forged}.${signature}`)).toBeNull()
    expect(verifyAppToken(`${header}.${claims}.AAAA`)).toBeNull()
  })

  test("rejects an expired token", () => {
    const { token } = signAppToken({ email: "scout@pascack.org" }, { expiresInSeconds: -10 })
    expect(verifyAppToken(token)).toBeNull()
  })

  test("rejects garbage input without throwing", () => {
    expect(verifyAppToken(null)).toBeNull()
    expect(verifyAppToken("")).toBeNull()
    expect(verifyAppToken("not.a.jwt")).toBeNull()
    expect(verifyAppToken("a.b")).toBeNull()
  })

  test("refresh tokens are unique and hash deterministically", () => {
    const a = generateRefreshToken()
    const b = generateRefreshToken()
    expect(a).not.toBe(b)
    expect(a).toHaveLength(96)
    expect(hashRefreshToken(a)).toBe(hashRefreshToken(a))
    expect(hashRefreshToken(a)).not.toBe(hashRefreshToken(b))
  })
})
