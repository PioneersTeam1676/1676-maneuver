const webpush = require("web-push")
const { prisma: mainPrisma } = require("../db")
const { getSeasonPrisma, resolveSeasonSelector } = require("../seasonDb")
const { normalizeEmail, parseMatchOrder } = require("../utils/scheduleUtils")
const { parseJsonValue, stringifyJsonValue, nowSeconds } = require("../utils/dbUtils")

const POSITION_DETAILS = {
  "red-1": { alliance: "red", label: "Red 1", slotIndex: 0 },
  "red-2": { alliance: "red", label: "Red 2", slotIndex: 1 },
  "red-3": { alliance: "red", label: "Red 3", slotIndex: 2 },
  "blue-1": { alliance: "blue", label: "Blue 1", slotIndex: 0 },
  "blue-2": { alliance: "blue", label: "Blue 2", slotIndex: 1 },
  "blue-3": { alliance: "blue", label: "Blue 3", slotIndex: 2 },
}
const POSITION_KEYS = Object.keys(POSITION_DETAILS)

const MATCH_LOOKAHEAD_DEFAULT = 5
const parsePositiveInteger = (value) => {
  if (value == null) return undefined
  const parsed = Number.parseInt(String(value).trim(), 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

const MATCH_NOTIFICATION_LOOKAHEAD =
  parsePositiveInteger(process.env.MATCH_NOTIFICATION_LOOKAHEAD) ??
  parsePositiveInteger(process.env.VITE_MATCH_NOTIFICATION_LOOKAHEAD) ??
  MATCH_LOOKAHEAD_DEFAULT

const ensureMailto = (value) => {
  if (!value) {
    return "mailto:scouting@example.com"
  }
  if (value.startsWith("mailto:")) {
    return value
  }
  return `mailto:${value}`
}

const normalizeName = (value = "") => value.replace(/\s+/g, " ").trim().toLowerCase()

const vapidPublic = process.env.VAPID_PUBLIC_KEY
const vapidPrivate = process.env.VAPID_PRIVATE_KEY
const vapidContact = ensureMailto(process.env.VAPID_CONTACT_EMAIL || process.env.CONTACT_EMAIL || process.env.SUPPORT_EMAIL)

let pushEnabled = false

if (vapidPublic && vapidPrivate) {
  try {
    webpush.setVapidDetails(vapidContact, vapidPublic, vapidPrivate)
    pushEnabled = true
  } catch (error) {
    console.warn("Failed to initialize web push", error)
  }
} else {
  console.warn("Push notifications disabled: missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY")
}

const getActiveSeasonPrisma = async () => {
  const { prisma } = await getSeasonPrisma()
  return prisma
}

const getSeasonPrismaForEvent = async (eventKey) => {
  const selector = resolveSeasonSelector({ eventKey })
  const { prisma } = await getSeasonPrisma(selector)
  return prisma
}

const storeSubscription = async ({ email, subscription, userAgent }) => {
  if (!subscription || typeof subscription !== "object") {
    throw new Error("subscription payload required")
  }
  const endpoint = subscription.endpoint
  if (!endpoint) {
    throw new Error("subscription endpoint missing")
  }
  const normalizedEmail = email ? normalizeEmail(email) : null
  const keys = subscription.keys || {}
  const now = nowSeconds()

  await mainPrisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      email: normalizedEmail || null,
      endpoint,
      p256dh: keys.p256dh || null,
      auth: keys.auth || null,
      dataJson: stringifyJsonValue(subscription, {}),
      userAgent: userAgent || null,
      createdAt: now,
      lastUsed: now,
    },
    update: {
      email: normalizedEmail || null,
      p256dh: keys.p256dh || null,
      auth: keys.auth || null,
      dataJson: stringifyJsonValue(subscription, {}),
      userAgent: userAgent || null,
      lastUsed: now,
    }
  })

  if (normalizedEmail) {
    const seasonPrisma = await getActiveSeasonPrisma()
    await seasonPrisma.scheduleNotification.deleteMany({ where: { scoutEmail: normalizedEmail } })
  }

  return { success: true }
}

const removeSubscription = async (endpoint) => {
  if (!endpoint) return { success: false }
  const info = await mainPrisma.pushSubscription.deleteMany({ where: { endpoint } })
  return { success: info.count > 0 }
}

const fetchSubscriptions = async (email) => {
  return mainPrisma.pushSubscription.findMany({ where: { email } })
}

