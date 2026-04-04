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

  let role = existingRole?.role || "scout"
  let changedRole = false

  if (!existingRole) {
    const timestamp = nowSeconds()
    await prisma.role.create({
      data: {
        email: normalizedEmail,
        role: "scout",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    })
    role = "scout"
    changedRole = true
  } else if (existingRole.role === "pending") {
    await prisma.role.update({
      where: { email: normalizedEmail },
      data: {
        role: "scout",
        updatedAt: nowSeconds(),
      },
    })
    role = "scout"
    changedRole = true
  }

  if (changedRole && role !== "pending") {
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
    acknowledged: true,
    displayName,
    photoUrl,
  })

  return role
}

module.exports = {
  ensureScoutRegistration,
}
