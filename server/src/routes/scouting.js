const express = require("express")
const { getSeasonPrisma, resolveSeasonSelector } = require("../seasonDb")
const asyncHandler = require("../utils/asyncHandler")
const { parseJsonValue, stringifyJsonValue, toMsBigInt, fromBigInt } = require("../utils/dbUtils")
const { updateMatchProgress } = require("../services/scheduleNotifications")
const { detectOutliers } = require("../services/outlierDetection")

const router = express.Router()

const loadDisplayNames = async (prisma) => {
  try {
    const row = await prisma.eventSetting.findUnique({ where: { id: 1 } })
    if (!row || !row.eventDisplayNamesJson) return {}
    const parsed = JSON.parse(row.eventDisplayNamesJson)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

const schemaReady = new WeakMap()

const ensureScoutingIdSchema = async (prisma) => {
  if (schemaReady.has(prisma)) {
    await schemaReady.get(prisma)
    return
  }

  const promise = (async () => {
    try {
      const columns = await prisma.$queryRawUnsafe(
        "SHOW COLUMNS FROM scouting_entries LIKE 'client_id'"
      )
      if (Array.isArray(columns) && columns.length) {
        return
      }

      await prisma.$executeRawUnsafe("ALTER TABLE scouting_entries DROP PRIMARY KEY")
      await prisma.$executeRawUnsafe(
        "ALTER TABLE scouting_entries CHANGE COLUMN id client_id VARCHAR(255) NOT NULL"
      )
      await prisma.$executeRawUnsafe(
        "ALTER TABLE scouting_entries ADD COLUMN id INT NOT NULL AUTO_INCREMENT PRIMARY KEY FIRST"
      )
      await prisma.$executeRawUnsafe(
        "ALTER TABLE scouting_entries ADD UNIQUE KEY uniq_scouting_client_id (client_id)"
      )
    } catch (error) {
      console.warn("Failed to ensure scouting_entries id schema", error)
    }
  })()

  schemaReady.set(prisma, promise)
  await promise
}

const resetAutoIncrementIfEmpty = async (prisma) => {
  try {
    const rows = await prisma.$queryRawUnsafe("SELECT COUNT(*) as count FROM scouting_entries")
    const count = Array.isArray(rows) ? Number(rows[0]?.count ?? 0) : 0
    if (count === 0) {
      await prisma.$executeRawUnsafe("ALTER TABLE scouting_entries AUTO_INCREMENT = 1")
    }
  } catch (error) {
    console.warn("Failed to reset scouting_entries AUTO_INCREMENT", error)
  }
}

const normalizeDbId = (value) =>
  typeof value === "bigint" ? Number(value) : value

const rowToEntry = (row) => ({
  id: normalizeDbId(row.id),
  clientId: row.clientId || undefined,
  teamNumber: row.teamNumber || undefined,
  matchNumber: row.matchNumber || undefined,
  alliance: row.alliance || undefined,
  scoutName: row.scoutName || undefined,
  eventName: row.eventName || undefined,
  data: parseJsonValue(row.data, {}),
  timestamp: fromBigInt(row.timestamp, 0)
})

const REBUILT_TSV_HEADERS = [
  "Scout Team",
  "Event",
  "Timestamp",
  "Scout Name",
  "Match Number",
  "Qual or Elim",
  "Team Number",
  "Climbed",
  "Auto Strat",
  "Auto Rating",
  "Transition Strat",
  "Transition Rating",
  "Were they Defended? (Transition Period)",
  "First Active Phase Strat",
  "First Active Phase Rating",
  "Were they Defended? (First Active Phase)",
  "First Inactive Phase Strat",
  "First Inactive Phase Rating",
  "Were they Defended? (First Inactive Phase)",
  "Second Active Phase Strat",
  "Second Active Phase Rating",
  "Were they Defended? (Second Active Phase)",
  "Second Inactive Phase Strat",
  "Second Inactive Phase Rating",
  "Were they Defended? (Second Inactive Phase)",
  "Endgame Strat",
  "Endgame Rating",
  "Were they Defended? (Endgame)",
  "Climb",
  "Notes",
]

const REBUILT_TSV_FILENAME = "Rebuilt Test Data - Test Data.tsv"

const toNullableString = (value) => {
  const text = asString(value)
  return text ? text : null
}

const hasOwn = (value, key) =>
  Boolean(value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key))

const hasAnyKey = (source, keys = []) => keys.some((key) => hasOwn(source, key))

const firstDefined = (source, keys = []) => {
  for (const key of keys) {
    if (!hasOwn(source, key)) continue
    const value = source[key]
    if (value !== undefined && value !== null) {
      return value
    }
  }
  return undefined
}

const firstNonEmpty = (source, keys = []) => {
  for (const key of keys) {
    if (!hasOwn(source, key)) continue
    const value = source[key]
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
    if (typeof value === "string" && value.trim()) {
      return value
    }
  }
  return undefined
}

const asString = (value) => {
  if (value === undefined || value === null) return ""
  return String(value).trim()
}

const getFieldIdKeyAliases = (...ids) => {
  const aliases = []
  const seen = new Set()

  ids.forEach((id) => {
    const normalized = asString(id)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
    if (!normalized) return

    const shortAlias = `field_${normalized.slice(0, 6)}`
    if (!seen.has(shortAlias)) {
      seen.add(shortAlias)
      aliases.push(shortAlias)
    }

    const fullAlias = `field_${normalized}`
    if (!seen.has(fullAlias)) {
      seen.add(fullAlias)
      aliases.push(fullAlias)
    }
  })

  return aliases
}

const MATCH_FIELD_ID_ALIASES = {
  allianceWonAuto: getFieldIdKeyAliases("28636610-f0ca-4aeb-825c-183154d147e5"),
  autoStratPrimary: getFieldIdKeyAliases("09c8d987-1eb6-45a0-bef0-42e178701f98"),
  autoStratSecondary: getFieldIdKeyAliases("4a87fa6a-c863-4a21-9077-118fd4139fd7"),
  autoRating: getFieldIdKeyAliases("c3be35d9-a01c-4432-9327-cbd7c8f7d5d8"),
  transitionStratPrimary: getFieldIdKeyAliases("dcc6e6f6-06b0-4abc-ba58-04f2f54b1f00"),
  transitionStratSecondary: getFieldIdKeyAliases("26c83867-b2df-42bb-8746-4e1c5318c8d8"),
  transitionRating: getFieldIdKeyAliases("6cf380f6-5743-4433-8e9e-bfbcb7eeb7bf"),
  transitionDefended: getFieldIdKeyAliases("cf081541-6e69-4ade-99aa-5f93a2a9ea1d"),
  endgameStratPrimary: getFieldIdKeyAliases("c62d2553-5f9c-4376-ac55-dba88394b4b2"),
  endgameStratSecondary: getFieldIdKeyAliases("734a977c-67fa-4ad0-9d6b-58e4d72df44d"),
  endgameRating: getFieldIdKeyAliases("2b97eb28-244f-4263-bd9c-958bb1242e95"),
  endgameDefended: getFieldIdKeyAliases("82339a05-8d46-40c1-98b8-bda2dbf0f73f"),
  climb: getFieldIdKeyAliases("6e800d24-1ed6-4dd4-b151-08d0f2983223"),
  climbSuccess: getFieldIdKeyAliases("08de0e27-aaab-4eef-b1a9-1edda366e8fd"),
  notes: getFieldIdKeyAliases("6c6b3f79-329f-4535-8271-f278595857c3"),
}

const PHASE_FIELD_ID_ALIASES = {
  won_s1: {
    primary: getFieldIdKeyAliases("8a59fb0c-3b89-40aa-a3e6-6a95b2123062"),
    secondary: getFieldIdKeyAliases("3eddc8d4-8568-4625-97e5-81a3029e3ac2"),
    rating: getFieldIdKeyAliases("fb13b8e7-891b-415f-9a56-2f25fe097e32"),
    defended: getFieldIdKeyAliases("1621317d-94d5-44d9-a7dd-82a40dd94f49"),
  },
  won_s2: {
    primary: getFieldIdKeyAliases("bf20d10e-6fd6-4f25-965a-223815d0e518"),
    secondary: getFieldIdKeyAliases("e05ee312-eb89-43cd-b16e-21c50007887b"),
    rating: getFieldIdKeyAliases("d6a9402c-23a6-46ef-8b68-bb547256b55c"),
    defended: getFieldIdKeyAliases("8f03f6d1-c9f3-46bc-a40d-ea9f5c81206c"),
  },
  won_s3: {
    primary: getFieldIdKeyAliases("629bb089-15c5-40d2-a49c-4f5c6a5736e4"),
    secondary: getFieldIdKeyAliases("84028f4b-2759-48e2-88b6-cd562eaf7b13"),
    rating: getFieldIdKeyAliases("81b23eeb-8685-405e-b07c-0a0ffcd88a70"),
    defended: getFieldIdKeyAliases("073b72e2-7e85-4b4c-9f0c-3c60f6c56640"),
  },
  won_s4: {
    primary: getFieldIdKeyAliases("25b5b6a3-8f63-4b32-8ff6-77bb52a77acc"),
    secondary: getFieldIdKeyAliases("425b8057-7dd7-453a-bbaf-10327cbb2774"),
    rating: getFieldIdKeyAliases("988346e7-33c1-44c2-9e7e-ac5d3e0c55c1"),
    defended: getFieldIdKeyAliases("016b075e-5e8c-4c42-bde5-2e86761f86d0"),
  },
  lost_s1: {
    primary: getFieldIdKeyAliases("ca28ce81-7b80-4f47-bf24-42c95e0d80e9"),
    secondary: getFieldIdKeyAliases("ba14bc9d-c007-41a6-a002-3071e21d55db"),
    rating: getFieldIdKeyAliases("a64be47a-8794-41fc-9598-e24e00c83c5e"),
    defended: getFieldIdKeyAliases("0b194e69-cdaa-453f-9c3b-1b8b9c70221e"),
  },
  lost_s2: {
    primary: getFieldIdKeyAliases("df5c50e0-1f14-4944-9309-3c9942109558"),
    secondary: getFieldIdKeyAliases("85b9e8ba-a480-4048-9384-da53ae461af4"),
    rating: getFieldIdKeyAliases("fd557402-7f7b-4b63-8a43-3d39249d45fb"),
    defended: getFieldIdKeyAliases("c27c9248-31df-4071-a226-35d2f9d68399"),
  },
  lost_s3: {
    primary: getFieldIdKeyAliases("597f90e7-9656-40ca-8c3b-1b6bf56eb9c6"),
    secondary: getFieldIdKeyAliases("a0d2762a-ffdc-43ee-b41f-663cae8809e7"),
    rating: getFieldIdKeyAliases("3db2f1c3-6662-49ee-b8ee-c0ae95cf5a22"),
    defended: getFieldIdKeyAliases("7568b4cd-f98e-4f29-9d81-49def8ea5066"),
  },
  lost_s4: {
    primary: getFieldIdKeyAliases("4cd9668e-a74b-437b-85da-abcb6a6a8413"),
    secondary: getFieldIdKeyAliases("d4a1effe-b56d-4a29-974a-424e9c799345"),
    rating: getFieldIdKeyAliases("fa653b43-6fcd-4837-b01c-d164e9ce3459"),
    defended: getFieldIdKeyAliases("8177a8e9-d760-4935-978d-566a683cb147"),
  },
}

const asNumberOrBlank = (value) => {
  if (value === undefined || value === null || value === "") return ""
  const numeric = Number(value)
  if (Number.isFinite(numeric)) return numeric
  return asString(value)
}

const asBoolean = (value) => {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value !== "string") return false
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  return ["true", "1", "yes", "y"].includes(normalized)
}

