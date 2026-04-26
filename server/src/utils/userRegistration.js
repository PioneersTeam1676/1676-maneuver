const { prisma } = require("../db")
const { nowSeconds } = require("./dbUtils")
const { sanitizeString, upsertRecentUser } = require("./recentUserUtils")
const { emailMatchesAllowedDomain } = require("./authDomains")

const ensureScoutRegistration = async ({ email, displayName, photoUrl }) => {
  const normalizedEmail = sanitizeString(email).toLowerCase()
  if (!normalizedEmail) return null

  const existingRole = await prisma.role.findUnique({
    where: { email: normalizedEmail },
    select: { role: true },
  })

  const domainDefaultRole = emailMatchesAllowedDomain(normalizedEmail) ? "scout" : "pending"
  let role = existingRole?.role || domainDefaultRole
  let changedRole = false

  if (!existingRole) {
    const timestamp = nowSeconds()
    await prisma.role.create({
      data: {
        email: normalizedEmail,
        role,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    })
    changedRole = true
  } else if (existingRole.role === "pending" && domainDefaultRole === "scout") {
    const timestamp = nowSeconds()
    await prisma.role.update({
      where: { email: normalizedEmail },
      data: {
        role: "scout",
        updatedAt: timestamp,
      },
    })
    role = "scout"
    changedRole = true
  }

  if (changedRole && role !== "pending" && role !== "blocked") {
    await prisma.verifiedUser.create({
      data: {
        email: normalizedEmail,
        role,
        verifiedAt: nowSeconds(),
      },
    })
  }

  await upsertRecentUser(prisma, {
    email: normalizedEmail,
    lastSeenAt: new Date().toISOString(),
    acknowledged: role !== "pending",
    displayName,
    photoUrl,
  })

  return role
}

module.exports = {
  ensureScoutRegistration,
}
