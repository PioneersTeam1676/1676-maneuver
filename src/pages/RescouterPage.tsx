import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/apiClient"
import { loadAllScoutingEntries } from "@/lib/dexieDB"
import { findMissingMatches, type MissingMatch } from "@/lib/missingMatchUtils"
import { getMatch, resolveTbaApiKey } from "@/lib/tbaUtils"
import { STORAGE_EVENT_NAME_KEY } from "@/lib/eventSettingsClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Youtube, RefreshCw, ClipboardCheck } from "lucide-react"

interface ActiveClaim {
  id: number
  matchNumber: string
  alliance: string
  position: string
  eventKey: string
  scoutEmail: string
  scoutName: string
}

const HEARTBEAT_MS = 30_000

export default function RescouterPage() {
  const { user, canRescout } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState<MissingMatch[]>([])
  const [claims, setClaims] = useState<ActiveClaim[]>([])
  const [videoKeys, setVideoKeys] = useState<Record<string, string>>({})
  const [myClaimId, setMyClaimId] = useState<number | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const eventKey = useMemo(() => localStorage.getItem(STORAGE_EVENT_NAME_KEY) ?? "", [])

  const fetchClaims = useCallback(async () => {
    try {
      const data = await apiGet<{ claims: ActiveClaim[] }>("/rescout/claims")
      setClaims(data.claims ?? [])
    } catch {
      // non-critical
    }
  }, [])

  const loadMissing = useCallback(async () => {
    setLoading(true)
    try {
      const entries = await loadAllScoutingEntries()
      const existingKeys = new Set<string>()
      let latestMatchNum = 0
      for (const entry of entries) {
        if (!entry.matchNumber || !entry.teamNumber) continue
        const norm = entry.matchNumber.replace(/\D/g, "")
        existingKeys.add(`${norm}::${entry.teamNumber}`)
        const n = parseInt(norm, 10)
        if (Number.isFinite(n) && n > latestMatchNum) latestMatchNum = n
      }

      const { missing: found, usedTba } = await findMissingMatches({
        eventKey,
        existingKeys,
        latestMatchNum,
      })
      setMissing(found)

      if (found.length === 0) {
        toast.success(`All assigned matches have entries (via ${usedTba ? "TBA" : "schedule"})`)
      } else {
        toast.info(`${found.length} missing ${found.length === 1 ? "entry" : "entries"}`)
      }

      if (eventKey && resolveTbaApiKey()) {
        const uniqueMatchNums = [...new Set(found.map((m) => m.matchNumNormalized))]
        const keys: Record<string, string> = {}
        await Promise.allSettled(
          uniqueMatchNums.map(async (num) => {
            try {
              const matchKey = `${eventKey}_qm${num}`
              const match = await getMatch(matchKey)
              const ytVideo = match.videos?.find((v) => v.type === "youtube")
              if (ytVideo) keys[num] = ytVideo.key
            } catch {
              // no video for this match
            }
          })
        )
        setVideoKeys(keys)
      }

      await fetchClaims()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load missing matches"
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [eventKey, fetchClaims])

  useEffect(() => {
    void loadMissing()
  }, [loadMissing])

  useEffect(() => {
    const id = setInterval(() => void fetchClaims(), 15_000)
    return () => clearInterval(id)
  }, [fetchClaims])

  // Release claim on unmount (best-effort)
  useEffect(() => {
    const claimId = myClaimId
    const hb = heartbeatRef
    return () => {
      if (claimId !== null) {
        navigator.sendBeacon?.(`/api/rescout/claims/${claimId}`)
        void apiDelete(`/rescout/claims/${claimId}`).catch(() => null)
        if (hb.current) clearInterval(hb.current)
      }
    }
  }, [myClaimId])

  const handleClaim = async (match: MissingMatch) => {
    if (!user) return
    const scoutName = localStorage.getItem("scoutName") || user.email

    try {
      const data = await apiPost<{ claim: ActiveClaim }>("/rescout/claims", {
        matchNumber: match.matchNumber,
        alliance: match.alliance,
        position: match.position,
        eventKey: match.eventKey,
        scoutName,
      })

      const claimId = data.claim.id
      setMyClaimId(claimId)
      setClaims((prev) => [...prev, data.claim])

      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      heartbeatRef.current = setInterval(async () => {
        try {
          await apiPatch(`/rescout/claims/${claimId}/heartbeat`, {})
        } catch {
          // non-critical
        }
      }, HEARTBEAT_MS)

      navigate("/game-start", {
        state: {
          inputs: {
            matchNumber: match.matchNumNormalized,
            alliance: match.alliance.toLowerCase(),
            teamPosition: match.slotIndex,
            teamNumber: match.teamNumber,
          },
          rescoutClaimId: claimId,
        },
      })
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 409) {
        toast.error("This slot was just claimed by someone else")
        await fetchClaims()
      } else {
        toast.error("Failed to claim match")
      }
    }
  }

  if (!canRescout) {
    return (
      <div className="container mx-auto p-4 max-w-2xl">
        <p className="text-muted-foreground">You don&apos;t have rescouter access.</p>
      </div>
    )
  }

  const myEmail = user?.email?.trim().toLowerCase() ?? ""

  return (
    <div className="container mx-auto p-4 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rescout Missing Matches</h1>
          <p className="text-sm text-muted-foreground">
            {eventKey ? `Event: ${eventKey}` : "No event configured"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadMissing} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && (
        <div className="text-center py-12 text-muted-foreground">Loading missing matches…</div>
      )}

      {!loading && missing.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
            <ClipboardCheck className="h-8 w-8" />
            <p>No missing matches found.</p>
          </CardContent>
        </Card>
      )}

      {!loading && missing.map((m) => {
        const claimForSlot = claims.find(
          (c) =>
            c.matchNumber === m.matchNumber &&
            c.alliance.toLowerCase() === m.alliance.toLowerCase() &&
            c.position === m.position &&
            c.eventKey === m.eventKey
        )
        const claimedByMe = claimForSlot?.scoutEmail === myEmail
        const claimedByOther = !!claimForSlot && !claimedByMe
        const ytKey = videoKeys[m.matchNumNormalized]

        return (
          <Card key={`${m.matchNumNormalized}-${m.position}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Match {m.matchNumNormalized} — {m.position.toUpperCase()}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {ytKey && (
                    <a
                      href={`https://www.youtube.com/watch?v=${ytKey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-red-500 transition-colors"
                      title="Watch on YouTube"
                    >
                      <Youtube className="h-4 w-4" />
                    </a>
                  )}
                  <Badge
                    className={
                      m.alliance === "Red"
                        ? "bg-red-500/15 text-red-600 border-red-500/30"
                        : "bg-blue-500/15 text-blue-600 border-blue-500/30"
                    }
                    variant="outline"
                  >
                    {m.alliance}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm text-muted-foreground">
                Team <span className="font-medium text-foreground">{m.teamNumber}</span>
                {" · "}Assigned to <span className="font-medium text-foreground">{m.assignedScout}</span>
              </div>
              {claimedByMe && (
                <Badge variant="secondary">Being worked on by you</Badge>
              )}
              {claimedByOther && (
                <Badge variant="outline" className="text-muted-foreground">
                  Being worked on by {claimForSlot.scoutName}
                </Badge>
              )}
              {!claimForSlot && (
                <Button size="sm" onClick={() => handleClaim(m)}>
                  Scout this
                </Button>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
