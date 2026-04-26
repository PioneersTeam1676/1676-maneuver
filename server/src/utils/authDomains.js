const parseDomainList = (...values) =>
  values
    .flatMap((value) =>
      String(value || "")
        .split(",")
        .map((domain) => domain.trim().toLowerCase())
        .filter(Boolean)
    )

const getAllowedEmailDomains = () => {
  const configured = parseDomainList(
    process.env.ALLOWED_EMAIL_DOMAINS,
    process.env.ALLOWED_EMAIL_DOMAIN,
    process.env.VITE_ALLOWED_EMAIL_DOMAINS,
    process.env.VITE_ALLOWED_EMAIL_DOMAIN
  )

  return configured.length > 0 ? configured : ["pascack.org"]
}

const emailMatchesAllowedDomain = (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase()
  const domain = normalizedEmail.split("@")[1] || ""
  if (!domain) return false
  return getAllowedEmailDomains().includes(domain)
}

module.exports = {
  getAllowedEmailDomains,
  emailMatchesAllowedDomain,
}
