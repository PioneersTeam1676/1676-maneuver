import { useEffect, useState } from "react"
import { fetchMyAssignments, type MyAssignment } from "@/lib/scheduleApi"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function SchedulePage() {
  const [assignments, setAssignments] = useState<MyAssignment[]>([])
  const [loading, setLoading] = useState(true)

  const eventName = localStorage.getItem("eventName") ?? ""

  useEffect(() => {
    if (!eventName) return setLoading(false)
    fetchMyAssignments(eventName)
      .then(setAssignments)
      .catch((err: unknown) => console.warn("Failed to load schedule:", err))
      .finally(() => setLoading(false))
  }, [eventName])

  if (loading) return <div className="p-6">Loading schedule…</div>

  if (!assignments.length)
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">My Schedule</h1>
        <p className="text-muted-foreground">No assignments found for {eventName || "this event"}.</p>
      </div>
    )

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">My Schedule — {eventName}</h1>
      <div className="space-y-2">
        {assignments.map((a) => (
          <Card key={a.matchNumber}>
            <CardHeader className="pb-1">
              <CardTitle className="text-base">Match {a.matchNumber}</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={a.alliance === "red" ? "destructive" : "default"}>
                {a.position.replace("-", " ").toUpperCase()}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
