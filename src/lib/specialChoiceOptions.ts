export type SpecialChoiceOption = {
  value: string
  title: string
  description: string
}

export type SpecialChoiceOptionParts = {
  title: string
  description: string
}

const findSplitMeta = (rawOption: string) => {
  const normalized = typeof rawOption === "string" ? rawOption : ""
  const pipeIndex = normalized.indexOf("|")
  const doubleColonIndex = normalized.indexOf("::")

  if (pipeIndex < 0 && doubleColonIndex < 0) {
    return null
  }

  const usePipe = pipeIndex >= 0 && (doubleColonIndex < 0 || pipeIndex < doubleColonIndex)
  return {
    splitIndex: usePipe ? pipeIndex : doubleColonIndex,
    delimiterLength: usePipe ? 1 : 2,
  }
}

const splitOptionText = (rawOption: string): SpecialChoiceOptionParts => {
  const normalized = rawOption.trim()
  const splitMeta = findSplitMeta(normalized)

  if (!splitMeta) {
    return {
      title: normalized,
      description: "",
    }
  }

  const { splitIndex, delimiterLength } = splitMeta

  const title = normalized.slice(0, splitIndex).trim()
  const description = normalized.slice(splitIndex + delimiterLength).trim()

  return {
    title: title || normalized,
    description,
  }
}

export const splitSpecialChoiceOption = (rawOption: string): SpecialChoiceOption => {
  const normalized = typeof rawOption === "string" ? rawOption.trim() : ""
  const { title, description } = splitOptionText(normalized)
  const safeTitle = title || normalized

  return {
    value: safeTitle,
    title: safeTitle,
    description,
  }
}

export const joinSpecialChoiceOption = (title: string, description?: string) => {
  const cleanTitle = title.trim()
  const cleanDescription = (description || "").trim()

  if (!cleanTitle && !cleanDescription) return ""
  if (!cleanDescription) return cleanTitle || cleanDescription
  if (!cleanTitle) return cleanDescription

  return `${cleanTitle} | ${cleanDescription}`
}

export const parseSpecialChoiceOptions = (options?: string[]) =>
  (options || [])
    .map((option) => splitSpecialChoiceOption(option))
    .filter((option) => option.title.length > 0)

export const splitSpecialChoiceOptionForEditing = (rawOption: string): SpecialChoiceOptionParts => {
  const normalized = typeof rawOption === "string" ? rawOption : ""
  const splitMeta = findSplitMeta(normalized)

  if (!splitMeta) {
    return {
      title: normalized,
      description: "",
    }
  }

  const { splitIndex, delimiterLength } = splitMeta
  return {
    title: normalized.slice(0, splitIndex),
    description: normalized.slice(splitIndex + delimiterLength),
  }
}

export const joinSpecialChoiceOptionForEditing = (title: string, description?: string) => {
  const rawTitle = typeof title === "string" ? title : ""
  const rawDescription = typeof description === "string" ? description : ""

  if (!rawTitle && !rawDescription) return ""
  if (!rawDescription) return rawTitle
  if (!rawTitle) return rawDescription

  return `${rawTitle} | ${rawDescription}`
}
