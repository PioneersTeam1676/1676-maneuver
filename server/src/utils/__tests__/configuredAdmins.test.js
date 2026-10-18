const { ensureConfiguredAdmins, getConfiguredRole } = require("../configuredAdmins")

describe("configured admins", () => {
  const saved = { ...process.env }
  afterEach(() => {
    process.env = { ...saved }
  })

  const makePrisma = (rows) => ({
    role: {
      findUnique: jest.fn(async ({ where }) => (rows[where.email] ? { role: rows[where.email] } : null)),
      upsert: jest.fn(async ({ where, create }) => {
        rows[where.email] = create.role
      }),
    },
  })

  test("resolves configured roles from env", () => {
    process.env.VITE_GOOGLE_ADMIN_EMAIL = "Boss@Team.org"
    process.env.ADMIN_EMAILS = "lead@team.org, boss@team.org"
    expect(getConfiguredRole("boss@team.org")).toBe("tech_lead")
    expect(getConfiguredRole("lead@team.org")).toBe("lead")
    expect(getConfiguredRole("scout@team.org")).toBeNull()
  })

  test("bootstraps a fresh database and never demotes", async () => {
    process.env.ULTRA_ADMIN_EMAILS = "boss@team.org"
    process.env.ADMIN_EMAILS = "lead@team.org,already@team.org"
    const rows = { "already@team.org": "tech_lead" }
    const prisma = makePrisma(rows)
    await ensureConfiguredAdmins(prisma)
    expect(rows).toEqual({
      "boss@team.org": "tech_lead",
      "lead@team.org": "lead",
      "already@team.org": "tech_lead",
    })
  })
})
