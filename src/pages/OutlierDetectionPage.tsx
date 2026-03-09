import { useEffect, useState } from "react"
import { apiGet } from "@/lib/apiClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle } from "lucide-react"

interface Outlier {
  entryId: string
  scoutEmail: string
  reportedMatch: string
  expectedMatches: string[]
  likelyCorrectMatch: string | null
  timestamp: number
}

export default function OutlierDetectionPage() {
  const [outliers, setOutliers] = useState<Outlier[]>([])
  const [loading, setLoading] = useState(true)
  const eventKey = localStorage.getItem("eventName") ?? ""

  useEffect(() => {
    if (!eventKey) return setLoading(false)
    apiGet<{ outliers: Outlier[] }>(`/scouting/outliers?eventKey=${encodeURIComponent(eventKey)}`)
      .then((d) => setOutliers(d.outliers))
      .catch((err: unknown) => console.warn("Failed to load outliers:", err))
      .finally(() => setLoading(false))
  }, [eventKey])

  if (loading) return <div className="p-6">Analyzing entries...</div>

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        Match Outlier Detection
      </h1>
      <p className="text-muted-foreground text-sm">
        Entries where the scout submitted a match number not in their schedule assignment.
      </p>
      {!eventKey && (
        <p className="text-destructive font-medium">No event key found. Set an event in Event Settings first.</p>
      )}
      {eventKey && outliers.length === 0 ? (
        <p className="text-green-600 font-medium">No outliers found — all entries match assignments.</p>
      ) : (
        <div className="space-y-2">
          {outliers.map((o) => (
            <Card key={o.entryId} className="border-amber-400">
              <CardHeader className="pb-1">
                <CardTitle className="text-base">{o.scoutEmail}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  Reported: <Badge variant="destructive">Match {o.reportedMatch}</Badge>
                </p>
                <p className="text-muted-foreground">Assigned to: {o.expectedMatches.join(", ")}</p>
                {o.likelyCorrectMatch && (
                  <p className="text-amber-600">
                    Likely correct match: <strong>{o.likelyCorrectMatch}</strong>
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
