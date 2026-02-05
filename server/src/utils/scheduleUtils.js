const normalizeEmail = (value = "") => value.trim().toLowerCase()

const parseMatchOrder = (matchNumber) => {
  if (!matchNumber || typeof matchNumber !== "string") {
    return null
  }
  const digits = matchNumber.match(/\d+/g)
  if (!digits || digits.length === 0) {
    return null
  }
  const last = digits[digits.length - 1]
  const parsed = parseInt(last, 10)
  if (Number.isNaN(parsed)) {
    return null
  }
  return parsed
}

module.exports = {
  normalizeEmail,
  parseMatchOrder,
}