const toYesNo = (value) => (asBoolean(value) ? "Yes" : "No")

const splitChoiceTitle = (value) => {
  const text = asString(value)
  if (!text) return ""
  return text.split("|")[0].trim()
}

const normalizeStrategy = (value) => {
  const title = splitChoiceTitle(value)
  if (!title) return ""
  const normalized = title.toLowerCase()
  if (normalized.includes("out of zone")) return "Out of Zone Cycles"
  if (normalized.includes("in zone")) return "In Zone Clean Up"
  if (normalized.includes("hybrid")) return "Hybrid"
  if (normalized.includes("passer") || normalized.includes("passing")) return "Passing"
  if (normalized.includes("defend")) return "Defense"
  if (normalized.includes("stealing")) return "Stealing"
  if (normalized.includes("non-functioning") || normalized.includes("non functioning")) {
    return "Non-Functioning"
  }
  return title
}

const normalizeQualOrElim = (value, matchNumber) => {
  const raw = asString(value).toLowerCase()
  if (raw) {
    if (
      raw === "m" ||
      raw.includes("elim") ||
      raw.includes("playoff") ||
      raw.startsWith("qf") ||
      raw.startsWith("sf") ||
      raw.startsWith("f")
    ) {
      return "M"
    }
    if (raw === "q" || raw.includes("qual") || raw.startsWith("qm")) {
      return "Q"
    }
  }

  const hint = asString(matchNumber).toLowerCase()
  if (hint.startsWith("qm") || hint.startsWith("q")) return "Q"
  if (hint.startsWith("qf") || hint.startsWith("sf") || hint.startsWith("f")) return "M"
  return "Q"
}

