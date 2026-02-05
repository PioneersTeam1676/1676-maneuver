import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { CalendarDays, CheckCircle2, Clock, Shield, RefreshCcw, Users } from "lucide-react"

import { useAuth } from "@/contexts/AuthContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import MatchReminderToggle from "@/components/MatchReminderToggle"
import { fetchRemoteSchedule } from "@/lib/scheduleApi"
import {
  PLAYER_POSITIONS,
  type ParsedMatch,
  type PlayerPosition,
  type StoredScheduleState,
} from "@/types/schedule"

const STORAGE_KEY = "schedule_automation_state"

type ScheduleState = Partial<StoredScheduleState>

type UpcomingShift = {
  matchNumber: string
  position: PlayerPosition
  positionLabel: string
  alliance: "red" | "blue"
  teamNumber?: string
  allies: string[]
  opponents: string[]
  startTimestamp?: number
  startTimeText: string
  relativeText?: string
}

type EnrichedMatch = ParsedMatch & {
  startTimestamp?: number
  startTimeText: string
  relativeText?: string
}

type MatchLike = {
  matchNumber: string
  startTimestamp?: number
}

const POSITION_DETAILS: Record<
  PlayerPosition,
  { alliance: "red" | "blue"; slotIndex: number; label: string }
> = {
  "red-1": { alliance: "red", slotIndex: 0, label: "Red 1" },
  "red-2": { alliance: "red", slotIndex: 1, label: "Red 2" },
  "red-3": { alliance: "red", slotIndex: 2, label: "Red 3" },
  "blue-1": { alliance: "blue", slotIndex: 0, label: "Blue 1" },
  "blue-2": { alliance: "blue", slotIndex: 1, label: "Blue 2" },
  "blue-3": { alliance: "blue", slotIndex: 2, label: "Blue 3" },
}

const sameDayFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
})

const dayTimeFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
})

const updatedFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
})

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

const normalizeEmail = (value: string) => value.trim().toLowerCase()

const parseStartTime = (raw?: string) => {
  if (!raw) return undefined
  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed)) return undefined
  return parsed
}

const parseMatchOrder = (matchNumber: string) => {
  if (!matchNumber) return Number.POSITIVE_INFINITY
  const numericPortion = Number.parseInt(matchNumber.replace(/[^\d]/g, ""), 10)
  if (!Number.isNaN(numericPortion)) return numericPortion
  return Number.POSITIVE_INFINITY
}

const compareByStart = <T extends MatchLike>(a: T, b: T) => {
  const { startTimestamp: timeA } = a
  const { startTimestamp: timeB } = b

  if (typeof timeA === "number" && typeof timeB === "number" && timeA !== timeB) {
    return timeA - timeB
  }

  if (typeof timeA === "number" && typeof timeB !== "number") {
    return -1
  }

  if (typeof timeB === "number" && typeof timeA !== "number") {
    return 1
  }

  const orderA = parseMatchOrder(a.matchNumber)
  const orderB = parseMatchOrder(b.matchNumber)
  if (orderA !== orderB) {
    return orderA - orderB
  }
  return a.matchNumber.localeCompare(b.matchNumber, undefined, {
    numeric: true,
    sensitivity: "base",
  })
}

const formatMatchTime = (startTimestamp?: number) => {
  if (!startTimestamp) return "Time TBD"
  const target = new Date(startTimestamp)
  const today = new Date()
  if (today.toDateString() === target.toDateString()) {
    return sameDayFormatter.format(target)
  }
  return dayTimeFormatter.format(target)
}

const formatRelativeTime = (startTimestamp?: number) => {
  if (!startTimestamp) return undefined
  const diff = startTimestamp - Date.now()
  const abs = Math.abs(diff)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (abs < 30 * 1000) {
    return "starting now"
  }
  if (abs < hour) {
    const minutes = Math.round(diff / minute)
    return relativeFormatter.format(minutes, "minute")
  }
  if (abs < day) {
    const hours = Math.round(diff / hour)
    return relativeFormatter.format(hours, "hour")
  }
  const days = Math.round(diff / day)
  return relativeFormatter.format(days, "day")
}

const formatLastUpdated = (timestamp: number) => updatedFormatter.format(new Date(timestamp))

