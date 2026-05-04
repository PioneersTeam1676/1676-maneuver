import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { apiGet, apiDelete, apiPost, apiPut, ApiError } from "@/lib/apiClient"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { readScoutingSeason } from "@/lib/scoutingSeason"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "sonner"
import { Trash2, Search, UserX, User, Users, Crown, Wrench, Gamepad2, RefreshCw, Pencil, type LucideIcon } from "lucide-react"

interface User {
  email: string
  role: string
  isEntryOnly?: boolean
  activityCount?: number
  displayName?: string
  firstName?: string
  lastName?: string
  teamNumber?: string
  lastSeenAt?: string
  aliases?: string[]
  scoutingEntries?: number
  pitEntries?: number
  createdAt?: string
  lastActivity?: number
}

const roleColors: Record<string, string> = {
  activity_only: "bg-orange-500",
  blocked: "bg-red-700",
  pending: "bg-gray-500",
  pit_scout: "bg-green-500",
  drive_team: "bg-cyan-500",
  scout_minus: "bg-blue-300",
  scout: "bg-blue-500",
  scout_plus: "bg-blue-700",
  lead: "bg-purple-500",
  tech_lead: "bg-amber-700",
}

const roleIcons: Record<string, LucideIcon> = {
  activity_only: Search,
  blocked: UserX,
  pending: UserX,
  pit_scout: Wrench,
  drive_team: Gamepad2,
  scout_minus: User,
  scout: User,
  scout_plus: User,
  lead: Users,
  tech_lead: Crown,
}

const ROLE_LABELS: Record<string, string> = {
  blocked: "Blocked",
  pending: "Pending",
  pit_scout: "Pit Scout",
  drive_team: "Drive Team",
  scout_minus: "Scout −",
  scout: "Scout",
  scout_plus: "Scout +",
  lead: "Lead",
  tech_lead: "Tech Lead",
}

const ASSIGNABLE_ROLES = ["blocked", "pending", "pit_scout", "drive_team", "scout_minus", "scout", "scout_plus", "lead", "tech_lead"] as const

type RecentUserApiRecord = {
  email?: string
  acknowledged?: boolean
  displayName?: string
  firstName?: string
  lastName?: string
  display_name?: string
  first_name?: string
  last_name?: string
  teamNumber?: string
  team_number?: string
  lastSeenAt?: string
  last_seen_at?: string
  firstSeenAt?: string
  first_seen_at?: string
}

type RecentUsersResponse = { recentUsers?: RecentUserApiRecord[] } | RecentUserApiRecord[]

type ScoutingEntry = {
  scout_name?: string
  scoutName?: string
  timestamp?: number
}

type PitEntry = {
  timestamp?: number
}

type SyncResult = {
  synced: { email: string; displayName: string }[]
  alreadyHaveRole: { email: string; role: string; displayName: string }[]
  unmatched: string[]
}

type RenameScoutResult = {
  counts?: {
    scoutingEntries?: number
    pitEntries?: number
    predictions?: number
    achievements?: number
    scoutProfile?: number
    recentUsers?: number
  }
}

const DELETED_USERS_STORAGE_KEY = "user_management_deleted_users"