const parseRebuiltTimestamp = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime()
  const text = asString(value)
  if (!text) return null

  const dateTimeMatch = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/
  )
  if (dateTimeMatch) {
    const month = Number(dateTimeMatch[1]) - 1
    const day = Number(dateTimeMatch[2])
    const year = Number(dateTimeMatch[3])
    const hour = Number(dateTimeMatch[4])
    const minute = Number(dateTimeMatch[5])
    const second = Number(dateTimeMatch[6] || 0)
    const parsed = new Date(year, month, day, hour, minute, second).getTime()
    if (Number.isFinite(parsed)) return parsed
  }

  const parsed = Date.parse(text)
  return Number.isFinite(parsed) ? parsed : null
}

const formatRebuiltTimestamp = (value) => {
  const parsed = parseRebuiltTimestamp(value)
  if (!Number.isFinite(parsed)) return ""
  const date = new Date(parsed)
  if (Number.isNaN(date.getTime())) return ""
  const month = date.getMonth() + 1
  const day = date.getDate()
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")
  return `${month}/${day}/${year} ${hours}:${minutes}:${seconds}`
}

const normalizeClimbLevel = (value) => {
  const title = splitChoiceTitle(value).toLowerCase()
  if (!title) return ""
  if (title.includes("did not attempt") || title === "no") return "Did not attempt"
  if (title.includes("failed")) return "Failed Attempt"
  if (title.includes("l3") || title.includes("level 3")) return "Level 3"
  if (title.includes("l2") || title.includes("level 2")) return "Level 2"
  if (title.includes("l1") || title.includes("level 1")) return "Level 1"
  if (title === "yes" || title === "successful") return "Level 1"
  return splitChoiceTitle(value)
}

const normalizeClimb = (climbValue, climbSuccessValue) => {
  const success = splitChoiceTitle(climbSuccessValue).toLowerCase()
  const level = normalizeClimbLevel(climbValue)

  if (success.includes("attempted") && success.includes("fail")) {
    return { climbed: "Failed Attempt", climb: "Failed Attempt" }
  }
  if (success.includes("did not attempt") || success === "no") {
    return { climbed: "No", climb: "Did not attempt" }
  }
  if (success.includes("successful") || success === "yes") {
    return { climbed: "Yes", climb: level || "Level 1" }
  }

  if (level === "Failed Attempt") {
    return { climbed: "Failed Attempt", climb: "Failed Attempt" }
  }
  if (level === "Did not attempt") {
    return { climbed: "No", climb: "Did not attempt" }
  }
  if (level) {
    return { climbed: "Yes", climb: level }
  }
  return { climbed: "No", climb: "Did not attempt" }
}

const normalizeIncomingData = (value) => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value
  }
  if (typeof value === "string") {
    return parseJsonValue(value, {})
  }
  return {}
}

const pickDefined = (sourceData, keys = [], fallbackValue) => {
  const fromSource = firstDefined(sourceData, keys)
  if (fromSource !== undefined) return fromSource
  return fallbackValue
}

const pickNonEmpty = (sourceData, keys = [], fallbackValue) => {
  const fromSource = firstNonEmpty(sourceData, keys)
  if (fromSource !== undefined) return fromSource
  return fallbackValue
}