const HomePage = () => {
  const { user, login } = useAuth()
  const [schedule, setSchedule] = useState<ScheduleState | null>(null)
  const [lastRefresh, setLastRefresh] = useState<number | null>(null)

  const refreshSchedule = useCallback(async () => {
    let refreshed = false

    try {
      const remote = await fetchRemoteSchedule()
      if (remote && remote.eventKey) {
        const normalized: ScheduleState = {
          eventKey: remote.eventKey,
          matches: remote.matches ?? [],
          assignments: remote.assignments ?? [],
          aliases: remote.aliases ?? {},
          mode: remote.mode ?? "auto",
        }
        setSchedule(normalized)
        const stored: StoredScheduleState = {
          eventKey: remote.eventKey,
          matches: remote.matches ?? [],
          assignments: remote.assignments ?? [],
          aliases: remote.aliases ?? {},
          mode: remote.mode ?? "auto",
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
        window.dispatchEvent(new Event("scheduleAutomationUpdated"))
        refreshed = true
      }
    } catch (error) {
      console.warn("Failed to fetch schedule from API", error)
    }

    if (!refreshed) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) {
          setSchedule(null)
        } else {
          const parsed = JSON.parse(raw) as StoredScheduleState
          setSchedule(parsed)
        }
      } catch (error) {
        console.warn("Failed to read schedule automation state", error)
        setSchedule(null)
      }
    }

    setLastRefresh(Date.now())
  }, [])

  useEffect(() => {
    void refreshSchedule()

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        void refreshSchedule()
      }
    }

    const handleCustomEvent = () => {
      void refreshSchedule()
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener("scheduleAutomationUpdated", handleCustomEvent)

    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener("scheduleAutomationUpdated", handleCustomEvent)
    }
  }, [refreshSchedule])

  const normalizedEmail = normalizeEmail(user?.email ?? "")
  const assignments = schedule?.assignments ?? []
  const matches = schedule?.matches ?? []

  const upcomingShifts = useMemo<UpcomingShift[]>(() => {
    if (!normalizedEmail) return []

    const result: UpcomingShift[] = []

    assignments.forEach((assignment) => {
      for (const slot of PLAYER_POSITIONS) {
        const assigned = assignment.positions?.[slot]
        if (!assigned || normalizeEmail(assigned) !== normalizedEmail) {
          continue
        }

        const positionMeta = POSITION_DETAILS[slot]
        const matchInfo = matches.find((match) => match.matchNumber === assignment.matchNumber)
        const startTimestamp = parseStartTime(assignment.startTime ?? matchInfo?.startTime)
        const allianceTeams = matchInfo
          ? positionMeta.alliance === "red"
            ? [...(matchInfo.red ?? [])]
            : [...(matchInfo.blue ?? [])]
          : []
        const opponentTeams = matchInfo
          ? positionMeta.alliance === "red"
            ? [...(matchInfo.blue ?? [])]
            : [...(matchInfo.red ?? [])]
          : []

        result.push({
          matchNumber: assignment.matchNumber,
          position: slot,
          positionLabel: positionMeta.label,
          alliance: positionMeta.alliance,
          teamNumber: allianceTeams[positionMeta.slotIndex] || undefined,
          allies: allianceTeams.filter(Boolean),
          opponents: opponentTeams.filter(Boolean),
          startTimestamp,
          startTimeText: formatMatchTime(startTimestamp),
          relativeText: formatRelativeTime(startTimestamp),
        })

        break
      }
    })

    result.sort((a, b) => compareByStart(a, b))
    return result.slice(0, 5)
  }, [assignments, matches, normalizedEmail])

  const shiftMap = useMemo(() => {
    return new Map(upcomingShifts.map((shift) => [shift.matchNumber, shift]))
  }, [upcomingShifts])

  const upcomingMatches = useMemo<EnrichedMatch[]>(() => {
    if (matches.length === 0) return []

    const now = Date.now()
    const enriched = matches
      .map((match) => {
        const startTimestamp = parseStartTime(match.startTime)
        return {
          ...match,
          red: match.red ? [...match.red] : [],
          blue: match.blue ? [...match.blue] : [],
          startTimestamp,
          startTimeText: formatMatchTime(startTimestamp),
          relativeText: formatRelativeTime(startTimestamp),
        }
      })
      .sort((a, b) => compareByStart(a, b))
      .filter((match) => {
        if (!match.startTimestamp) return true
        return match.startTimestamp >= now - 15 * 60 * 1000
      })

    return enriched.slice(0, 6)
  }, [matches])

  const firstName = useMemo(() => {
    if (!user?.name) return "Scout"
    return user.name.split(" ")[0]
  }, [user?.name])

  if (!user) {
    return (
      <div className="flex min-h-screen w-full flex-col bg-black text-white">
        <section className="relative isolate overflow-hidden bg-gradient-to-br from-black via-black to-primary/30">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-20">
            <div className="space-y-6 text-center sm:text-left">
              <Badge
                variant="outline"
                className="border-primary/60 bg-primary/10 text-primary/90 uppercase tracking-[0.3em]"
              >
                Team 1676 • Pioneer Scouting
              </Badge>
              <div className="space-y-4">
                <h1 className="text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
                  A complete scouting command center built for FIRST Robotics Competition teams.
                </h1>
                <p className="text-lg text-white/70 md:text-xl">
                  Pioneer Scouting captures autonomous, teleop, endgame, and pit insights in one offline-first
                  workspace. Leads sync schedules in seconds, scouts log data reliably, and strategists gain a shared
                  view of every match.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button
                  size="lg"
                  className="bg-primary text-black hover:bg-primary/90"
                  onClick={login}
                >
                  Launch scouting app
                </Button>
                <Button size="lg" variant="ghost" className="text-white hover:bg-white/10" asChild>
                  <Link to="/privacy">Read our privacy policy</Link>
                </Button>
              </div>
            </div>

            <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm sm:grid-cols-3">
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">Purpose-built workflows</h3>
                <p className="text-sm text-white/70">
                  Guides scouts through every phase of Reefscape matches, from autonomous data capture to alliance pick
                  deliberations.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">Lead-to-scout alignment</h3>
                <p className="text-sm text-white/70">
                  Manage scout rotations, verify external accounts, and broadcast match schedules across the scouting
                  alliance instantly.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">Transparent data use</h3>
                <p className="text-sm text-white/70">
                  Google sign-in lets us confirm who submits data, sync assignments, and audit performance—never to sell
                  or market to your team.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-black">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-16">
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <Card className="border-white/15 bg-white/5 text-white">
                <CardHeader>
                  <CardTitle className="text-2xl">What Pioneer Scouting delivers</CardTitle>
                  <CardDescription className="text-white/70">
                    Built by Team 1676’s strategy leadership and used at every competition.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-white/80">
                  <ul className="grid gap-3">
                    <li className="rounded-md border border-white/10 bg-black/40 p-3">
                      Real-time dashboards for match, pit, and schedule insights—usable even when Wi-Fi drops.
                    </li>
                    <li className="rounded-md border border-white/10 bg-black/40 p-3">
                      Automated match assignments that sync to every scout’s device, including alliance partners.
                    </li>
                    <li className="rounded-md border border-white/10 bg-black/40 p-3">
                      Verification Center for approving outside accounts and keeping alliance contributions secure.
                    </li>
                    <li className="rounded-md border border-white/10 bg-black/40 p-3">
                      Export and import utilities (QR + JSON) for quick data transfer when scouting tablets stay offline.
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <Card className="border-white/15 bg-white/5 text-white">
                <CardHeader>
                  <CardTitle className="text-2xl">Why we request Google sign-in</CardTitle>
                  <CardDescription className="text-white/70">
                    Account identity keeps data trustworthy across the scouting alliance.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-white/80">
                  <p>
                    We collect your name, email, and profile photo solely to authenticate scouts, assign match
                    responsibilities, and reconcile prediction accuracy. Admins can remove accounts at any time, and the
                    information is never sold or shared outside Team 1676.
                  </p>
                  <p>
                    If you are not part of the <span className="text-primary">@pascack.org</span> domain, you will be
                    asked to confirm your alliance membership so a lead can approve access.
                  </p>
                  <Button variant="outline" className="w-full border-primary/60 text-primary hover:bg-primary/10" asChild>
                    <Link to="/privacy">See how we handle data</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr]">
              <Card className="border-white/15 bg-white/5 text-white">
                <CardHeader>
                  <CardTitle className="text-xl">Need to partner with Team 1676?</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-white/80">
                  <p>
                    Scout leaders can request access for their teams by contacting us directly. We’ll set up alliance
                    domains, grant verification permissions, and share onboarding guides tailored for your competition.
                  </p>
                  <Button className="w-full bg-primary text-black hover:bg-primary/90" asChild>
                    <a href="mailto:scouting@team1676.com">Email scouting leadership</a>
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-white/15 bg-white/5 text-white">
                <CardHeader>
                  <CardTitle className="text-xl">How teams use Pioneer Scouting throughout an event</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 text-sm text-white/80 md:grid-cols-2">
                  <div className="rounded-md border border-white/10 bg-black/40 p-4">
                    <h3 className="text-base font-semibold text-primary">Before matches</h3>
                    <p className="mt-2">
                      Leads sync The Blue Alliance schedules, assign scouts to positions, and share pit scouting
                      expectations across the alliance.
                    </p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/40 p-4">
                    <h3 className="text-base font-semibold text-primary">During matches</h3>
                    <p className="mt-2">
                      Scouts log cycle-by-cycle actions, queue QR codes for quick transfers, and track predicted scores
                      against actual results.
                    </p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/40 p-4">
                    <h3 className="text-base font-semibold text-primary">Strategy huddles</h3>
                    <p className="mt-2">
                      Captains pull dashboards for match plans, alliance selection, and post-qualification discussions
                      without flipping through spreadsheets.
                    </p>
                  </div>
                  <div className="rounded-md border border-white/10 bg-black/40 p-4">
                    <h3 className="text-base font-semibold text-primary">After the event</h3>
                    <p className="mt-2">
                      Export data for debriefs, review accuracy metrics in the Verification Center, and refine future
                      scouting assignments.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/5 p-6 text-sm text-white/70">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p>
                  Pioneer Scouting is maintained by Team 1676 and hosted on <span className="text-primary">scouting.team1676.org</span>, a
                  domain we own and manage. The app and policies you read here are the same ones referenced on our Google
                  OAuth consent screen.
                </p>
                <Button variant="ghost" className="text-white hover:bg-white/10" asChild>
                  <a href="https://team1676.com" target="_blank" rel="noreferrer">Learn more about Team 1676</a>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    )
  }

  const eventKey = schedule?.eventKey

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Hi {firstName}</h1>
          <p className="text-muted-foreground">
            Here is what is coming up for your scouting shifts.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {eventKey && (
            <Badge variant="outline" className="uppercase tracking-wide">
              {eventKey}
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={() => void refreshSchedule()}>
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          {lastRefresh && (
            <span className="text-xs text-muted-foreground">
              Updated {formatLastUpdated(lastRefresh)}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="h-full">
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Upcoming Shifts</CardTitle>
              <CardDescription>Matches where you are scheduled to scout.</CardDescription>
            </div>
            <Button asChild size="sm">
              <Link to="/game-start" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Match Flow
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {upcomingShifts.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No assigned shifts yet. We’ll post assignments here once a lead publishes the event schedule.
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingShifts.map((shift) => (
                  <div key={shift.matchNumber} className="rounded-lg border bg-muted/40 p-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <CalendarDays className="h-4 w-4 text-primary" />
                        <span>Match {shift.matchNumber}</span>
                      </div>
                      <Badge variant="secondary">{shift.positionLabel}</Badge>
                      {shift.teamNumber && (
                        <Badge variant="outline">Team {shift.teamNumber}</Badge>
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{shift.startTimeText}</span>
                      </div>
                      {shift.relativeText && <span>{shift.relativeText}</span>}
                    </div>
                    {(shift.allies.length > 0 || shift.opponents.length > 0) && (
                      <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                        {shift.allies.length > 0 && (
                          <div>
                            <p className="text-xs uppercase tracking-wide text-foreground">Alliance</p>
                            <p className="mt-1 font-semibold text-foreground">
                              {shift.allies.join(" • ")}
                            </p>
                          </div>
                        )}
                        {shift.opponents.length > 0 && (
                          <div>
                            <p className="text-xs uppercase tracking-wide text-muted-foreground">Opponents</p>
                            <p className="mt-1 font-semibold text-muted-foreground">
                              {shift.opponents.join(" • ")}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Matches</CardTitle>
            <CardDescription>The next matches on the event schedule.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {upcomingMatches.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No matches are scheduled yet. They’ll appear here after the official schedule is published. Need a dry run? Load demo data from Dev Utilities.
              </div>
            ) : (
              upcomingMatches.map((match) => {
                const assignedShift = shiftMap.get(match.matchNumber)
                return (
                  <div key={match.matchNumber} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <CalendarDays className="h-4 w-4 text-primary" />
                      <span>Match {match.matchNumber}</span>
                      <span className="text-muted-foreground">• {match.startTimeText}</span>
                    </div>
                    {match.relativeText && (
                      <div className="mt-1 text-xs text-muted-foreground">{match.relativeText}</div>
                    )}
                    {assignedShift && (
                      <div className="mt-2">
                        <Badge variant="secondary" className="text-xs">
                          Your station: {assignedShift.positionLabel}
                        </Badge>
                      </div>
                    )}
                    <div className="mt-3 grid gap-3 text-sm">
                      <div>
                        <p className="text-xs font-semibold uppercase text-red-500">Red Alliance</p>
                        <p className="mt-1 font-medium text-foreground">
                          {(match.red ?? []).filter(Boolean).join(" • ") || "TBD"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase text-blue-500">Blue Alliance</p>
                        <p className="mt-1 font-medium text-foreground">
                          {(match.blue ?? []).filter(Boolean).join(" • ") || "TBD"}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
      </div>

      <MatchReminderToggle autoPrompt={false} />
    </div>
  )
}

export default HomePage
