type ResettableRoleAssignments<Role extends string> = Record<string, Role>

type ResettableRecentUser = {
  email: string
}

type ResettableAllianceProfile = {
  email: string
}

type ResetVerificationStateInput<
  Role extends string,
  RecentUser extends ResettableRecentUser,
  AllianceProfile extends ResettableAllianceProfile,
> = {
  email: string
  roles: ResettableRoleAssignments<Role>
  recentUsers: RecentUser[]
  allianceProfiles: Record<string, AllianceProfile>
}

type ResetVerificationStateResult<
  Role extends string,
  RecentUser extends ResettableRecentUser,
  AllianceProfile extends ResettableAllianceProfile,
> = {
  roles: ResettableRoleAssignments<Role>
  recentUsers: RecentUser[]
  allianceProfiles: Record<string, AllianceProfile>
}

const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const resetVerificationState = <
  Role extends string,
  RecentUser extends ResettableRecentUser,
  AllianceProfile extends ResettableAllianceProfile,
>({
  email,
  roles,
  recentUsers,
  allianceProfiles,
}: ResetVerificationStateInput<Role, RecentUser, AllianceProfile>): ResetVerificationStateResult<Role, RecentUser, AllianceProfile> => {
  const normalized = normalizeEmail(email)
  const nextRoles = { ...roles }
  const nextAllianceProfiles = { ...allianceProfiles }

  delete nextRoles[normalized]
  delete nextAllianceProfiles[normalized]

  return {
    roles: nextRoles,
    recentUsers: recentUsers.filter((record) => normalizeEmail(record.email) !== normalized),
    allianceProfiles: nextAllianceProfiles,
  }
}
