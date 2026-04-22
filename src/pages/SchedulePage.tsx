import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarDays } from "lucide-react"

import { useAuth } from "@/contexts/AuthContext"
import { fetchRemoteSchedule, type RemoteScheduleState } from "@/lib/scheduleApi"
import {
  deriveScoutShiftBlocks,
  formatShiftRange,
  groupShiftBlocksByDay,
} from "@/lib/scoutShiftSchedule"
import { STORAGE_EVENT_NAME_KEY, EVENT_UPDATED_EVENT } from "@/lib/eventSettingsClient"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

const statusBadgeClassName = {
  current: "border-red-500/30 bg-red-500 text-white",
  completed: "border-red-500/15 bg-red-500/10 text-red-600 dark:text-red-300",
  upcoming: "border-border bg-muted text-foreground/80",
}

const positionBadgeClassName = {
  red: "border-red-500/20 bg-red-500/12 text-red-600 dark:text-red-300",
  blue: "border-blue-500/20 bg-blue-500/12 text-blue-600 dark:text-blue-300",
}

export default function SchedulePage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [eventName, setEventName] = useState(() => localStorage.getItem(STORAGE_EVENT_NAME_KEY) ?? "")
  const [schedule, setSchedule] = useState<RemoteScheduleState | null>(null)

  const refreshSchedule = useCallback(async (nextEventName = eventName) => {
    setLoading(true)
    if (!nextEventName) {
      setSchedule(null)
      setLoading(false)
      return
    }

    try {
      const remote = await fetchRemoteSchedule(nextEventName)
      setSchedule(remote)
    } catch (err) {
      console.warn("Failed to load schedule:", err)
      setSchedule(null)
    } finally {
      setLoading(false)
    }
  }, [eventName])

  useEffect(() => {
    const handleEventUpdate = () => {
      const next = localStorage.getItem(STORAGE_EVENT_NAME_KEY) ?? ""
      setEventName(next)
    }
    window.addEventListener(EVENT_UPDATED_EVENT, handleEventUpdate)
    window.addEventListener("storage", handleEventUpdate)
    return () => {
      window.removeEventListener(EVENT_UPDATED_EVENT, handleEventUpdate)
      window.removeEventListener("storage", handleEventUpdate)
    }
  }, [])

  useEffect(() => {
    void refreshSchedule()
  }, [refreshSchedule])

  const effectiveLastCompletedMatch = useMemo(() => {
    if (typeof schedule?.lastCompletedMatch === "number") return schedule.lastCompletedMatch;
    try {
      const stored = parseInt(localStorage.getItem("currentMatchNumber") ?? "", 10);
      return Number.isFinite(stored) && stored > 0 ? stored - 1 : null;
    } catch {
      return null;
    }
  }, [schedule?.lastCompletedMatch])

  const shiftBlocks = useMemo(
    () =>
      deriveScoutShiftBlocks({
        email: user?.email ?? null,
        assignments: schedule?.assignments ?? [],
        matches: schedule?.matches ?? [],
        lastCompletedMatch: effectiveLastCompletedMatch,
        includeCompleted: true,
      }),
    [schedule?.assignments, effectiveLastCompletedMatch, schedule?.matches, user?.email]
  )

  const groupedShiftBlocks = useMemo(() => groupShiftBlocksByDay(shiftBlocks), [shiftBlocks])

  const renderScoutCard = (block: (typeof shiftBlocks)[number]) => (
    <Card
      key={`${block.dayKey}-${block.startMatchNumber}-${block.position}`}
      className="overflow-hidden rounded-2xl border bg-card/95 shadow-sm"
    >
      <CardHeader className="space-y-3 px-4 pb-2 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-[1.55rem] font-bold leading-none text-red-600 dark:text-red-300">
              {formatShiftRange(block)}
            </CardTitle>
            <CardDescription className="mt-1 text-sm font-medium text-foreground">
              {block.matchCount} {block.matchCount === 1 ? "match" : "matches"}
            </CardDescription>
          </div>
          <Badge className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClassName[block.status]}`}>
            {block.status === "current" ? "Current" : block.status === "completed" ? "Completed" : "Upcoming"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={`rounded-full border px-2.5 py-1 text-sm font-semibold ${positionBadgeClassName[block.alliance]}`}>
            {block.positionLabel}
          </Badge>
          {block.teams.length > 0 && (
            <div className="text-sm text-muted-foreground">
              Team {block.teams.join(" • ")}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )

  if (loading) return <div className="p-6">Loading schedule...</div>

  if (!user) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-bold">My Schedule</h1>
        <p className="text-muted-foreground">Sign in to view your published shifts.</p>
      </div>
    )
  }

  if (!groupedShiftBlocks.length) {
    return (
      <div className="p-6">
        <h1 className="mb-2 text-2xl font-bold">My Schedule</h1>
        <p className="text-muted-foreground">No assignments found for {eventName || "this event"}.</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 px-4 py-5 sm:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My Schedule</h1>
          <p className="text-sm text-muted-foreground">Published shifts for {eventName || "this event"}.</p>
        </div>
        <Badge variant="outline" className="w-fit rounded-full px-3 py-1 text-xs">
          {typeof effectiveLastCompletedMatch === "number"
            ? `${typeof schedule?.lastCompletedMatch === "number" ? "Live" : "Local"} progress: through match ${effectiveLastCompletedMatch}`
            : "Live progress unavailable"}
        </Badge>
      </div>

      {groupedShiftBlocks.map((group) => (
        <section key={group.dayKey} className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarDays className="h-4 w-4" />
            <span>{group.dayLabel}</span>
          </div>
          <div className="grid gap-2.5">
            {group.blocks.map((block) => renderScoutCard(block))}
          </div>
        </section>
      ))}
    </div>
  )
}
