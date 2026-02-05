const parseJsonValue = (value, fallback = {}) => {
  if (value == null) return fallback
  if (typeof value === "string") {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  if (typeof value === "object") {
    return value
  }
  return fallback
}

const stringifyJsonValue = (value, fallback = {}) => {
  try {
    return JSON.stringify(value ?? fallback)
  } catch {
    return JSON.stringify(fallback)
  }
}

const nowSeconds = () => Math.floor(Date.now() / 1000)

const toMsBigInt = (value, fallback = Date.now()) => {
  if (typeof value === "bigint") return value
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return BigInt(Math.trunc(fallback))
  }
  return BigInt(Math.trunc(numeric))
}

const fromBigInt = (value, fallback = null) => {
  if (typeof value === "bigint") {
    return Number(value)
  }
  if (typeof value === "number") return value
  return fallback
}

const isPrismaNotFound = (error) => error && error.code === "P2025"
const isPrismaUnique = (error) => error && error.code === "P2002"

module.exports = {
  parseJsonValue,
  stringifyJsonValue,
  nowSeconds,
  toMsBigInt,
  fromBigInt,
  isPrismaNotFound,
  isPrismaUnique,
}
