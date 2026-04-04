const sanitizeString = (value) => {
  if (typeof value !== "string") return ""
  return value.trim()
}

const parseIso = (value) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const upsertRecentUser = async (
  prisma,
  {
    email,
    firstSeenAt,
    lastSeenAt,
    acknowledged,
    displayName,
    photoUrl,
  }
) => {
  const normalizedEmail = sanitizeString(email).toLowerCase()
  if (!normalizedEmail) {
    throw new Error("Email is required")
  }

  const firstSeen = sanitizeString(firstSeenAt) || new Date().toISOString()
  const lastSeen = sanitizeString(lastSeenAt) || firstSeen
  const trimmedName = sanitizeString(displayName)
  const trimmedPhoto = sanitizeString(photoUrl)
  const hasAcknowledgedValue = typeof acknowledged !== "undefined"
  const ackValue = acknowledged === true || acknowledged === "true" || acknowledged === 1

  const existing = await prisma.recentUser.findUnique({ where: { email: normalizedEmail } })

  if (!existing) {
    return prisma.recentUser.create({
      data: {
        email: normalizedEmail,
        firstSeenAt: firstSeen,
        lastSeenAt: lastSeen,
        acknowledged: hasAcknowledgedValue ? ackValue : false,
        displayName: trimmedName || null,
        photoUrl: trimmedPhoto || null,
      },
    })
  }

  const existingFirst = parseIso(existing.firstSeenAt) || new Date(firstSeen)
  const existingLast = parseIso(existing.lastSeenAt) || new Date(lastSeen)
  const incomingFirst = parseIso(firstSeen) || existingFirst
  const incomingLast = parseIso(lastSeen) || existingLast

  const nextFirst = existingFirst <= incomingFirst ? existing.firstSeenAt : firstSeen
  const nextLast = existingLast >= incomingLast ? existing.lastSeenAt : lastSeen
  const nextAck = hasAcknowledgedValue ? existing.acknowledged || ackValue : existing.acknowledged

  return prisma.recentUser.update({
    where: { email: normalizedEmail },
    data: {
      firstSeenAt: nextFirst,
      lastSeenAt: nextLast,
      acknowledged: nextAck,
      displayName: trimmedName || existing.displayName,
      photoUrl: trimmedPhoto || existing.photoUrl,
    },
  })
}

module.exports = {
  sanitizeString,
  parseIso,
  upsertRecentUser,
}