const inferWonAuto = (sourceData) => {
  const explicit = firstDefined(sourceData, [
    "field_alliance_won_auto",
    "alliance_won_auto",
    "allianceWonAuto",
    "Alliance Won Auto",
    ...MATCH_FIELD_ID_ALIASES.allianceWonAuto,
  ])
  if (explicit !== undefined) {
    return asBoolean(explicit)
  }

  const hasWonPath = hasAnyKey(sourceData, [
    "won_s1_primary",
    "won_s2_primary",
    "won_s3_primary",
    "won_s4_primary",
  ])
  const hasLostPath = hasAnyKey(sourceData, [
    "lost_s1_primary",
    "lost_s2_primary",
    "lost_s3_primary",
    "lost_s4_primary",
  ])

  if (hasWonPath && !hasLostPath) return true
  if (hasLostPath && !hasWonPath) return false
  return false
}

const getPhaseValues = (data, prefix, idAliases = {}) => {
  const aliasPrimary = Array.isArray(idAliases.primary) ? idAliases.primary : []
  const aliasSecondary = Array.isArray(idAliases.secondary) ? idAliases.secondary : []
  const aliasRating = Array.isArray(idAliases.rating) ? idAliases.rating : []
  const aliasDefended = Array.isArray(idAliases.defended) ? idAliases.defended : []

  const strat = normalizeStrategy(
    firstNonEmpty(data, [
      `${prefix}_primary`,
      `${prefix}_secondary`,
      ...aliasPrimary,
      ...aliasSecondary,
    ])
  )
  const rating = asNumberOrBlank(firstDefined(data, [`${prefix}_rating`, ...aliasRating]))
  const defended = toYesNo(firstDefined(data, [`${prefix}_defended`, ...aliasDefended]))
  return { strat, rating, defended }
}

const resolvePhaseValues = (data, explicitHeaders, prefix) => {
  const explicitStrat = normalizeStrategy(firstNonEmpty(data, [explicitHeaders.strat]))
  const explicitRating = asNumberOrBlank(firstDefined(data, [explicitHeaders.rating]))
  const explicitDefendedValue = firstDefined(data, [explicitHeaders.defended])
  const hasExplicitValues =
    explicitStrat !== "" || explicitRating !== "" || explicitDefendedValue !== undefined

  if (hasExplicitValues) {
    return {
      strat: explicitStrat,
      rating: explicitRating,
      defended: toYesNo(explicitDefendedValue),
    }
  }

  return getPhaseValues(data, prefix, PHASE_FIELD_ID_ALIASES[prefix])
}

