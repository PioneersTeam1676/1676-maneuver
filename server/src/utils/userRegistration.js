const { prisma } = require("../db")
const { nowSeconds } = require("./dbUtils")
const { sanitizeString, upsertRecentUser } = require("./recentUserUtils")

const ensureScoutRegistration = async ({ email, displayName, photoUrl }) => {
  const normalizedEmail = sanitizeString(email).toLowerCase()
  if (!normalizedEmail) return null

  const existingRole = await prisma.role.findUnique({
    where: { email: normalizedEmail },
    select: { role: true },
  })

  let role = existingRole?.role || "pending"
  let changedRole = false

  if (!existingRole) {
    const timestamp = nowSeconds()
    await prisma.role.create({
      data: {
        email: normalizedEmail,
        role: "pending",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    })
    role = "pending"
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