const touchSubscription = async (id) => {
  await mainPrisma.pushSubscription.update({
    where: { id },
    data: { lastUsed: nowSeconds() },
  })
}

const clearNotificationsForEmail = async (email) => {
  const seasonPrisma = await getActiveSeasonPrisma()
  await seasonPrisma.scheduleNotification.deleteMany({ where: { scoutEmail: email } })
}

const upsertProgress = async ({ eventKey, matchOrder }) => {
  const seasonPrisma = await getSeasonPrismaForEvent(eventKey)
  const existing = await seasonPrisma.scheduleProgress.findUnique({ where: { eventKey } })
  const nextMatchOrder = existing
    ? Math.max(existing.lastCompletedMatch, matchOrder)
    : matchOrder
  const now = nowSeconds()

  if (!existing) {
    await seasonPrisma.scheduleProgress.create({
      data: { eventKey, lastCompletedMatch: nextMatchOrder, lastUpdated: now }
    })
    return
  }

  await seasonPrisma.scheduleProgress.update({
    where: { eventKey },
    data: { lastCompletedMatch: nextMatchOrder, lastUpdated: now }
  })
}

const fetchProgress = async (eventKey) => {
  const seasonPrisma = await getSeasonPrismaForEvent(eventKey)
  return seasonPrisma.scheduleProgress.findUnique({ where: { eventKey } })
}

const loadAssignments = async (eventKey) => {
  const seasonPrisma = await getSeasonPrismaForEvent(eventKey)
  return seasonPrisma.scoutScheduleAssignment.findMany({
    where: {
      eventKey,
      matchOrder: { not: null }
    },
    orderBy: [{ matchOrder: "asc" }, { position: "asc" }]
  })
}

const loadAssignmentsForReturn = async (eventKey) => {
  const seasonPrisma = await getSeasonPrismaForEvent(eventKey)
  return seasonPrisma.scoutScheduleAssignment.findMany({
    where: { eventKey },
    orderBy: [{ matchOrder: "asc" }, { position: "asc" }]
  })
}

const loadMatches = async (eventKey) => {
  const seasonPrisma = await getSeasonPrismaForEvent(eventKey)
  return seasonPrisma.scoutScheduleMatch.findMany({
    where: { eventKey },
    orderBy: { matchNumber: "asc" }
  })
}

const latestEventKey = async () => {
  const seasonPrisma = await getActiveSeasonPrisma()
  const latest = await seasonPrisma.scoutScheduleAssignment.findFirst({
    orderBy: { updatedAt: "desc" },
    select: { eventKey: true }
  })
  return latest?.eventKey || null
}

const removeSubscriptionById = async (id) => {
  await mainPrisma.pushSubscription.deleteMany({ where: { id } })
}

const markNotificationSent = async (eventKey, matchNumber, scoutEmail) => {
  const seasonPrisma = await getSeasonPrismaForEvent(eventKey)
  await seasonPrisma.scheduleNotification.upsert({
    where: {
      eventKey_matchNumber_scoutEmail: {
        eventKey,
        matchNumber,
        scoutEmail,
      }
    },
    create: {
      eventKey,
      matchNumber,
      scoutEmail,
      sentAt: nowSeconds(),
    },
    update: {
      sentAt: nowSeconds(),
    }
  })
}

const insertManualLog = async ({ tag, email }) => {
  const seasonPrisma = await getActiveSeasonPrisma()
  await seasonPrisma.scheduleNotification.upsert({
    where: {
      eventKey_matchNumber_scoutEmail: {
        eventKey: "manual",
        matchNumber: tag,
        scoutEmail: email,
      }
    },
    create: {
      eventKey: "manual",
      matchNumber: tag,
      scoutEmail: email,
      sentAt: nowSeconds(),
    },
    update: {
      sentAt: nowSeconds(),
    }
  })
}

const findAssignmentsInRange = (assignments, startOrder, endOrder) => {
  return assignments.filter((assignment) => {
    if (assignment.matchOrder == null) return false
    return assignment.matchOrder > startOrder && assignment.matchOrder <= endOrder
  })
}

const pickTeamForPosition = (details, position) => {
  if (!details) return undefined
  const meta = POSITION_DETAILS[position]
  if (!meta) return undefined
  const teams = meta.alliance === "red" ? details.redTeams : details.blueTeams
  if (!Array.isArray(teams)) return undefined
  return teams[meta.slotIndex]
}