const buildRebuiltRecord = (sourceData, fallback = {}) => {
  const scoutTeam = asString(
    pickNonEmpty(
      sourceData,
      ["Scout Team", "scoutTeam", "scout_team", "field_scout_team", "alliance", "Alliance"],
      fallback.scoutTeam ?? fallback.alliance
    )
  )
  const eventName = asString(
    pickNonEmpty(
      sourceData,
      ["Event", "event", "eventName", "event_name", "field_event"],
      fallback.eventName
    )
  )
  const scoutName = asString(
    pickNonEmpty(
      sourceData,
      ["Scout Name", "scoutName", "scout_name", "field_scout_name"],
      fallback.scoutName
    )
  )
  const matchNumber = asString(
    pickNonEmpty(
      sourceData,
      ["Match Number", "matchNumber", "match_number", "field_match_number"],
      fallback.matchNumber
    )
  )
  const teamNumber = asString(
    pickNonEmpty(
      sourceData,
      ["Team Number", "teamNumber", "team_number", "selectTeam", "field_team_number"],
      fallback.teamNumber
    )
  )
  const timestampSource = pickDefined(
    sourceData,
    ["Timestamp", "timestamp", "recordedAt"],
    fallback.timestamp ?? fallback.recordedAt
  )
  const timestamp = formatRebuiltTimestamp(timestampSource || Date.now())

  const autoStrat = normalizeStrategy(
    pickNonEmpty(sourceData, [
      "Auto Strat",
      "autoStrat",
      "field_auto_strat_primary_scorer",
      "field_auto_strat_secondary_role",
      ...MATCH_FIELD_ID_ALIASES.autoStratPrimary,
      ...MATCH_FIELD_ID_ALIASES.autoStratSecondary,
    ])
  )
  const autoRating = asNumberOrBlank(
    pickDefined(sourceData, [
      "Auto Rating",
      "autoRating",
      "field_auto_strat_rating",
      ...MATCH_FIELD_ID_ALIASES.autoRating,
    ])
  )

  const transitionStrat = normalizeStrategy(
    pickNonEmpty(sourceData, [
      "Transition Strat",
      "transitionStrat",
      "field_transition_period_strat_primary_scorer",
      "field_transition_period_strat_secondary_role",
      ...MATCH_FIELD_ID_ALIASES.transitionStratPrimary,
      ...MATCH_FIELD_ID_ALIASES.transitionStratSecondary,
    ])
  )
  const transitionRating = asNumberOrBlank(
    pickDefined(sourceData, [
      "Transition Rating",
      "transitionRating",
      "field_transition_period_rating",
      ...MATCH_FIELD_ID_ALIASES.transitionRating,
    ])
  )
  const transitionDefended = toYesNo(
    pickDefined(sourceData, [
      "Were they Defended? (Transition Period)",
      "transition_defended",
      "field_were_they_defended_transition_period",
      ...MATCH_FIELD_ID_ALIASES.transitionDefended,
    ])
  )

  const wonAuto = inferWonAuto(sourceData)
  const phasePrefix = wonAuto
    ? {
        firstActive: "won_s2",
        firstInactive: "won_s1",
        secondActive: "won_s4",
        secondInactive: "won_s3",
      }
    : {
        firstActive: "lost_s1",
        firstInactive: "lost_s2",
        secondActive: "lost_s3",
        secondInactive: "lost_s4",
      }

  const firstActive = resolvePhaseValues(
    sourceData,
    {
      strat: "First Active Phase Strat",
      rating: "First Active Phase Rating",
      defended: "Were they Defended? (First Active Phase)",
    },
    phasePrefix.firstActive
  )
  const firstInactive = resolvePhaseValues(
    sourceData,
    {
      strat: "First Inactive Phase Strat",
      rating: "First Inactive Phase Rating",
      defended: "Were they Defended? (First Inactive Phase)",
    },
    phasePrefix.firstInactive
  )
  const secondActive = resolvePhaseValues(
    sourceData,
    {
      strat: "Second Active Phase Strat",
      rating: "Second Active Phase Rating",
      defended: "Were they Defended? (Second Active Phase)",
    },
    phasePrefix.secondActive
  )
  const secondInactive = resolvePhaseValues(
    sourceData,
    {
      strat: "Second Inactive Phase Strat",
      rating: "Second Inactive Phase Rating",
      defended: "Were they Defended? (Second Inactive Phase)",
    },
    phasePrefix.secondInactive
  )

  const endgameStrat = normalizeStrategy(
    pickNonEmpty(sourceData, [
      "Endgame Strat",
      "endgameStrat",
      "field_endgame_strat_primary_scorer",
      "field_endgame_strat_secondary_role",
      ...MATCH_FIELD_ID_ALIASES.endgameStratPrimary,
      ...MATCH_FIELD_ID_ALIASES.endgameStratSecondary,
    ])
  )
  const endgameRating = asNumberOrBlank(
    pickDefined(sourceData, [
      "Endgame Rating",
      "endgameRating",
      "field_endgame_strat_rating",
      ...MATCH_FIELD_ID_ALIASES.endgameRating,
    ])
  )
  const endgameDefended = toYesNo(
    pickDefined(sourceData, [
      "Were they Defended? (Endgame)",
      "endgame_defended",
      "field_were_they_defended_endgame",
      ...MATCH_FIELD_ID_ALIASES.endgameDefended,
    ])
  )

  const climbValues = normalizeClimb(
    pickDefined(sourceData, [
      "endgame_climb",
      "Climb",
      "field_climb",
      "climb",
      ...MATCH_FIELD_ID_ALIASES.climb,
    ]),
    pickDefined(sourceData, [
      "endgame_climb_success",
      "field_climb_success",
      "climb_success",
      "Climb Success",
      ...MATCH_FIELD_ID_ALIASES.climbSuccess,
    ])
  )
  const explicitClimbed = splitChoiceTitle(pickDefined(sourceData, ["Climbed"]))
  const climbed = explicitClimbed || climbValues.climbed

  const notes = asString(
    pickNonEmpty(sourceData, ["Notes", "field_notes", "comment", "notes", ...MATCH_FIELD_ID_ALIASES.notes])
  )

  return {
    "Scout Team": scoutTeam,
    Event: eventName,
    Timestamp: timestamp,
    "Scout Name": scoutName,
    "Match Number": matchNumber,
    "Qual or Elim": normalizeQualOrElim(
      pickNonEmpty(sourceData, ["Qual or Elim", "qualOrElim", "qual_or_elim", "matchType", "match_type"]),
      matchNumber
    ),
    "Team Number": teamNumber,
    Climbed: asString(climbed),
    "Auto Strat": autoStrat || firstActive.strat,
    "Auto Rating": autoRating,
    "Transition Strat": transitionStrat || firstInactive.strat,
    "Transition Rating": transitionRating,
    "Were they Defended? (Transition Period)": transitionDefended,
    "First Active Phase Strat": firstActive.strat,
    "First Active Phase Rating": firstActive.rating,
    "Were they Defended? (First Active Phase)": firstActive.defended,
    "First Inactive Phase Strat": firstInactive.strat,
    "First Inactive Phase Rating": firstInactive.rating,
    "Were they Defended? (First Inactive Phase)": firstInactive.defended,
    "Second Active Phase Strat": secondActive.strat,
    "Second Active Phase Rating": secondActive.rating,
    "Were they Defended? (Second Active Phase)": secondActive.defended,
    "Second Inactive Phase Strat": secondInactive.strat,
    "Second Inactive Phase Rating": secondInactive.rating,
    "Were they Defended? (Second Inactive Phase)": secondInactive.defended,
    "Endgame Strat": endgameStrat || secondActive.strat,
    "Endgame Rating": endgameRating,
    "Were they Defended? (Endgame)": endgameDefended,
    Climb: asString(climbValues.climb) || "Did not attempt",
    Notes: notes,
  }
}

const resolveTimestampMs = (rebuiltData, fallbackTimestamp) => {
  const fromRecord = parseRebuiltTimestamp(rebuiltData?.Timestamp)
  if (Number.isFinite(fromRecord)) return fromRecord
  const numericFallback = Number(fallbackTimestamp)
  if (Number.isFinite(numericFallback) && numericFallback > 0) return numericFallback
  return Date.now()
}

const normalizeIncomingScoutingEntry = (entry) => {
  const sourceData = normalizeIncomingData(entry?.data)
  const rebuiltData = buildRebuiltRecord(sourceData, {
    scoutTeam: entry?.alliance,
    eventName: entry?.eventName,
    scoutName: entry?.scoutName,
    matchNumber: entry?.matchNumber,
    teamNumber: entry?.teamNumber,
    timestamp: entry?.timestamp,
  })
  const timestampMs = resolveTimestampMs(rebuiltData, entry?.timestamp)
  return {
    rebuiltData,
    timestampMs,
    scoutTeam: asString(rebuiltData["Scout Team"]),
    eventName: asString(rebuiltData.Event),
    scoutName: asString(rebuiltData["Scout Name"]),
    matchNumber: asString(rebuiltData["Match Number"]),
    teamNumber: asString(rebuiltData["Team Number"]),
  }
}

