const fs = require("fs")
const os = require("os")
const path = require("path")

// The fallback signing key must survive a restart; a per-boot key signed
// every device out whenever the server (or its container) restarted.
describe("appJwt secret persistence", () => {
  const saved = { ...process.env }
  let dir

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "jwt-secret-"))
    delete process.env.AUTH_JWT_SECRET
    delete process.env.APP_SECRET
    delete process.env.FORM_DB_SECRET
    process.env.AUTH_JWT_SECRET_FILE = path.join(dir, "nested", ".auth-jwt-secret")
    jest.spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(() => {
    process.env = { ...saved }
    fs.rmSync(dir, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  test("a token signed before a restart still verifies after it", () => {
    let token
    jest.isolateModules(() => {
      token = require("../appJwt").signAppToken({ email: "scout@pascack.org" }).token
    })
    expect(fs.existsSync(process.env.AUTH_JWT_SECRET_FILE)).toBe(true)
    jest.isolateModules(() => {
      expect(require("../appJwt").verifyAppToken(token)?.email).toBe("scout@pascack.org")
    })
  })

  test("an explicit AUTH_JWT_SECRET wins and writes no file", () => {
    process.env.AUTH_JWT_SECRET = "explicit-secret"
    jest.isolateModules(() => {
      const { signAppToken, verifyAppToken } = require("../appJwt")
      expect(verifyAppToken(signAppToken({ email: "a@b.c" }).token)?.email).toBe("a@b.c")
    })
    expect(fs.existsSync(process.env.AUTH_JWT_SECRET_FILE)).toBe(false)
  })
})