const parseTeams = (raw) => {
  if (!raw) return []
  return parseJsonValue(raw, [])
}

const buildMatchDetailsMap = async (eventKey) => {
  const rows = await loadMatches(eventKey)
  const map = new Map()
  rows.forEach((row) => {
    map.set(row.matchNumber, {
      startTime: row.startTime || undefined,
      redTeams: parseTeams(row.redTeams),
      blueTeams: parseTeams(row.blueTeams),
    })
  })
  return map
}

const sendNotificationToSubscription = async (subscriptionRecord, payload) => {
  if (!pushEnabled) {
    return false
  }
  try {
    const parsed = subscriptionRecord.dataJson
      ? parseJsonValue(subscriptionRecord.dataJson, null)
      : null
    const subscription =
      parsed ||
      {
        endpoint: subscriptionRecord.endpoint,
        keys: {
          p256dh: subscriptionRecord.p256dh,
          auth: subscriptionRecord.auth,
        },
      }

    await webpush.sendNotification(subscription, JSON.stringify(payload))
    await touchSubscription(subscriptionRecord.id)
    return true
  } catch (error) {
    const status = error?.statusCode
    if (status === 404 || status === 410) {
      await removeSubscriptionById(subscriptionRecord.id)
      console.warn("Removed expired push subscription", subscriptionRecord.endpoint)
    } else {
      console.warn("Failed to send push notification", error)
    }
    return false
  }
}

const processUpcomingNotifications = async (eventKey) => {
  if (!pushEnabled) return
  if (!eventKey) return

  const progressRow = await fetchProgress(eventKey)
  const completed = progressRow?.lastCompletedMatch ?? 0
  const windowEnd = completed + MATCH_NOTIFICATION_LOOKAHEAD
  const assignments = await loadAssignments(eventKey)
  const eligible = findAssignmentsInRange(assignments, completed, windowEnd)
  if (eligible.length === 0) {
    return
  }

  const matchDetails = await buildMatchDetailsMap(eventKey)
  const sentResults = []

  for (const assignment of eligible) {
    const email = normalizeEmail(assignment.scoutEmail || "")
    if (!email || email === "unassigned" || !email.includes("@")) {
      continue
    }

    const subscriptions = await fetchSubscriptions(email)
    if (!subscriptions.length) {
      continue
    }

    const matchInfo = matchDetails.get(assignment.matchNumber) || { startTime: assignment.startTime }
    const meta = POSITION_DETAILS[assignment.position] || { label: assignment.position }
    const teamNumber = pickTeamForPosition(matchInfo, assignment.position)
    const matchesAway = Math.max((assignment.matchOrder || 0) - completed, 1)
    const matchesLabel = matchesAway === 1 ? "match" : "matches"

    const bodyParts = [`You're scheduled as ${meta.label || assignment.position}.`]
    if (teamNumber) {
      bodyParts.push(`Keep an eye on team ${teamNumber}.`)
    }
    if (matchInfo?.startTime) {
      bodyParts.push(`Scheduled for ${matchInfo.startTime}.`)
    }

    const payload = {
      title: `Match ${assignment.matchNumber} in ${matchesAway} ${matchesLabel}`,
      body: bodyParts.join(" "),
      tag: `match-${eventKey}-${assignment.matchNumber}-${email}`,
      data: {
        url: "/game-start",
        eventKey,
        matchNumber: assignment.matchNumber,
        position: assignment.position,
      },
      actions: [
        { action: "open", title: "Open match flow" },
      ],
    }

    const results = await Promise.all(subscriptions.map((sub) => sendNotificationToSubscription(sub, payload)))
    if (results.some(Boolean)) {
      await markNotificationSent(eventKey, assignment.matchNumber, email)
    }
    sentResults.push(...results)
  }

  return sentResults.some(Boolean)
}

const updateMatchProgress = async (eventKey, matchNumber) => {
  const normalizedEvent = eventKey?.trim()
  if (!normalizedEvent) return
  const order = parseMatchOrder(matchNumber)
  if (order == null) return
  await upsertProgress({ eventKey: normalizedEvent, matchOrder: order })
  await processUpcomingNotifications(normalizedEvent)
}

