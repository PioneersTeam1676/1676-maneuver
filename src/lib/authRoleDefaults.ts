export type DefaultAuthRole = 'pending' | 'scout' | 'lead' | 'tech_lead'
export type RecoverableAuthRole =
  | 'blocked'
  | 'pending'
  | 'pit_scout'
  | 'drive_team'
  | 'scout_minus'
  | 'scout'
  | 'scout_plus'
  | 'lead'
  | 'tech_lead'

const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const parseAllowedEmailDomains = (domainsEnv?: string | null) =>
  Array.from(
    new Set(
      String(domainsEnv || 'pascack.org')
        .split(',')
        .map((domain) => domain.trim().toLowerCase().replace(/^@+/, ''))
        .filter(Boolean)
    )
  )

export const emailMatchesAllowedDomain = (email: string, allowedDomains: string[]) => {
  const domain = normalizeEmail(email).split('@')[1] || ''
  return Boolean(domain && allowedDomains.includes(domain))
}

export const resolveDefaultRoleForEmail = (
  email: string,
  {
    allowedDomains,
    adminEmails,
    ultraAdminEmails,
  }: {
    allowedDomains: string[]
    adminEmails: string[]
    ultraAdminEmails: string[]
  }
): DefaultAuthRole => {
  const normalized = normalizeEmail(email)
  if (ultraAdminEmails.includes(normalized)) return 'tech_lead'
  if (adminEmails.includes(normalized)) return 'lead'
  if (emailMatchesAllowedDomain(normalized, allowedDomains)) return 'scout'
  return 'pending'
}

const isApprovedRole = (role: RecoverableAuthRole) => role !== 'pending' && role !== 'blocked'

export const resolveRoleAfterRefreshFailure = ({
  existingRole,
  defaultRole,
}: {
  existingRole?: RecoverableAuthRole
  fallbackStatus?: number
  defaultRole: RecoverableAuthRole
}): RecoverableAuthRole => {
  if (existingRole && isApprovedRole(existingRole)) {
    return existingRole
  }
  return defaultRole
}

export const retainSessionStartRole = <Role extends string>({
  email,
  assignments,
}: {
  email: string
  assignments: Record<string, Role>
}): Record<string, Role> => {
  const normalized = normalizeEmail(email)
  if (!normalized) return { ...assignments }
  return { ...assignments }
}

export const mergeCurrentUserRole = <Role extends string>({
  email,
  role,
  assignments,
}: {
  email: string
  role: Role
  assignments: Record<string, Role>
}): Record<string, Role> => {
  const normalized = normalizeEmail(email)
  if (!normalized) return { ...assignments }
  return {
    ...assignments,
    [normalized]: role,
  }
}