const rowToRebuiltExport = (row) => {
  const sourceData = normalizeIncomingData(row?.data)
  return buildRebuiltRecord(sourceData, {
    scoutTeam: row?.alliance,
    eventName: row?.eventName,
    scoutName: row?.scoutName,
    matchNumber: row?.matchNumber,
    teamNumber: row?.teamNumber,
    timestamp: fromBigInt(row?.timestamp, Date.now()),
  })
}

const sanitizeTsvCell = (value) =>
  String(value ?? "")
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ")

const sanitizeCsvCell = (value) => {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ")
  // Only quote cells that contain commas, quotes, or formula-trigger characters
  if (/[,"\r\n]/.test(normalized) || /^[=+\-@]/.test(normalized)) {
    const escaped = normalized.replace(/"/g, '""')
    return `"${escaped}"`
  }
  return normalized
}

const toRebuiltTsv = (rows) => {
  const lines = [REBUILT_TSV_HEADERS.join("\t")]
  rows.forEach((row) => {
    lines.push(REBUILT_TSV_HEADERS.map((header) => sanitizeTsvCell(row[header])).join("\t"))
  })
  return lines.join("\n")
}

const toRebuiltCsv = (rows) => {
  const lines = [REBUILT_TSV_HEADERS.map((header) => sanitizeCsvCell(header)).join(",")]
  rows.forEach((row) => {
    lines.push(REBUILT_TSV_HEADERS.map((header) => sanitizeCsvCell(row[header])).join(","))
  })
  return lines.join("\n")
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { teamNumber, matchNumber, eventName, scoutName, alliance } = req.query
    const selector = resolveSeasonSelector({
      year: req.query.year,
      formId: req.query.formId,
      eventName,
    })
    const { prisma } = await getSeasonPrisma(selector)
    const where = {}

    if (teamNumber) where.teamNumber = String(teamNumber)
    if (matchNumber) where.matchNumber = String(matchNumber)
    if (eventName) where.eventName = String(eventName)
    if (scoutName) where.scoutName = String(scoutName)
    if (alliance) where.alliance = String(alliance)

    await ensureScoutingIdSchema(prisma)

    const rows = await prisma.scoutingEntry.findMany({
      where,
      orderBy: { timestamp: "asc" }
    })

    res.json({ entries: rows.map(rowToEntry) })
  })
)

router.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    const { prisma } = await getSeasonPrisma()
    await ensureScoutingIdSchema(prisma)

    const rows = await prisma.scoutingEntry.findMany({
      select: {
        teamNumber: true,
        matchNumber: true,
        scoutName: true,
        eventName: true,
        timestamp: true,
      }
    })

    const teams = new Set()
    const matches = new Set()
    const scouts = new Set()
    const events = new Set()
    let oldest
    let newest

    rows.forEach((row) => {
      if (row.teamNumber) teams.add(row.teamNumber)
      if (row.matchNumber) matches.add(row.matchNumber)
      if (row.scoutName) scouts.add(row.scoutName)
      if (row.eventName) events.add(row.eventName)
      const ts = fromBigInt(row.timestamp, 0)
      oldest = oldest ? Math.min(oldest, ts) : ts
      newest = newest ? Math.max(newest, ts) : ts
    })

    res.json({
      totalEntries: rows.length,
      teams: Array.from(teams).sort((a, b) => Number(a) - Number(b)),
      matches: Array.from(matches).sort((a, b) => Number(a) - Number(b)),
      scouts: Array.from(scouts).sort(),
      events: Array.from(events).sort(),
      oldestEntry: oldest,
      newestEntry: newest,
    })
  })
)

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { entry } = req.body
    if (!entry || !entry.id) {
      return res.status(400).json({ error: "Entry with id is required" })
    }
    const normalized = normalizeIncomingScoutingEntry(entry)
    const selector = resolveSeasonSelector({
      year: req.body?.year,
      formId: req.body?.formId,
      eventName: normalized.eventName || entry.eventName,
    })
    const { prisma } = await getSeasonPrisma(selector)

    await ensureScoutingIdSchema(prisma)
    await resetAutoIncrementIfEmpty(prisma)

    const payload = {
      clientId: entry.id,
      teamNumber: toNullableString(normalized.teamNumber),
      matchNumber: toNullableString(normalized.matchNumber),
      alliance: toNullableString(normalized.scoutTeam || entry.alliance),
      scoutName: toNullableString(normalized.scoutName),
      eventName: toNullableString(normalized.eventName),
      data: stringifyJsonValue(normalized.rebuiltData, {}),
      timestamp: toMsBigInt(normalized.timestampMs)
    }

    await prisma.scoutingEntry.upsert({
      where: { clientId: payload.clientId },
      create: payload,
      update: payload,
    })

    if (payload.eventName && payload.matchNumber) {
      Promise.resolve(updateMatchProgress(payload.eventName, payload.matchNumber)).catch((error) => {
        console.warn("Failed to update match progress", error)
      })
    }

    res.status(201).json({ success: true })
  })
)