const sendManualNotification = async ({ email, title, body, url, tag }) => {
  if (!pushEnabled) {
    return { success: false, reason: "push_disabled" }
  }

  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return { success: false, reason: "invalid_email" }
  }

  const subscriptions = await fetchSubscriptions(normalizedEmail)
  if (!subscriptions.length) {
    return { success: false, reason: "no_subscriptions" }
  }

  const payload = {
    title: title?.trim() || "Scouting alert",
    body: body?.trim() || "You have a new message from an admin.",
    tag: tag || `manual-${Date.now()}`,
    data: {
      url: url || "/",
      email: normalizedEmail,
    },
    actions: [{ action: "open", title: "Open app" }],
  }

  const results = await Promise.all(subscriptions.map((sub) => sendNotificationToSubscription(sub, payload)))
  const deliveredCount = results.filter(Boolean).length

  if (deliveredCount > 0) {
    await insertManualLog({ tag: payload.tag, email: normalizedEmail })
  }

  return {
    success: deliveredCount > 0,
    deliveredCount,
    attempted: subscriptions.length,
    reason: deliveredCount > 0 ? undefined : "delivery_failed",
  }
}

const replaceScheduleAssignments = async ({ eventKey, matches = [], assignments = [], aliases = {} }) => {
  const normalizedEvent = eventKey?.trim()
  if (!normalizedEvent) {
    throw new Error("eventKey is required")
  }

  const matchMap = new Map()
  matches.forEach((match) => {
    if (!match?.matchNumber) return
    matchMap.set(match.matchNumber, {
      startTime: match.startTime || undefined,
      redTeams: Array.isArray(match.red) ? match.red : [],
      blueTeams: Array.isArray(match.blue) ? match.blue : [],
    })
  })

  const matchNumbers = new Set()
  const assignmentRows = []

  const aliasMap = new Map()
  if (aliases && typeof aliases === "object") {
    Object.entries(aliases).forEach(([name, email]) => {
      const normalizedName = normalizeName(name)
      const normalizedEmail = normalizeEmail(email)
      if (normalizedName && normalizedEmail && normalizedEmail.includes("@")) {
        aliasMap.set(normalizedName, normalizedEmail)
      }
    })
  }

  assignments.forEach((assignment) => {
    if (!assignment || !assignment.matchNumber) return
    const matchNumber = assignment.matchNumber
    matchNumbers.add(matchNumber)
    const order = parseMatchOrder(matchNumber)
    const baseStart = assignment.startTime || matchMap.get(matchNumber)?.startTime || null

    const positions = assignment.positions && typeof assignment.positions === "object" ? assignment.positions : {}
    Object.entries(positions).forEach(([position, value]) => {
      if (!value) return
      let normalizedEmail = normalizeEmail(value)
      if ((!normalizedEmail || !normalizedEmail.includes("@")) && typeof value === "string") {
        const lookup = aliasMap.get(normalizeName(value))
        if (lookup) {
          normalizedEmail = lookup
        }
      }
      if (!normalizedEmail || !normalizedEmail.includes("@")) {
        return
      }
      assignmentRows.push({
        eventKey: normalizedEvent,
        matchNumber,
        matchOrder: order,
        position,
        scoutEmail: normalizedEmail,
        startTime: baseStart,
        createdAt: nowSeconds(),
        updatedAt: nowSeconds(),
      })
    })
  })

  const matchRows = Array.from(matchMap.entries()).map(([matchNumber, value]) => ({
    eventKey: normalizedEvent,
    matchNumber,
    startTime: value.startTime || null,
    redTeams: JSON.stringify(value.redTeams ?? []),
    blueTeams: JSON.stringify(value.blueTeams ?? []),
    createdAt: nowSeconds(),
    updatedAt: nowSeconds(),
  }))

  const seasonPrisma = await getSeasonPrismaForEvent(normalizedEvent)
  await seasonPrisma.$transaction(async (tx) => {
    await tx.scoutScheduleAssignment.deleteMany({ where: { eventKey: normalizedEvent } })
    await tx.scoutScheduleMatch.deleteMany({ where: { eventKey: normalizedEvent } })

    if (matchRows.length) {
      await tx.scoutScheduleMatch.createMany({ data: matchRows })
    }
    if (assignmentRows.length) {
      await tx.scoutScheduleAssignment.createMany({ data: assignmentRows })
    }

    if (matchNumbers.size === 0) {
      await tx.scheduleNotification.deleteMany({ where: { eventKey: normalizedEvent } })
    } else {
      await tx.scheduleNotification.deleteMany({
        where: {
          eventKey: normalizedEvent,
          NOT: { matchNumber: { in: Array.from(matchNumbers) } },
        }
      })
    }
  })

  await processUpcomingNotifications(normalizedEvent)
}

