type VerificationRecord = {
  email: string
  acknowledged?: boolean | null
  displayName?: string | null
  firstName?: string | null
  lastName?: string | null
  teamNumber?: string | null
  assignedRole?: string | null
}

type StoredVerificationProfile = Pick<VerificationRecord, "email" | "displayName" | "firstName" | "lastName" | "teamNumber">

const trim = (value?: string | null) => value?.trim() || ""
const normalizeEmail = (email: string) => email.trim().toLowerCase()

const toStoredProfile = (record?: StoredVerificationProfile | null) => {
  if (!record) return null
  const firstName = trim(record.firstName)
  const lastName = trim(record.lastName)
  const teamNumber = trim(record.teamNumber)
  if (!firstName || !lastName || !teamNumber) return null

  return {
    firstName,
    lastName,
    displayName: trim(record.displayName) || `${firstName} ${lastName}`.trim(),
    teamNumber,
  }
}

const matchesAllowedDomain = (email: string, domains: string[]) => {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  return domains.some((domain) => domain && normalized.endsWith(`@${domain}`))
}

export const hasCompletedOnboarding = (record: Pick<VerificationRecord, "firstName" | "lastName" | "teamNumber">) =>
  Boolean(trim(record.firstName) && trim(record.lastName) && trim(record.teamNumber))

export const isPendingVerificationRequest = (
  record: Pick<VerificationRecord, "email" | "acknowledged" | "assignedRole" | "firstName" | "lastName" | "teamNumber">,
  allowedDomains: string[],
) =>
  !record.acknowledged &&
  record.assignedRole === "pending" &&
  !matchesAllowedDomain(record.email, allowedDomains.filter(Boolean)) &&
  hasCompletedOnboarding(record)

export const formatVerificationRecordName = (record: VerificationRecord) => {
  const profileName = `${trim(record.firstName)} ${trim(record.lastName)}`.trim()
  return profileName || trim(record.displayName) || "Unknown user"
}

export const findStoredVerificationProfile = (
  email: string,
  profilesByEmail: Record<string, StoredVerificationProfile | undefined>,
  recentUsers: Array<VerificationRecord>,
) => {
  const normalized = normalizeEmail(email)
  if (!normalized) return null

  return (
    toStoredProfile(profilesByEmail[normalized]) ||
    toStoredProfile(recentUsers.find((record) => normalizeEmail(record.email) === normalized)) ||
    null
  )
}