router.post(
  "/bulk",
  asyncHandler(async (req, res) => {
    const { entries } = req.body
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: "entries array required" })
    }
    if (entries.some((item) => !item || !item.id)) {
      return res.status(400).json({ error: "Each entry must include an id" })
    }
    const normalizedEntries = entries.map((entry) => ({
      id: entry.id,
      normalized: normalizeIncomingScoutingEntry(entry),
    }))
    const firstEvent = normalizedEntries.find((item) => item.normalized.eventName)?.normalized.eventName
    const selector = resolveSeasonSelector({
      year: req.body?.year,
      formId: req.body?.formId,
      eventName: firstEvent,
    })
    const { prisma } = await getSeasonPrisma(selector)

    await ensureScoutingIdSchema(prisma)
    await resetAutoIncrementIfEmpty(prisma)

    const operations = normalizedEntries.map(({ id, normalized }) => {
      const payload = {
        clientId: id,
        teamNumber: toNullableString(normalized.teamNumber),
        matchNumber: toNullableString(normalized.matchNumber),
        alliance: toNullableString(normalized.scoutTeam),
        scoutName: toNullableString(normalized.scoutName),
        eventName: toNullableString(normalized.eventName),
        data: stringifyJsonValue(normalized.rebuiltData, {}),
        timestamp: toMsBigInt(normalized.timestampMs)
      }

      return prisma.scoutingEntry.upsert({
        where: { clientId: payload.clientId },
        create: payload,
        update: payload,
      })
    })

    if (operations.length) {
      await prisma.$transaction(operations)
    }

    normalizedEntries.forEach(({ normalized }) => {
      if (normalized.eventName && normalized.matchNumber) {
        Promise.resolve(updateMatchProgress(normalized.eventName, normalized.matchNumber)).catch((error) => {
          console.warn("Failed to update match progress", error)
        })
      }
    })

    res.status(201).json({ success: true, count: entries.length })
  })
)

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const { id } = req.params
    const selector = resolveSeasonSelector({
      year: req.query.year,
      formId: req.query.formId,
    })
    const { prisma } = await getSeasonPrisma(selector)
    const parsedId = Number(id)
    const where = Number.isFinite(parsedId)
      ? { OR: [{ clientId: id }, { id: parsedId }] }
      : { clientId: id }
    await ensureScoutingIdSchema(prisma)
    const info = await prisma.scoutingEntry.deleteMany({ where })
    res.json({ success: info.count > 0 })
  })
)

router.delete(
  "/",
  asyncHandler(async (_req, res) => {
    const { prisma } = await getSeasonPrisma()
    await ensureScoutingIdSchema(prisma)
    await prisma.scoutingEntry.deleteMany({})
    res.json({ success: true })
  })
)

router.post(
  "/query",
  asyncHandler(async (req, res) => {
    const { filters = {} } = req.body
    const selector = resolveSeasonSelector({
      year: req.body?.year,
      formId: req.body?.formId,
      eventName: Array.isArray(filters.eventNames) ? filters.eventNames[0] : undefined,
    })
    const { prisma } = await getSeasonPrisma(selector)
    const where = {}

    if (filters.teamNumbers?.length) {
      where.teamNumber = { in: filters.teamNumbers }
    }
    if (filters.matchNumbers?.length) {
      where.matchNumber = { in: filters.matchNumbers }
    }
    if (filters.eventNames?.length) {
      where.eventName = { in: filters.eventNames }
    }
    if (filters.alliances?.length) {
      where.alliance = { in: filters.alliances }
    }
    if (filters.scoutName?.length) {
      where.scoutName = { in: filters.scoutName }
    }
    if (filters.dateRange?.start && filters.dateRange?.end) {
      where.timestamp = {
        gte: toMsBigInt(filters.dateRange.start),
        lte: toMsBigInt(filters.dateRange.end),
      }
    }

    await ensureScoutingIdSchema(prisma)

    const rows = await prisma.scoutingEntry.findMany({
      where,
      orderBy: { timestamp: "asc" }
    })

    res.json({ entries: rows.map(rowToEntry) })
  })
)

router.get(
  "/export/rebuilt",
  asyncHandler(async (req, res) => {
    const { teamNumber, matchNumber, eventName, scoutName, alliance } = req.query
    const selector = resolveSeasonSelector({
      year: req.query.year,
      formId: req.query.formId,
      eventName,
    })
    const { prisma } = await getSeasonPrisma(selector)
    const where = {}

    if (teamNumber) where.teamNumber = String(teamNumber)
    if (matchNumber) where.matchNumber = String(matchNumber)
    if (eventName) where.eventName = String(eventName)
    if (scoutName) where.scoutName = String(scoutName)
    if (alliance) where.alliance = String(alliance)

    await ensureScoutingIdSchema(prisma)

    const [rows, displayNames] = await Promise.all([
      prisma.scoutingEntry.findMany({ where, orderBy: { timestamp: "asc" } }),
      loadDisplayNames(prisma),
    ])
    const rebuiltRows = rows.map((row) => {
      const record = rowToRebuiltExport(row)
      record["Scout Team"] = "Pascack"
      if (record.Event && displayNames[record.Event]) {
        record.Event = displayNames[record.Event]
      }
      return record
    })
    const rebuiltTsv = toRebuiltTsv(rebuiltRows)
    const rebuiltCsv = toRebuiltCsv(rebuiltRows)
    const format = String(req.query.format || "").toLowerCase()

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8")
      return res.send(rebuiltCsv)
    }

    if (format === "tsv") {
      res.setHeader("Content-Type", "text/tab-separated-values; charset=utf-8")
      return res.send(rebuiltTsv)
    }

    res.json({
      headers: REBUILT_TSV_HEADERS,
      rows: rebuiltRows,
      csv: rebuiltCsv,
      tsv: rebuiltTsv,
      exportedAt: Date.now(),
      version: "2.0-mysql-rebuilt"
    })
  })
)