const normalizeScoutName = (value: string) =>
  value
    .trim()
    .replace(/['’.-]/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase()

const readDeletedUserTombstones = (): Record<string, string> => {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(DELETED_USERS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, string>
    return Object.entries(parsed).reduce<Record<string, string>>((acc, [email, timestamp]) => {
      const normalizedEmail = String(email || "").trim().toLowerCase()
      const normalizedTimestamp = String(timestamp || "").trim()
      if (!normalizedEmail || !normalizedTimestamp) return acc
      if (Number.isNaN(new Date(normalizedTimestamp).getTime())) return acc
      acc[normalizedEmail] = normalizedTimestamp
      return acc
    }, {})
  } catch {
    return {}
  }
}

const writeDeletedUserTombstones = (value: Record<string, string>) => {
  if (typeof window === "undefined") return
  window.localStorage.setItem(DELETED_USERS_STORAGE_KEY, JSON.stringify(value))
}

const recordDeletedUserTombstone = (email: string) => {
  const normalizedEmail = String(email || "").trim().toLowerCase()
  if (!normalizedEmail) return
  const next = readDeletedUserTombstones()
  next[normalizedEmail] = new Date().toISOString()
  writeDeletedUserTombstones(next)
}

export default function UserManagementPage() {
  const { user: currentUser, setRescouter, rescouterPermissions, isUltraAdmin } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [syncDialogOpen, setSyncDialogOpen] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [userToRename, setUserToRename] = useState<User | null>(null)
  const [renameName, setRenameName] = useState("")
  const [renaming, setRenaming] = useState(false)
  const buildSeasonUrl = (path: string, params?: Record<string, string>) => {
    const search = new URLSearchParams(params)
    const season = readScoutingSeason()
    if (season) {
      search.set("year", season)
    }
    const query = search.toString()
    return query ? `${path}?${query}` : path
  }

  const getUserDisplayName = (user?: User | null) => {
    if (!user) return ""
    return (
      user.displayName ||
      (user.firstName || user.lastName ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "") ||
      ""
    )
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  useEffect(() => {
    if (searchTerm.trim() === "") {
      setFilteredUsers(users)
    } else {
      const term = searchTerm.toLowerCase()
      setFilteredUsers(
        users.filter(
          (u) =>
            u.email.toLowerCase().includes(term) ||
            u.role.toLowerCase().includes(term) ||
            (u.displayName || "").toLowerCase().includes(term)
        )
      )
    }
  }, [searchTerm, users])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const [rolesData, recentUsersResp, allScoutingResp] = await Promise.all([
        apiGet<{ roleAssignments: Record<string, string> }>("/roles"),
        apiGet<RecentUsersResponse>("/recent-users").catch(() => ({ recentUsers: [] })),
        apiGet<{ entries: ScoutingEntry[] }>(buildSeasonUrl("/scouting")).catch(() => ({ entries: [] })),
      ])

      // Enhance with recent users data (handle API response shape)
      const recentUsersArray = Array.isArray(recentUsersResp)
        ? recentUsersResp
        : Array.isArray(recentUsersResp?.recentUsers)
          ? recentUsersResp.recentUsers
          : []

      const roleAssignments = Object.entries(rolesData.roleAssignments || {}).reduce<Record<string, string>>(
        (acc, [email, role]) => {
          const normalizedEmail = String(email || "").trim().toLowerCase()
          if (!normalizedEmail) return acc
          acc[normalizedEmail] = role
          return acc
        },
        {}
      )

      const deletedUserTombstones = readDeletedUserTombstones()
      const activeDeletedUserTombstones = { ...deletedUserTombstones }
      const recentUsersArrayForDisplay = recentUsersArray.filter((u) => {
        const normalizedEmail = String(u.email || "").trim().toLowerCase()
        if (!normalizedEmail) return false

        const deletedAt = deletedUserTombstones[normalizedEmail]
        if (!deletedAt) return true
        if (roleAssignments[normalizedEmail]) {
          delete activeDeletedUserTombstones[normalizedEmail]
          return true
        }

        const lastSeenAt =
          u.lastSeenAt ||
          u.last_seen_at ||
          u.firstSeenAt ||
          u.first_seen_at

        if (!lastSeenAt) return false
        if (new Date(lastSeenAt).getTime() > new Date(deletedAt).getTime()) {
          delete activeDeletedUserTombstones[normalizedEmail]
          return true
        }

        return false
      })

      if (Object.keys(activeDeletedUserTombstones).length !== Object.keys(deletedUserTombstones).length) {
        writeDeletedUserTombstones(activeDeletedUserTombstones)
      }

      const allUserEmails = Object.keys(roleAssignments)

      // Only explicit role assignments are treated as users.
      // Recent sign-ins without a role row should not rebuild deleted pending users.
      const userList: User[] = allUserEmails.map((email) => ({
        email,
        role: roleAssignments[email] || "pending",
      }))

      const recentUsersMap = new Map<string, RecentUserApiRecord>(
        recentUsersArrayForDisplay
          .filter((u) => typeof u.email === "string" && u.email.trim().length > 0)
          .map((u) => [u.email!.trim().toLowerCase(), u])
      )

      // Build unique scout names set for fallback guessing
      const allScoutNames: string[] = Array.isArray(allScoutingResp?.entries)
        ? (allScoutingResp.entries as ScoutingEntry[])
            .map((e) => e.scout_name || e.scoutName)
            .filter((v): v is string => typeof v === 'string')
        : []
      const uniqueScoutNames = Array.from(new Set(allScoutNames)) as string[]

      const guessDisplayName = (email: string): string | null => {
        try {
          const local = email.split('@')[0] || ''
          const lettersOnly = local.replace(/\d+/g, '')
          if (!lettersOnly) return null
          const firstInitial = lettersOnly[0]
          const last = lettersOnly.slice(1)
          if (!last) return null
          const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
          const lastName = cap(last)
          // Find candidates with matching last name and optional first initial
          const candidates = uniqueScoutNames.filter((full) => {
            const parts = full.trim().split(/\s+/)
            if (parts.length < 2) return false
            const first = parts[0]
            const lastWord = parts[parts.length - 1]
            if (lastWord !== lastName) return false
            return first[0]?.toLowerCase() === firstInitial.toLowerCase()
          })
          if (candidates.length === 1) return candidates[0]
          return null
        } catch {
          return null
        }
      }

      // Fetch activity counts and enhance user data
      const usersWithActivity = await Promise.all(
        userList.map(async (user) => {
          try {
            const recentUser = recentUsersMap.get(user.email.toLowerCase())
            
            // Use display name or construct from first/last name for scouting queries
            // since scout_name field stores display names, not emails
            const displayName =
              recentUser?.displayName || recentUser?.display_name || undefined
            const firstName =
              recentUser?.firstName || recentUser?.first_name || undefined
            const lastName =
              recentUser?.lastName || recentUser?.last_name || undefined
            const scoutDisplayName =
              displayName ||
              (firstName && lastName ? `${firstName} ${lastName}`.trim() : null) ||
              guessDisplayName(user.email)

            // Most entries use display names, but fallback to email for older datasets.
            const scoutQueryName = scoutDisplayName || user.email
            const [scoutingData, pitData] = await Promise.all([
              apiGet<{ entries: ScoutingEntry[] }>(buildSeasonUrl("/scouting", { scoutName: scoutQueryName })).catch(() => ({ entries: [] })),
              apiGet<{ entries: PitEntry[] }>(buildSeasonUrl("/pit", { scoutName: scoutQueryName })).catch(() => ({ entries: [] })),
            ])

            const scoutingEntries = scoutingData.entries?.length || 0
            const pitEntries = pitData.entries?.length || 0
            
            // Get timestamps for last activity
            const allTimestamps = [
              ...(scoutingData.entries || []).map((e) => e.timestamp),
              ...(pitData.entries || []).map((e) => e.timestamp),
            ].filter((value): value is number => typeof value === "number")
            
            return {
              ...user,
              activityCount: scoutingEntries + pitEntries,
              scoutingEntries,
              pitEntries,
              displayName: recentUser?.displayName || recentUser?.display_name,
              firstName: recentUser?.firstName || recentUser?.first_name,
              lastName: recentUser?.lastName || recentUser?.last_name,
              teamNumber: recentUser?.teamNumber || recentUser?.team_number,
              lastSeenAt: recentUser?.lastSeenAt || recentUser?.last_seen_at,
              createdAt: recentUser?.firstSeenAt || recentUser?.first_seen_at,
              lastActivity: allTimestamps.length > 0 ? Math.max(...allTimestamps) : undefined,
              aliases: [], // TODO: fetch from schedule aliases
            }
          } catch {
            return { 
              ...user, 
              activityCount: 0,
              scoutingEntries: 0,
              pitEntries: 0,
            }
          }
        })
      )

      const linkedScoutNames = new Set(
        usersWithActivity
          .map((user) => user.displayName || (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}`.trim() : guessDisplayName(user.email)))
          .filter((value): value is string => Boolean(value))
          .map((value) => normalizeScoutName(value))
      )

      const scoutingEntries = Array.isArray(allScoutingResp?.entries) ? allScoutingResp.entries : []
      const entryOnlyUsers = Array.from(
        scoutingEntries.reduce((acc, entry) => {
          const rawName = (entry.scout_name || entry.scoutName || "").trim()
          if (!rawName) return acc

          const key = normalizeScoutName(rawName)
          if (linkedScoutNames.has(key)) return acc

          const current = acc.get(key) || {
            email: `unlinked:${key.replace(/[^a-z0-9]+/g, "-")}`,
            role: "activity_only",
            isEntryOnly: true,
            displayName: rawName,
            activityCount: 0,
            scoutingEntries: 0,
            pitEntries: 0,
            aliases: [],
          }

          current.activityCount = (current.activityCount || 0) + 1
          current.scoutingEntries = (current.scoutingEntries || 0) + 1
          if (typeof entry.timestamp === "number") {
            current.lastActivity = Math.max(current.lastActivity || 0, entry.timestamp)
          }

          acc.set(key, current)
          return acc
        }, new Map<string, User>())
          .values()
      )

      // Sort by role importance, then by email
      const roleOrder = ["tech_lead", "lead", "scout", "pit_scout", "drive_team", "activity_only", "blocked", "pending"]
      const combinedUsers = [...usersWithActivity, ...entryOnlyUsers]
      combinedUsers.sort((a, b) => {
        const roleCompare =
          roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
        if (roleCompare !== 0) return roleCompare
        return (a.displayName || a.email).localeCompare(b.displayName || b.email)
      })

      setUsers(combinedUsers)
    } catch (error) {
      console.error("Error fetching users:", error)
      toast.error("Failed to fetch users")
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!userToDelete) return

    // Prevent deleting yourself
    if (userToDelete.email === currentUser?.email) {
      toast.error("You cannot delete your own account")
      setDeleteDialogOpen(false)
      return
    }

    // Prevent deleting tech leads or the last remaining lead
    const adminCount = users.filter((u) => u.role === 'lead' || u.role === 'tech_lead').length
    if (userToDelete.role === 'tech_lead') {
      toast.error("Technical Lead accounts cannot be deleted")
      setDeleteDialogOpen(false)
      return
    }
    if (userToDelete.role === 'lead' && adminCount <= 1) {
      toast.error("Add another lead before removing this account")
      setDeleteDialogOpen(false)
      return
    }

    setDeleting(true)
    try {
      const encodedEmail = encodeURIComponent(userToDelete.email)

      await apiDelete(`/roles/${encodedEmail}`)

      toast.success(`Removed ${userToDelete.email}`)
      recordDeletedUserTombstone(userToDelete.email)
      await fetchUsers()
      setDeleteDialogOpen(false)
      setUserToDelete(null)
    } catch (error) {
      console.error("Error deleting user:", error)
      // Treat missing role records as already-deleted and proceed optimistically.
      if (error instanceof ApiError && error.status === 404) {
        toast.success(`User ${userToDelete.email} was already removed`)
        recordDeletedUserTombstone(userToDelete.email)
        await fetchUsers()
        setDeleteDialogOpen(false)
        setUserToDelete(null)
      } else if (error instanceof ApiError && error.status === 500) {
        // Provide a clearer hint for common server protections
        const hint = userToDelete.role === 'admin'
          ? ' The server may be protecting the last admin. Add another admin first.'
          : ''
        toast.error(`Failed to remove user.${hint}`)
      } else {
        toast.error("Failed to remove user")
      }
    } finally {
      setDeleting(false)
    }
  }

  const confirmDelete = (user: User) => {
    setUserToDelete(user)
    setDeleteDialogOpen(true)
  }

  const handleSyncFromEntries = async () => {
    setSyncing(true)
    try {
      const result = await apiPost<SyncResult>(buildSeasonUrl("/roles/sync-from-entries"), {})
      setSyncResult(result)
      setSyncDialogOpen(true)
      if (result.synced.length > 0) {
        await fetchUsers()
      }
    } catch (error) {
      console.error("Sync failed:", error)
      toast.error("Failed to sync scouts")
    } finally {
      setSyncing(false)
    }
  }

  const viewUserDetails = (user: User) => {
    setSelectedUser(user)
    setDetailDialogOpen(true)
  }

  const openRenameDialog = (user: User) => {
    setUserToRename(user)
    setRenameName(getUserDisplayName(user))
    setRenameDialogOpen(true)
  }

  const handleRenameScout = async () => {
    if (!userToRename) return

    const newName = renameName.trim()
    const oldName = getUserDisplayName(userToRename).trim()
    if (!newName) {
      toast.error("Scout name is required")
      return
    }
    if (oldName && oldName === newName) {
      toast.error("Enter a different scout name")
      return
    }

    setRenaming(true)
    try {
      const payload: { oldName?: string; newName: string; email?: string } = { newName }
      if (oldName) payload.oldName = oldName
      if (!userToRename.isEntryOnly) payload.email = userToRename.email

      const result = await apiPost<RenameScoutResult>(buildSeasonUrl("/roles/rename-scout"), payload)
      const updatedEntries = (result.counts?.scoutingEntries || 0) + (result.counts?.pitEntries || 0)
      const updatedGameRows =
        (result.counts?.predictions || 0) +
        (result.counts?.achievements || 0) +
        (result.counts?.scoutProfile || 0)

      toast.success(
        `Renamed ${oldName || userToRename.email} to ${newName}` +
          (updatedEntries || updatedGameRows ? ` (${updatedEntries + updatedGameRows} DB rows updated)` : "")
      )
      setRenameDialogOpen(false)
      setUserToRename(null)
      setRenameName("")
      await fetchUsers()
      setSelectedUser((prev) => prev && prev.email === userToRename.email ? { ...prev, displayName: newName } : prev)
    } catch (error) {
      console.error("Failed to rename scout:", error)
      if (error instanceof ApiError && error.status === 409) {
        toast.error("A scout profile already exists with that name")
      } else {
        toast.error("Failed to rename scout")
      }
    } finally {
      setRenaming(false)
    }
  }

  const handleRoleChange = async (user: User, newRole: string) => {
    if (user.isEntryOnly || !user.email) return
    try {
      await apiPut(`/roles/${encodeURIComponent(user.email)}`, { role: newRole })
      setUsers((prev) => prev.map((u) => u.email === user.email ? { ...u, role: newRole } : u))
      setSelectedUser((prev) => prev ? { ...prev, role: newRole } : prev)
      toast.success(`Role updated to ${ROLE_LABELS[newRole] ?? newRole}`)
    } catch {
      toast.error("Failed to update role")
    }
  }

  const handleRescouterToggle = async (targetUser: User, enabled: boolean) => {
    try {
      await setRescouter(targetUser.email, enabled)
      toast.success(`Rescouter ${enabled ? "enabled" : "disabled"} for ${targetUser.displayName || targetUser.email}`)
    } catch {
      toast.error("Failed to update rescouter permission")
    }
  }

  const formatDate = (timestamp?: number | string) => {
    if (!timestamp) return "Never"
    const date = typeof timestamp === "number" ? new Date(timestamp) : new Date(timestamp)
    return date.toLocaleString()
  }

  const formatRelativeTime = (timestamp?: number | string) => {
    if (!timestamp) return "Never"
    const date = typeof timestamp === "number" ? timestamp : new Date(timestamp).getTime()
    const now = Date.now()
    const diff = now - date
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 1) return "Just now"
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 30) return `${days}d ago`
    return formatDate(timestamp)
  }

  const stats = {
    total: users.length,
    admins: users.filter((u) => u.role === "lead" || u.role === "tech_lead").length,
    scouts: users.filter((u) => ["scout", "scout_plus", "scout_minus", "activity_only"].includes(u.role)).length,
    pending: users.filter((u) => u.role === "pending").length,
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">User Management</h1>
          <p className="text-muted-foreground">
            Manage user accounts and permissions
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleSyncFromEntries}
          disabled={syncing}
          className="shrink-0 mt-1"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync Scouts"}
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Users
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Admins
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.admins}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Scouts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.scouts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.pending}</div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Search Users</CardTitle>
          <CardDescription>
            Filter by name, email, or role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by name, email, or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* User List */}
      <Card>
        <CardHeader>
          <CardTitle>All Users ({filteredUsers.length})</CardTitle>
          <CardDescription>
            Manage user accounts and remove users when needed
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm ? "No users found matching your search" : "No users found"}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUsers.map((user) => {
                const RoleIcon = roleIcons[user.role] || User
                const isSelf = user.email === currentUser?.email
                const canDeleteUser = !isSelf && !user.isEntryOnly
                const canRenameUser = Boolean(getUserDisplayName(user) || !user.isEntryOnly)

                return (
                  <div
                    key={user.email}
                    className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer"
                    onClick={() => viewUserDetails(user)}
                  >
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={`p-2 rounded-full ${roleColors[user.role]}`}>
                        <RoleIcon className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">
                            {user.displayName || (user.firstName || user.lastName)
                              ? (user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim())
                              : user.email}
                          </p>
                          {isSelf && (
                            <Badge variant="outline" className="text-xs">
                              You
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {user.isEntryOnly ? "No linked email on server yet" : user.email}
                        </p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <Badge
                            variant="secondary"
                            className={`${roleColors[user.role] ?? "bg-gray-500"} text-white`}
                          >
                            {ROLE_LABELS[user.role] ?? user.role}
                          </Badge>
                          {user.activityCount !== undefined && user.activityCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {user.scoutingEntries || 0} matches · {user.pitEntries || 0} pit
                            </span>
                          )}
                          {user.teamNumber && (
                            <span className="text-xs text-muted-foreground">
                              Team {user.teamNumber}
                            </span>
                          )}
                          {user.lastActivity && (
                            <span className="text-xs text-muted-foreground">
                              Active {formatRelativeTime(user.lastActivity)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {!user.isEntryOnly && isUltraAdmin && (
                      <div className="flex items-center gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={user.role}
                          onValueChange={(newRole) => handleRoleChange(user, newRole)}
                        >
                          <SelectTrigger className="w-32 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNABLE_ROLES.map((r) => (
                              <SelectItem key={r} value={r} className="text-xs">
                                {ROLE_LABELS[r] ?? r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-1" title="Rescouter access">
                          <Checkbox
                            id={`rescout-${user.email}`}
                            checked={
                              user.email.toLowerCase() in rescouterPermissions
                                ? rescouterPermissions[user.email.toLowerCase()]
                                : ["scout_plus", "lead", "tech_lead"].includes(user.role)
                            }
                            onCheckedChange={(checked) => handleRescouterToggle(user, !!checked)}
                            className="h-3 w-3"
                          />
                          <label htmlFor={`rescout-${user.email}`} className="text-xs text-muted-foreground cursor-pointer">
                            Rescout
                          </label>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-1 ml-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          openRenameDialog(user)
                        }}
                        disabled={!canRenameUser}
                        title="Rename scout in the database"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          confirmDelete(user)
                        }}
                        disabled={!canDeleteUser}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title={user.isEntryOnly ? "No linked account to remove yet" : isSelf ? "Cannot delete your own account" : "Remove user"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Detail Modal */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>User Details</DialogTitle>
            <DialogDescription>
              Complete information and activity for {selectedUser?.displayName || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>
          
          {selectedUser && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Basic Information</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <p className="font-medium break-all">{selectedUser.isEntryOnly ? "No linked email on server yet" : selectedUser.email}</p>
                  </div>
                  {selectedUser.displayName && (
                    <div>
                      <span className="text-muted-foreground">Display Name:</span>
                      <p className="font-medium">{selectedUser.displayName}</p>
                    </div>
                  )}
                  {selectedUser.firstName && (
                    <div>
                      <span className="text-muted-foreground">First Name:</span>
                      <p className="font-medium">{selectedUser.firstName}</p>
                    </div>
                  )}
                  {selectedUser.lastName && (
                    <div>
                      <span className="text-muted-foreground">Last Name:</span>
                      <p className="font-medium">{selectedUser.lastName}</p>
                    </div>
                  )}
                  {selectedUser.teamNumber && (
                    <div>
                      <span className="text-muted-foreground">Team Number:</span>
                      <p className="font-medium">{selectedUser.teamNumber}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Role:</span>
                    {selectedUser.isEntryOnly ? (
                      <div className="mt-1">
                        <Badge className={`${roleColors[selectedUser.role] ?? "bg-gray-500"} text-white`}>
                          {ROLE_LABELS[selectedUser.role] ?? selectedUser.role}
                        </Badge>
                      </div>
                    ) : (
                      <div className="mt-1">
                        <Badge className={`${roleColors[selectedUser.role] ?? "bg-gray-500"} text-white`}>
                          {ROLE_LABELS[selectedUser.role] ?? selectedUser.role}
                        </Badge>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Activity Stats */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Activity Statistics</h3>
                <div className="grid grid-cols-2 gap-3">
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Match Scouting</p>
                      <p className="text-2xl font-bold">{selectedUser.scoutingEntries || 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Pit Scouting</p>
                      <p className="text-2xl font-bold">{selectedUser.pitEntries || 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Total Entries</p>
                      <p className="text-2xl font-bold">{selectedUser.activityCount || 0}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-xs text-muted-foreground">Last Active</p>
                      <p className="text-sm font-medium">
                        {formatRelativeTime(selectedUser.lastActivity)}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Timeline</h3>
                <div className="space-y-2 text-sm">
                  {selectedUser.createdAt && (
                    <div className="flex justify-between p-2 rounded bg-muted/50">
                      <span className="text-muted-foreground">First Seen:</span>
                      <span className="font-medium">{formatDate(selectedUser.createdAt)}</span>
                    </div>
                  )}
                  {selectedUser.lastSeenAt && (
                    <div className="flex justify-between p-2 rounded bg-muted/50">
                      <span className="text-muted-foreground">Last Seen:</span>
                      <span className="font-medium">{formatDate(selectedUser.lastSeenAt)}</span>
                    </div>
                  )}
                  {selectedUser.lastActivity && (
                    <div className="flex justify-between p-2 rounded bg-muted/50">
                      <span className="text-muted-foreground">Last Activity:</span>
                      <span className="font-medium">{formatDate(selectedUser.lastActivity)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Aliases */}
              {selectedUser.aliases && selectedUser.aliases.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-semibold text-sm">Known Aliases</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedUser.aliases.map((alias, idx) => (
                      <Badge key={idx} variant="outline">
                        {alias}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => openRenameDialog(selectedUser)}
                  disabled={!getUserDisplayName(selectedUser) && selectedUser.isEntryOnly}
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Rename Scout
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setDetailDialogOpen(false)
                    confirmDelete(selectedUser)
                  }}
                  disabled={selectedUser.email === currentUser?.email || selectedUser.isEntryOnly}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remove User
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setDetailDialogOpen(false)}
                  className="ml-auto"
                >
                  Close
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rename Scout Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Scout</DialogTitle>
            <DialogDescription>
              Update this scout name in the selected season database and linked user record.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 text-sm">
              <span className="text-muted-foreground">Current name:</span>
              <p className="font-medium">{getUserDisplayName(userToRename) || userToRename?.email}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rename-scout-name">New scout name</Label>
              <Input
                id="rename-scout-name"
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                placeholder="Enter scout name"
                disabled={renaming}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleRenameScout()
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameDialogOpen(false)} disabled={renaming}>
                Cancel
              </Button>
              <Button onClick={handleRenameScout} disabled={renaming || !renameName.trim()}>
                {renaming ? "Renaming..." : "Rename"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{userToDelete?.email}</strong>?
              <br />
              <br />
              This will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Remove their account and permissions</li>
                <li>Keep their scouting data (for records)</li>
                <li>Prevent them from logging in</li>
              </ul>
              <br />
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? "Removing..." : "Remove User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sync Result Dialog */}
      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scout Sync Results</DialogTitle>
            <DialogDescription>
              Matched scout names from season scouting entries to server-linked user accounts
            </DialogDescription>
          </DialogHeader>
          {syncResult && (
            <div className="space-y-4 text-sm">
              {syncResult.synced.length > 0 && (
                <div>
                  <h4 className="font-semibold text-green-600 mb-2">
                    ✓ Assigned scout role ({syncResult.synced.length})
                  </h4>
                  <div className="space-y-1">
                    {syncResult.synced.map((s) => (
                      <div key={s.email} className="flex justify-between p-2 rounded bg-green-50 dark:bg-green-950/30">
                        <span className="font-medium">{s.displayName}</span>
                        <span className="text-muted-foreground truncate ml-2">{s.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {syncResult.alreadyHaveRole.length > 0 && (
                <div>
                  <h4 className="font-semibold text-muted-foreground mb-2">
                    Already have a role ({syncResult.alreadyHaveRole.length})
                  </h4>
                  <div className="space-y-1">
                    {syncResult.alreadyHaveRole.map((s) => (
                      <div key={s.email} className="flex justify-between p-2 rounded bg-muted/50">
                        <span>{s.displayName}</span>
                        <Badge variant="secondary" className={`${roleColors[s.role] || ""} text-white`}>
                          {s.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {syncResult.unmatched.length > 0 && (
                <div>
                  <h4 className="font-semibold text-amber-600 mb-2">
                    No linked server account found ({syncResult.unmatched.length})
                  </h4>
                  <p className="text-xs text-muted-foreground mb-2">
                    These names appear in scouting data, but the server does not currently have an email-linked user record for them.
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {syncResult.unmatched.map((name) => (
                      <Badge key={name} variant="outline">{name}</Badge>
                    ))}
                  </div>
                </div>
              )}
              {syncResult.synced.length === 0 && syncResult.unmatched.length === 0 && (
                <p className="text-muted-foreground text-center py-4">All scouts already have roles assigned.</p>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
