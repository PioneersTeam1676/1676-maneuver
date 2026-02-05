import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { apiGet, apiDelete, apiPut, ApiError } from "@/lib/apiClient"
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
import { Trash2, Search, UserX, Shield, User, Users, Crown, ClipboardSignature, type LucideIcon } from "lucide-react"

interface User {
  email: string
  role: string
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
  pending: "bg-gray-500",
  scout: "bg-blue-500",
  lead: "bg-purple-500",
  form_maker: "bg-teal-500",
  admin: "bg-orange-500",
  ultra_admin: "bg-yellow-500",
}

const roleIcons: Record<string, LucideIcon> = {
  pending: UserX,
  scout: User,
  lead: Users,
  form_maker: ClipboardSignature,
  admin: Shield,
  ultra_admin: Crown,
}

type RecentUserApiRecord = {
  email?: string
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

export default function UserManagementPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [filteredUsers, setFilteredUsers] = useState<User[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [loading, setLoading] = useState(true)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [deleting, setDeleting] = useState(false)
  const buildSeasonUrl = (path: string, params?: Record<string, string>) => {
    const search = new URLSearchParams(params)
    const season = readScoutingSeason()
    if (season) {
      search.set("year", season)
    }
    const query = search.toString()
    return query ? `${path}?${query}` : path
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
            u.role.toLowerCase().includes(term)
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
      
      // Convert roleAssignments object to array
      const userList: User[] = Object.entries(rolesData.roleAssignments).map(
        ([email, role]) => ({
          email,
          role: role as string,
        })
      )

      // Enhance with recent users data (handle API response shape)
      const recentUsersArray = Array.isArray(recentUsersResp)
        ? recentUsersResp
        : Array.isArray(recentUsersResp?.recentUsers)
          ? recentUsersResp.recentUsers
          : []

      const recentUsersMap = new Map<string, RecentUserApiRecord>(
        recentUsersArray.map((u) => [u.email?.toLowerCase() || "", u])
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
            
            // Only fetch scouting data if we have a display name to query with
            const [scoutingData, pitData] = scoutDisplayName 
              ? await Promise.all([
                  apiGet<{ entries: ScoutingEntry[] }>(buildSeasonUrl("/scouting", { scout_name: scoutDisplayName })).catch(() => ({ entries: [] })),
                  apiGet<{ entries: PitEntry[] }>(buildSeasonUrl("/pit", { scout_name: scoutDisplayName })).catch(() => ({ entries: [] })),
                ])
              : [{ entries: [] }, { entries: [] }]

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
              displayName: recentUser?.displayName,
              firstName: recentUser?.firstName,
              lastName: recentUser?.lastName,
              teamNumber: recentUser?.teamNumber,
              lastSeenAt: recentUser?.lastSeenAt,
              createdAt: recentUser?.firstSeenAt,
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

      // Sort by role importance, then by email
      const roleOrder = ["ultra_admin", "admin", "form_maker", "lead", "scout", "pending"]
      usersWithActivity.sort((a, b) => {
        const roleCompare =
          roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
        if (roleCompare !== 0) return roleCompare
        return a.email.localeCompare(b.email)
      })

      setUsers(usersWithActivity)
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

    // Prevent deleting ultra admins or the last remaining admin
    const adminCount = users.filter((u) => u.role === 'admin' || u.role === 'ultra_admin').length
    if (userToDelete.role === 'ultra_admin') {
      toast.error("Ultra admin accounts cannot be deleted")
      setDeleteDialogOpen(false)
      return
    }
    if (userToDelete.role === 'admin' && adminCount <= 1) {
      toast.error("Add another admin before removing this account")
      setDeleteDialogOpen(false)
      return
    }

    setDeleting(true)
    try {
      // First, unverify the user by setting their role to pending
      await apiPut(`/roles/${encodeURIComponent(userToDelete.email)}`, { role: 'pending' })
      
      // Then delete the user
      await apiDelete(`/roles/${encodeURIComponent(userToDelete.email)}`)

      toast.success(`Removed and unverified ${userToDelete.email}`)
      setUsers((prev) => prev.filter((u) => u.email !== userToDelete.email))
      setDeleteDialogOpen(false)
      setUserToDelete(null)
    } catch (error) {
      console.error("Error deleting user:", error)
      // Treat 404 as already-deleted and proceed optimistically
      if (error instanceof ApiError && error.status === 404) {
        toast.success(`User ${userToDelete.email} was already removed`)
        setUsers((prev) => prev.filter((u) => u.email !== userToDelete.email))
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

  const viewUserDetails = (user: User) => {
    setSelectedUser(user)
    setDetailDialogOpen(true)
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
    admins: users.filter((u) => u.role === "admin" || u.role === "ultra_admin").length,
    scouts: users.filter((u) => u.role === "scout").length,
    pending: users.filter((u) => u.role === "pending").length,
  }

  return (
    <div className="container mx-auto p-4 max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">User Management</h1>
        <p className="text-muted-foreground">
          Manage user accounts and permissions
        </p>
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
            Filter by email or role
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search by email or role..."
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
                            {user.displayName || user.firstName && user.lastName 
                              ? `${user.firstName} ${user.lastName}`.trim() 
                              : user.email}
                          </p>
                          {isSelf && (
                            <Badge variant="outline" className="text-xs">
                              You
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <Badge
                            variant="secondary"
                            className={`${roleColors[user.role]} text-white`}
                          >
                            {user.role}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation()
                        confirmDelete(user)
                      }}
                      disabled={isSelf}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      title={isSelf ? "Cannot delete your own account" : "Remove user"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
                    <p className="font-medium break-all">{selectedUser.email}</p>
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
                    <div className="mt-1">
                      <Badge className={`${roleColors[selectedUser.role]} text-white`}>
                        {selectedUser.role}
                      </Badge>
                    </div>
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
                  variant="destructive"
                  onClick={() => {
                    setDetailDialogOpen(false)
                    confirmDelete(selectedUser)
                  }}
                  disabled={selectedUser.email === currentUser?.email}
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
    </div>
  )
}