router.get(
  "/export",
  asyncHandler(async (req, res) => {
    const { prisma } = await getSeasonPrisma()
    await ensureScoutingIdSchema(prisma)

    const [rows, displayNames] = await Promise.all([
      prisma.scoutingEntry.findMany({ orderBy: { timestamp: "asc" } }),
      loadDisplayNames(prisma),
    ])
    const rebuiltRows = rows.map((row) => {
      const record = rowToRebuiltExport(row)
      record["Scout Team"] = "Pascack"
      if (record.Event && displayNames[record.Event]) {
        record.Event = displayNames[record.Event]
      }
      return record
    })
    const rebuiltCsv = toRebuiltCsv(rebuiltRows)
    const format = String(req.query.format || "").toLowerCase()

    if (format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8")
      return res.send(rebuiltCsv)
    }

    res.json({
      entries: rows.map(rowToEntry),
      headers: REBUILT_TSV_HEADERS,
      rows: rebuiltRows,
      csv: rebuiltCsv,
      exportedAt: Date.now(),
      version: "2.0-mysql"
    })
  })
)

router.post(
  "/import",
  asyncHandler(async (req, res) => {
    const { entries, mode = "append" } = req.body
    if (!Array.isArray(entries)) {
      return res.status(400).json({ error: "entries array required" })
    }
    if (entries.some((item) => !item || !item.id)) {
      return res.status(400).json({ error: "Each entry must include an id" })
    }
    const normalizedEntries = entries.map((entry) => ({
      id: entry.id,
      normalized: normalizeIncomingScoutingEntry(entry),
    }))
    const firstEvent = normalizedEntries.find((item) => item.normalized.eventName)?.normalized.eventName
    const selector = resolveSeasonSelector({
      year: req.body?.year,
      formId: req.body?.formId,
      eventName: firstEvent,
    })
    const { prisma } = await getSeasonPrisma(selector)
    await ensureScoutingIdSchema(prisma)

    if (mode === "overwrite") {
      await prisma.scoutingEntry.deleteMany({})
    }

    await resetAutoIncrementIfEmpty(prisma)

    const operations = normalizedEntries.map(({ id, normalized }) => {
      const payload = {
        clientId: id,
        teamNumber: toNullableString(normalized.teamNumber),
        matchNumber: toNullableString(normalized.matchNumber),
        alliance: toNullableString(normalized.scoutTeam),
        scoutName: toNullableString(normalized.scoutName),
        eventName: toNullableString(normalized.eventName),
        data: stringifyJsonValue(normalized.rebuiltData, {}),
        timestamp: toMsBigInt(normalized.timestampMs)
      }

      return prisma.scoutingEntry.upsert({
        where: { clientId: payload.clientId },
        create: payload,
        update: payload,
      })
    })

    if (operations.length) {
      await prisma.$transaction(operations)
    }

    res.json({ success: true, importedCount: entries.length })
  })
)

router.post(
  "/migrate/rebuilt",
  asyncHandler(async (req, res) => {
    const eventNameFilter = asString(req.body?.eventName || req.query.eventName)
    const selector = resolveSeasonSelector({
      year: req.body?.year || req.query.year,
      formId: req.body?.formId || req.query.formId,
      eventName: eventNameFilter || undefined,
    })
    const { prisma } = await getSeasonPrisma(selector)
    await ensureScoutingIdSchema(prisma)

    const where = {}
    if (eventNameFilter) {
      where.eventName = eventNameFilter
    }

    const rows = await prisma.scoutingEntry.findMany({
      where,
      orderBy: { id: "asc" },
    })

    const BATCH_SIZE = 200
    let migratedCount = 0

    for (let index = 0; index < rows.length; index += BATCH_SIZE) {
      const batch = rows.slice(index, index + BATCH_SIZE)
      const operations = batch.map((row) => {
        const legacy = rowToEntry(row)
        const normalized = normalizeIncomingScoutingEntry({
          id: row.clientId || String(row.id),
          teamNumber: row.teamNumber,
          matchNumber: row.matchNumber,
          alliance: row.alliance,
          scoutName: row.scoutName,
          eventName: row.eventName,
          data: legacy.data,
          timestamp: legacy.timestamp,
        })

        return prisma.scoutingEntry.update({
          where: { id: row.id },
          data: {
            teamNumber: toNullableString(normalized.teamNumber),
            matchNumber: toNullableString(normalized.matchNumber),
            alliance: toNullableString(normalized.scoutTeam),
            scoutName: toNullableString(normalized.scoutName),
            eventName: toNullableString(normalized.eventName),
            data: stringifyJsonValue(normalized.rebuiltData, {}),
            timestamp: toMsBigInt(normalized.timestampMs),
          },
        })
      })

      if (operations.length) {
        await prisma.$transaction(operations)
      }
      migratedCount += batch.length
    }

    res.json({
      success: true,
      migratedCount,
      totalRows: rows.length,
      eventName: eventNameFilter || null,
      version: "2.0-mysql-rebuilt",
    })
  })
)

const { prisma: mainPrisma } = require("../db")

const LEAD_ROLE_WEIGHTS = { lead: 3, tech_lead: 4 }

const requireLeadRole = asyncHandler(async (req, res, next) => {
  const email = req.user?.email
  if (!email) return res.status(403).json({ error: "insufficient permissions" })
  try {
    const row = await mainPrisma.role.findUnique({ where: { email: email.toLowerCase() } })
    const roleWeight = row?.role ? (LEAD_ROLE_WEIGHTS[row.role] ?? 0) : 0
    if (roleWeight < LEAD_ROLE_WEIGHTS.lead) {
      return res.status(403).json({ error: "insufficient permissions" })
    }
  } catch {
    return res.status(403).json({ error: "insufficient permissions" })
  }
  next()
})

router.get(
  "/outliers",
  requireLeadRole,
  asyncHandler(async (req, res) => {
    const { eventKey } = req.query
    if (!eventKey) return res.status(400).json({ error: "eventKey required" })
    const outliers = await detectOutliers({ eventKey })
    res.json({ outliers })
  })
)

module.exports = router
