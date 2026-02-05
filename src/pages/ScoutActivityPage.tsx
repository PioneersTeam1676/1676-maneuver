import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiGet } from "@/lib/apiClient"
import { readScoutingSeason } from "@/lib/scoutingSeason"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import {
  Search,
  ClipboardList,
  Trophy,
  Calendar,
  Camera,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react"

interface ScoutingEntry {
  id: string
  team_number: string
  match_number: string
  alliance: string
  scout_name: string
  event_name: string
  data: unknown
  timestamp: number
}

interface PitEntry {
  id: string
  team_number: string
  event_name: string
  scout_name: string
  data: unknown
  timestamp: number
}

interface ScoutProfile {
  email: string
  role: string
  scoutingEntries: ScoutingEntry[]
  pitEntries: PitEntry[]
  totalMatches: number
  totalPitScouting: number
  eventsParticipated: string[]
  teamsScoutedCount: number
  avgMatchesPerDay: number
  lastActivity: number | null
}

interface ExpandedState {
  [key: string]: boolean
}

type RecentUserApiRecord = {
  email?: string
  displayName?: string
  firstName?: string
  lastName?: string
  display_name?: string
  first_name?: string
  last_name?: string
}

type RecentUsersResponse = { recentUsers?: RecentUserApiRecord[] } | RecentUserApiRecord[]

export default function ScoutActivityPage() {
  const [scouts, setScouts] = useState<ScoutProfile[]>([])
  const [selectedScout, setSelectedScout] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [expandedMatches, setExpandedMatches] = useState<ExpandedState>({})
  const [expandedPitEntries, setExpandedPitEntries] = useState<ExpandedState>({})
  const [searchTerm, setSearchTerm] = useState("")

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
    fetchScouts()
  }, [])

  const fetchScouts = async () => {
    setLoading(true)
    try {
      // Fetch all users with roles
      const [rolesData, recentUsersResp] = await Promise.all([
        apiGet<{ roleAssignments: Record<string, string> }>("/roles"),
        apiGet<RecentUsersResponse>("/recent-users").catch(() => ({ recentUsers: [] })),
      ])

      const userEmails = Object.keys(rolesData.roleAssignments)
      
      // Create a map of emails to recent user data (handle API response shape)
      const recentUsersArray = Array.isArray(recentUsersResp)
        ? recentUsersResp
        : Array.isArray(recentUsersResp?.recentUsers)
          ? recentUsersResp.recentUsers
          : []

      const recentUsersMap = new Map<string, RecentUserApiRecord>(
        recentUsersArray.map((u) => [u.email?.toLowerCase() || "", u])
      )

      // Fetch activity for each user
      const scoutProfiles = await Promise.all(
        userEmails.map(async (email) => {
          try {
            const recentUser = recentUsersMap.get(email.toLowerCase())
            
            // Use display name for queries since scout_name field stores display names, not emails
            const displayName =
              recentUser?.displayName || recentUser?.display_name || undefined
            const firstName =
              recentUser?.firstName || recentUser?.first_name || undefined
            const lastName =
              recentUser?.lastName || recentUser?.last_name || undefined
            const scoutDisplayName =
              displayName ||
              (firstName && lastName ? `${firstName} ${lastName}`.trim() : null)
            
            // Only fetch if we have a display name to query with
            const [scoutingData, pitData] = scoutDisplayName
              ? await Promise.all([
                  apiGet<{ entries: ScoutingEntry[] }>(buildSeasonUrl("/scouting", { scout_name: scoutDisplayName })).catch(() => ({ entries: [] })),
                  apiGet<{ entries: PitEntry[] }>(buildSeasonUrl("/pit", { scout_name: scoutDisplayName })).catch(() => ({ entries: [] })),
                ])
              : [{ entries: [] }, { entries: [] }]

            const scoutingEntries: ScoutingEntry[] = scoutingData.entries || []
            const pitEntries: PitEntry[] = pitData.entries || []

            // Parse data field if it's a string
            scoutingEntries.forEach((entry) => {
              if (typeof entry.data === "string") {
                try {
                  entry.data = JSON.parse(entry.data)
                } catch {
                  entry.data = {}
                }
              }
            })

            pitEntries.forEach((entry) => {
              if (typeof entry.data === "string") {
                try {
                  entry.data = JSON.parse(entry.data)
                } catch {
                  entry.data = {}
                }
              }
            })

            // Calculate stats
            const allTimestamps = [
              ...scoutingEntries.map((e) => e.timestamp),
              ...pitEntries.map((e) => e.timestamp),
            ]
            const lastActivity =
              allTimestamps.length > 0 ? Math.max(...allTimestamps) : null

            const eventsSet = new Set([
              ...scoutingEntries.map((e) => e.event_name).filter(Boolean),
              ...pitEntries.map((e) => e.event_name).filter(Boolean),
            ])

            const teamsSet = new Set([
              ...scoutingEntries.map((e) => e.team_number).filter(Boolean),
              ...pitEntries.map((e) => e.team_number).filter(Boolean),
            ])

            // Calculate average matches per day
            let avgMatchesPerDay = 0
            if (scoutingEntries.length > 0 && allTimestamps.length > 0) {
              const minTimestamp = Math.min(...allTimestamps)
              const maxTimestamp = Math.max(...allTimestamps)
              const daysDiff =
                (maxTimestamp - minTimestamp) / (1000 * 60 * 60 * 24)
              avgMatchesPerDay =
                daysDiff > 0 ? scoutingEntries.length / daysDiff : 0
            }

            return {
              email,
              role: rolesData.roleAssignments[email],
              scoutingEntries,
              pitEntries,
              totalMatches: scoutingEntries.length,
              totalPitScouting: pitEntries.length,
              eventsParticipated: Array.from(eventsSet),
              teamsScoutedCount: teamsSet.size,
              avgMatchesPerDay,
              lastActivity,
            }
          } catch (error) {
            console.error(`Error fetching data for ${email}:`, error)
            return {
              email,
              role: rolesData.roleAssignments[email],
              scoutingEntries: [],
              pitEntries: [],
              totalMatches: 0,
              totalPitScouting: 0,
              eventsParticipated: [],
              teamsScoutedCount: 0,
              avgMatchesPerDay: 0,
              lastActivity: null,
            }
          }
        })
      )

      // Sort by total activity
      scoutProfiles.sort(
        (a, b) =>
          b.totalMatches +
          b.totalPitScouting -
          (a.totalMatches + a.totalPitScouting)
      )

      setScouts(scoutProfiles)

      // Auto-select first scout with activity
      const activeScout = scoutProfiles.find(
        (s) => s.totalMatches > 0 || s.totalPitScouting > 0
      )
      if (activeScout) {
        setSelectedScout(activeScout.email)
      }
    } catch (error) {
      console.error("Error fetching scout data:", error)
      toast.error("Failed to fetch scout activity")
    } finally {
      setLoading(false)
    }
  }

  const toggleMatchExpand = (id: string) => {
    setExpandedMatches((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const togglePitExpand = (id: string) => {
    setExpandedPitEntries((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const currentScoutProfile = scouts.find((s) => s.email === selectedScout)

  const filteredScouts = scouts.filter(
    (s) =>
      s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.role.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString()
  }

  const formatRelativeTime = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${days}d ago`
  }

  return (
    <div className="container mx-auto p-4 max-w-7xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Scout Activity Monitor</h1>
        <p className="text-muted-foreground">
          View detailed activity and performance for each scout
        </p>
      </div>

      {/* Scout Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Scout</CardTitle>
          <CardDescription>
            Choose a scout to view their detailed activity
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search scouts..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          <Select value={selectedScout} onValueChange={setSelectedScout}>
            <SelectTrigger>
              <SelectValue placeholder="Select a scout" />
            </SelectTrigger>
            <SelectContent>
              {filteredScouts.map((scout) => (
                <SelectItem key={scout.email} value={scout.email}>
                  <div className="flex items-center justify-between w-full">
                    <span>{scout.email}</span>
                    <span className="text-xs text-muted-foreground ml-4">
                      {scout.totalMatches + scout.totalPitScouting} entries
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              Loading scout data...
            </div>
          </CardContent>
        </Card>
      ) : !currentScoutProfile ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              {selectedScout
                ? "Scout not found"
                : "Please select a scout to view their activity"}
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Match Entries
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {currentScoutProfile.totalMatches}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Pit Entries
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {currentScoutProfile.totalPitScouting}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Events
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {currentScoutProfile.eventsParticipated.length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Teams Scouted
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {currentScoutProfile.teamsScoutedCount}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Last Active
                  </CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-bold">
                  {currentScoutProfile.lastActivity
                    ? formatRelativeTime(currentScoutProfile.lastActivity)
                    : "Never"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Scout Info Card */}
          <Card>
            <CardHeader>
              <CardTitle>Scout Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Email</span>
                <span className="font-medium">{currentScoutProfile.email}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Role</span>
                <Badge>{currentScoutProfile.role}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Avg Matches/Day
                </span>
                <span className="font-medium">
                  {currentScoutProfile.avgMatchesPerDay.toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Events Participated
                </span>
                <span className="font-medium">
                  {currentScoutProfile.eventsParticipated.join(", ") ||
                    "None"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Activity Tabs */}
          <Tabs defaultValue="matches" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="matches">
                Match Scouting ({currentScoutProfile.totalMatches})
              </TabsTrigger>
              <TabsTrigger value="pit">
                Pit Scouting ({currentScoutProfile.totalPitScouting})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="matches" className="space-y-3">
              <Card>
                <CardHeader>
                  <CardTitle>Match Scouting Entries</CardTitle>
                  <CardDescription>
                    All match scouting data submitted by this scout
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {currentScoutProfile.scoutingEntries.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No match scouting entries yet
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {currentScoutProfile.scoutingEntries
                        .sort((a, b) => b.timestamp - a.timestamp)
                        .map((entry) => {
                          const isExpanded = expandedMatches[entry.id]
                          return (
                            <Card
                              key={entry.id}
                              className="border hover:bg-accent/50 transition-colors"
                            >
                              <CardContent className="p-4">
                                <div className="space-y-2">
                                  {/* Header */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <Badge
                                        variant={
                                          entry.alliance === "red"
                                            ? "destructive"
                                            : "default"
                                        }
                                      >
                                        {entry.alliance?.toUpperCase() || "N/A"}
                                      </Badge>
                                      <span className="font-semibold">
                                        Team {entry.team_number}
                                      </span>
                                      <span className="text-muted-foreground">
                                        Match {entry.match_number}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {entry.event_name || "Unknown Event"}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">
                                        {formatRelativeTime(entry.timestamp)}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          toggleMatchExpand(entry.id)
                                        }
                                      >
                                        {isExpanded ? (
                                          <ChevronUp className="h-4 w-4" />
                                        ) : (
                                          <ChevronDown className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Expanded Details */}
                                  {isExpanded && (
                                    <div className="mt-3 pt-3 border-t space-y-2">
                                      <div className="text-sm">
                                        <span className="text-muted-foreground">
                                          Submitted:
                                        </span>{" "}
                                        {formatDate(entry.timestamp)}
                                      </div>
                                      <div className="text-sm">
                                        <span className="text-muted-foreground">
                                          Entry ID:
                                        </span>{" "}
                                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                          {entry.id}
                                        </code>
                                      </div>
                                      {Boolean(entry.data) && (
                                        <div className="mt-2">
                                          <div className="text-sm font-medium mb-1">
                                            Match Data:
                                          </div>
                                          <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-60">
                                            {JSON.stringify(
                                              entry.data,
                                              null,
                                              2
                                            )}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pit" className="space-y-3">
              <Card>
                <CardHeader>
                  <CardTitle>Pit Scouting Entries</CardTitle>
                  <CardDescription>
                    All pit scouting data submitted by this scout
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {currentScoutProfile.pitEntries.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No pit scouting entries yet
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {currentScoutProfile.pitEntries
                        .sort((a, b) => b.timestamp - a.timestamp)
                        .map((entry) => {
                          const isExpanded = expandedPitEntries[entry.id]
                          return (
                            <Card
                              key={entry.id}
                              className="border hover:bg-accent/50 transition-colors"
                            >
                              <CardContent className="p-4">
                                <div className="space-y-2">
                                  {/* Header */}
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <Camera className="h-4 w-4 text-muted-foreground" />
                                      <span className="font-semibold">
                                        Team {entry.team_number}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        {entry.event_name || "Unknown Event"}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-muted-foreground">
                                        {formatRelativeTime(entry.timestamp)}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          togglePitExpand(entry.id)
                                        }
                                      >
                                        {isExpanded ? (
                                          <ChevronUp className="h-4 w-4" />
                                        ) : (
                                          <ChevronDown className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Expanded Details */}
                                  {isExpanded && (
                                    <div className="mt-3 pt-3 border-t space-y-2">
                                      <div className="text-sm">
                                        <span className="text-muted-foreground">
                                          Submitted:
                                        </span>{" "}
                                        {formatDate(entry.timestamp)}
                                      </div>
                                      <div className="text-sm">
                                        <span className="text-muted-foreground">
                                          Entry ID:
                                        </span>{" "}
                                        <code className="text-xs bg-muted px-1 py-0.5 rounded">
                                          {entry.id}
                                        </code>
                                      </div>
                                      {Boolean(entry.data) && (
                                        <div className="mt-2">
                                          <div className="text-sm font-medium mb-1">
                                            Pit Data:
                                          </div>
                                          <pre className="text-xs bg-muted p-3 rounded overflow-auto max-h-60">
                                            {JSON.stringify(
                                              entry.data,
                                              null,
                                              2
                                            )}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </CardContent>
                            </Card>
                          )
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}