const getScheduleState = async (requestedEventKey) => {
  let targetEvent = requestedEventKey?.trim()
  if (!targetEvent) {
    targetEvent = await latestEventKey()
  }
  if (!targetEvent) {
    return { eventKey: null, assignments: [], matches: [], updatedAt: null }
  }

  const assignments = await loadAssignmentsForReturn(targetEvent)
  const matches = await loadMatches(targetEvent)

  const assignmentMap = new Map()
  assignments.forEach((row) => {
    if (!assignmentMap.has(row.matchNumber)) {
      assignmentMap.set(row.matchNumber, {
        matchNumber: row.matchNumber,
        startTime: row.startTime || undefined,
        positions: {},
      })
    }
    const entry = assignmentMap.get(row.matchNumber)
    entry.positions[row.position] = row.scoutEmail
  })

  const assignmentList = Array.from(assignmentMap.values()).sort((a, b) => {
    const orderA = parseMatchOrder(a.matchNumber) ?? Number.MAX_SAFE_INTEGER
    const orderB = parseMatchOrder(b.matchNumber) ?? Number.MAX_SAFE_INTEGER
    return orderA - orderB
  })

  const matchList = matches.map((row) => ({
    matchNumber: row.matchNumber,
    startTime: row.startTime || undefined,
    red: parseTeams(row.redTeams),
    blue: parseTeams(row.blueTeams),
  }))

  const updatedAt = assignments.reduce((latest, row) => {
    const order = parseMatchOrder(row.matchNumber) ?? 0
    return Math.max(latest, order)
  }, 0)

  const mode = assignmentList.some((assignment) =>
    POSITION_KEYS.some((position) => {
      const value = assignment.positions?.[position]
      return typeof value === "string" && value.includes("@")
    })
  )
    ? "manual"
    : "auto"

  return {
    eventKey: targetEvent,
    assignments: assignmentList,
    matches: matchList,
    updatedAt,
    aliases: {},
    mode,
  }
}

/**
 * Returns all assignments for a specific scout email on an event.
 * Each entry includes matchNumber, matchOrder, position, alliance, and slotIndex.
 */
const getMyAssignments = async ({ eventKey, email }) => {
  const normalizedEmail = normalizeEmail(email)
  const seasonPrisma = await getSeasonPrismaForEvent(eventKey)

  const assignments = await seasonPrisma.scoutScheduleAssignment.findMany({
    where: { eventKey, scoutEmail: normalizedEmail },
    orderBy: { matchOrder: 'asc' },
  })

  return assignments.map((a) => {
    const positionDetails = POSITION_DETAILS[a.position] || {}
    return {
      matchNumber: a.matchNumber,
      matchOrder: a.matchOrder,
      position: a.position,
      alliance: positionDetails.alliance ?? null,
      slotIndex: positionDetails.slotIndex ?? null, // 0-based; +1 = teamPosition (1,2,3)
    }
  })
}

const notifyScheduleReleased = async ({ eventKey, isUpdate = false }) => {
  if (!pushEnabled) return

  const subscriptions = await mainPrisma.pushSubscription.findMany()
  if (!subscriptions.length) return

  const title = isUpdate ? "Scouting Schedule Updated" : "Scouting Schedule Released"
  const body = `The scouting schedule for ${eventKey} has been ${isUpdate ? "updated" : "published"}. Check your assignments.`
  const tag = `schedule-${eventKey}-${isUpdate ? "update" : "release"}`

  const results = await Promise.all(
    subscriptions.map((sub) =>
      sendNotificationToSubscription(sub, { title, body, tag, data: { url: "/schedule" } })
    )
  )

  const failed = results.filter((r) => !r).length
  if (failed > 0) {
    console.warn(`notifyScheduleReleased: ${failed}/${subscriptions.length} pushes failed`)
  }
}

module.exports = {
  storeSubscription,
  removeSubscription,
  updateMatchProgress,
  replaceScheduleAssignments,
  getScheduleState,
  processUpcomingNotifications,
  sendManualNotification,
  getMyAssignments,
  notifyScheduleReleased,
}
