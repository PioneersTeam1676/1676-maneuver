export const SCOUTING_SEASON_STORAGE_KEY = "scouting:season"
export const SCOUTING_SEASON_UPDATED_EVENT = "scoutingSeasonUpdated"

const normalizeSeason = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const match = trimmed.match(/(19|20)\d{2}/)
  return match ? match[0] : null
}

export const readScoutingSeason = (): string | null => {
  if (typeof window === "undefined") return null
  return normalizeSeason(localStorage.getItem(SCOUTING_SEASON_STORAGE_KEY))
}

export const writeScoutingSeason = (year: string | null): void => {
  if (typeof window === "undefined") return
  const normalized = normalizeSeason(year)
  if (!normalized) {
    localStorage.removeItem(SCOUTING_SEASON_STORAGE_KEY)
  } else {
    localStorage.setItem(SCOUTING_SEASON_STORAGE_KEY, normalized)
  }
  window.dispatchEvent(new Event(SCOUTING_SEASON_UPDATED_EVENT))
}

export const withScoutingSeasonParams = (
  params: Record<string, string | null | undefined>
): Record<string, string | null | undefined> => {
  const season = readScoutingSeason()
  if (!season) return params
  return { ...params, year: season }
}

export const withScoutingSeasonBody = <T extends Record<string, unknown>>(
  body: T
): T & { year?: string } => {
  const season = readScoutingSeason()
  if (!season) return body as T & { year?: string }
  if ("year" in body && typeof body.year === "string") {
    return body as T & { year?: string }
  }
  return { ...body, year: season }
}
