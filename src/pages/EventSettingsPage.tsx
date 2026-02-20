import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar, Check, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { useTBAData } from "@/hooks/useTBAData"
import { ensureAllianceDataCached, ALLIANCE_DATA_UPDATED_EVENT } from "@/lib/tbaUtils"
import { ApiError } from "@/lib/apiClient"
import { ACTIVE_FORM_UPDATED_EVENT, readActiveFormConfig, syncActiveFormConfig } from "@/lib/activeForm"
import { getForm } from "@/lib/formBuilderApi"
import type { FormDefinition } from "@/types/formBuilder"
import {
  getWebhookSyncStatus,
  startWebhookSync,
  stopWebhookSync,
  testWebhookSync,
  type WebhookSyncStatus,
} from "@/lib/webhookSyncClient"
import {
  EVENT_UPDATED_EVENT,
  STORAGE_EVENTS_KEY,
  STORAGE_EVENT_NAME_KEY,
  type EventSettingsPayload,
  type EventSettingsResponse,
  syncEventSettings,
  updateEventSettings as updateEventSettingsApi,
} from "@/lib/eventSettingsClient"

const sanitizeEventName = (name: string) => name.trim()
const webhookIntervalOptions = ["1", "5", "10", "20"]

const readStoredEvents = (): string[] => {
  if (typeof window === "undefined") return []
  try {
    const storedEvents = localStorage.getItem(STORAGE_EVENTS_KEY)
    if (!storedEvents) return []
    const parsed = JSON.parse(storedEvents) as unknown
    if (!Array.isArray(parsed)) return []
    const normalized = parsed
      .map((item) => (typeof item === "string" ? sanitizeEventName(item) : ""))
      .filter(Boolean)
    return [...new Set(normalized)].sort((a, b) => a.localeCompare(b))
  } catch (error) {
    console.warn("Failed to parse stored events", error)
    return []
  }
}

const readStoredCurrentEvent = (): string => {
  if (typeof window === "undefined") return ""
  try {
    return localStorage.getItem(STORAGE_EVENT_NAME_KEY) || ""
  } catch (error) {
    console.warn("Failed to read stored event name", error)
    return ""
  }
}

const readSessionTbaApiKey = (): string => {
  if (typeof window === "undefined") return ""
  try {
    return sessionStorage.getItem("tbaApiKey") || ""
  } catch (error) {
    console.warn("Failed to read stored TBA API key", error)
    return ""
  }
}

const isAuthorizedRole = (role: string) => role === "lead" || role === "tech_lead"

const EventSettingsPage = () => {
  const { role, user, authorizationReady } = useAuth()
  const navigate = useNavigate()
  const [events, setEvents] = useState<string[]>(readStoredEvents)
  const [currentEvent, setCurrentEvent] = useState(readStoredCurrentEvent)
  const [newEvent, setNewEvent] = useState("")
  const [eventKeyInput, setEventKeyInput] = useState("")
  const [isEditingEventKey, setIsEditingEventKey] = useState(false)
  const presetTbaApiKey = (import.meta.env.VITE_TBA_API_KEY ?? "").trim()
  const [tbaApiKey, setTbaApiKey] = useState(() => {
    const sessionKey = readSessionTbaApiKey()
    return sessionKey || presetTbaApiKey
  })
  const [rememberApiKey, setRememberApiKey] = useState(() => {
    const sessionKey = readSessionTbaApiKey()
    return Boolean(sessionKey || presetTbaApiKey)
  })
  const [matchDataCount, setMatchDataCount] = useState<number>(() => {
    try {
      const stored = localStorage.getItem("matchData")
      if (!stored) return 0
      const parsed = JSON.parse(stored)
      return Array.isArray(parsed) ? parsed.length : 0
    } catch {
      return 0
    }
  })
  const [matchDataEvent, setMatchDataEvent] = useState<string>(() => localStorage.getItem(STORAGE_EVENT_NAME_KEY) || "")
  const [matchUpdatedAt, setMatchUpdatedAt] = useState<string | null>(() => localStorage.getItem("matchDataUpdatedAt"))
  const [isSaving, setIsSaving] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const canManageEvents = useMemo(() => isAuthorizedRole(role), [role])
  const { matchDataLoading, fetchMatchDataFromTBA } = useTBAData()
  const [allianceSyncing, setAllianceSyncing] = useState(false)
  const [allianceDataPreview, setAllianceDataPreview] = useState<{
    alliances: Array<{
      allianceNumber: number;
      captain: string | null;
      picks: string[];
      backup?: string | null;
    }>;
    updatedAt: string | null;
  }>({ alliances: [], updatedAt: null })
  const [activeMatchFormId, setActiveMatchFormId] = useState("")
  const [webhookForm, setWebhookForm] = useState<FormDefinition | null>(null)
  const [webhookLoading, setWebhookLoading] = useState(false)
  const [webhookIntervalMinutes, setWebhookIntervalMinutes] = useState("5")
  const [webhookRunning, setWebhookRunning] = useState(false)
  const [webhookLastSync, setWebhookLastSync] = useState<string | null>(null)
  const [webhookTestLoading, setWebhookTestLoading] = useState(false)
  const [webhookStatusLoading, setWebhookStatusLoading] = useState(false)
  const [webhookResponse, setWebhookResponse] = useState<{
    status: number | null
    ok: boolean
    durationMs: number | null
    receivedAt: string | null
    body: string
    error: string
  }>({
    status: null,
    ok: false,
    durationMs: null,
    receivedAt: null,
    body: "",
    error: "",
  })
  const webhookFormIdRef = useRef<string | null>(null)

  const refreshMatchSummary = useCallback(() => {
    try {
      const stored = localStorage.getItem("matchData")
      if (stored) {
        try {
          const parsed = JSON.parse(stored)
          setMatchDataCount(Array.isArray(parsed) ? parsed.length : 0)
        } catch {
          setMatchDataCount(0)
        }
      } else {
        setMatchDataCount(0)
      }
    } catch {
      setMatchDataCount(0)
    }
    setMatchDataEvent(localStorage.getItem(STORAGE_EVENT_NAME_KEY) || "")
    setMatchUpdatedAt(localStorage.getItem("matchDataUpdatedAt"))
  }, [])

  const applySettingsResponse = useCallback((settings: EventSettingsResponse) => {
    setEvents(settings.events)
    setCurrentEvent(settings.currentEvent)
    setEventKeyInput((previous) => {
      if (isEditingEventKey) {
        return previous
      }
      return previous ? previous : settings.currentEvent
    })
    refreshMatchSummary()
  }, [isEditingEventKey, refreshMatchSummary])

  const performSettingsUpdate = useCallback(async (payload: EventSettingsPayload, successMessage?: string) => {
    setIsSaving(true)
    try {
      const settings = await updateEventSettingsApi(payload)
      applySettingsResponse(settings)
      if (successMessage) {
        toast.success(successMessage)
      }
      return settings
    } catch (error) {
      console.error("Failed to update event settings", error)
      const message = error instanceof ApiError ? error.message : "Failed to update event settings"
      toast.error(message)
      throw error
    } finally {
      setIsSaving(false)
    }
  }, [applySettingsResponse])

  const refreshActiveMatchFormId = useCallback(() => {
    const config = readActiveFormConfig()
    setActiveMatchFormId(config.match || "")
  }, [])

  const applyWebhookStatus = useCallback((status: WebhookSyncStatus) => {
    const intervalValue = status.intervalMinutes ? String(status.intervalMinutes) : "5"
    setWebhookIntervalMinutes(intervalValue)
    setWebhookRunning(Boolean(status.enabled))
    setWebhookLastSync(status.lastRunAt ?? null)
    setWebhookResponse({
      status: status.lastStatus ?? null,
      ok: Boolean(status.lastOk),
      durationMs: status.lastDurationMs ?? null,
      receivedAt: status.lastRunAt ?? null,
      body: status.lastBody ?? "",
      error: status.lastError ?? "",
    })
    if (typeof status.activeFormId === "string") {
      setActiveMatchFormId(status.activeFormId)
    }
  }, [])

  const fetchWebhookStatus = useCallback(async () => {
    setWebhookStatusLoading(true)
    try {
      const status = await getWebhookSyncStatus()
      applyWebhookStatus(status)
    } catch (error) {
      console.error("Failed to load webhook sync status", error)
    } finally {
      setWebhookStatusLoading(false)
    }
  }, [applyWebhookStatus])

  useEffect(() => {
    if (!authorizationReady) return
    if (!user || !canManageEvents) {
      navigate("/", { replace: true })
      return
    }
    refreshMatchSummary()
  }, [authorizationReady, user, canManageEvents, navigate, refreshMatchSummary])

  useEffect(() => {
    if (!canManageEvents) return
    refreshActiveMatchFormId()
    const handleActiveUpdate = () => {
      refreshActiveMatchFormId()
    }
    window.addEventListener(ACTIVE_FORM_UPDATED_EVENT, handleActiveUpdate as EventListener)
    void (async () => {
      try {
        await syncActiveFormConfig()
      } catch (error) {
        console.warn("Failed to sync active form config", error)
      }
    })()
    return () => {
      window.removeEventListener(ACTIVE_FORM_UPDATED_EVENT, handleActiveUpdate as EventListener)
    }
  }, [canManageEvents, refreshActiveMatchFormId])

  useEffect(() => {
    if (!canManageEvents) return
    void fetchWebhookStatus()
    const poll = window.setInterval(() => {
      void fetchWebhookStatus()
    }, 30000)
    return () => {
      window.clearInterval(poll)
    }
  }, [canManageEvents, fetchWebhookStatus])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_EVENTS_KEY) {
        setEvents(readStoredEvents())
      }
      if (event.key === STORAGE_EVENT_NAME_KEY) {
        setCurrentEvent(event.newValue || "")
      }
      if (event.key === "matchData" || event.key === "matchDataUpdatedAt" || event.key === STORAGE_EVENT_NAME_KEY) {
        refreshMatchSummary()
      }
    }

    window.addEventListener("storage", handleStorage)
    const handleEventSettingsUpdate = () => {
      setEvents(readStoredEvents())
      setCurrentEvent(readStoredCurrentEvent())
      refreshMatchSummary()
    }

    window.addEventListener(EVENT_UPDATED_EVENT, handleEventSettingsUpdate as EventListener)

    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener(EVENT_UPDATED_EVENT, handleEventSettingsUpdate as EventListener)
    }
  }, [refreshMatchSummary])

  useEffect(() => {
    if (!canManageEvents) {
      return
    }

    let cancelled = false
    let inflight = false

    const syncSettings = async () => {
      if (inflight) return
      inflight = true
      setIsSyncing(true)
      try {
        const settings = await syncEventSettings()
        if (!cancelled) {
          applySettingsResponse(settings)
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to sync event settings", error)
        }
      } finally {
        inflight = false
        if (!cancelled) {
          setIsSyncing(false)
        }
      }
    }

    void syncSettings()

    const handleFocus = () => {
      void syncSettings()
    }

    window.addEventListener("focus", handleFocus)

    return () => {
      cancelled = true
      window.removeEventListener("focus", handleFocus)
    }
  }, [applySettingsResponse, canManageEvents])

  useEffect(() => {
    if (isEditingEventKey) return
    if (!eventKeyInput && currentEvent) {
      setEventKeyInput(currentEvent)
    }
  }, [currentEvent, eventKeyInput, isEditingEventKey])

  useEffect(() => {
    if (rememberApiKey && tbaApiKey) {
      sessionStorage.setItem("tbaApiKey", tbaApiKey)
    }
    if (!rememberApiKey) {
      sessionStorage.removeItem("tbaApiKey")
    }
  }, [rememberApiKey, tbaApiKey])

  const handleRememberToggle = (checked: boolean) => {
    setRememberApiKey(checked)
    if (!checked) {
      sessionStorage.removeItem("tbaApiKey")
    } else if (tbaApiKey) {
      sessionStorage.setItem("tbaApiKey", tbaApiKey)
    }
  }

  const syncedEventLabel = matchDataEvent ? matchDataEvent : currentEvent || "no event selected"

  const handleSetApiKey = (value: string) => {
    setTbaApiKey(value)
    if (rememberApiKey && value) {
      sessionStorage.setItem("tbaApiKey", value)
    }
    if (!value) {
      sessionStorage.removeItem("tbaApiKey")
    }
  }

  useEffect(() => {
    if (!currentEvent || typeof window === "undefined") {
      setAllianceDataPreview({ alliances: [], updatedAt: null })
      return
    }

    const storageKey = `allianceCaptains:${currentEvent}`

    const readStoredAlliances = () => {
      try {
        const stored = localStorage.getItem(storageKey)
        if (!stored) {
          setAllianceDataPreview({ alliances: [], updatedAt: null })
          return
        }
        const parsed = JSON.parse(stored)
        const alliances = Array.isArray(parsed.alliances) ? parsed.alliances : []
        const updatedAt = typeof parsed.updatedAt === "string" ? parsed.updatedAt : null
        setAllianceDataPreview({ alliances, updatedAt })
      } catch {
        setAllianceDataPreview({ alliances: [], updatedAt: null })
      }
    }

    readStoredAlliances()

    const handleAllianceUpdate = () => {
      readStoredAlliances()
    }

    window.addEventListener(ALLIANCE_DATA_UPDATED_EVENT, handleAllianceUpdate)

    return () => {
      window.removeEventListener(ALLIANCE_DATA_UPDATED_EVENT, handleAllianceUpdate)
    }
  }, [currentEvent])

  useEffect(() => {
    if (!activeMatchFormId) {
      setWebhookForm(null)
      webhookFormIdRef.current = null
      return
    }
    if (webhookFormIdRef.current === activeMatchFormId && webhookForm) {
      return
    }
    let cancelled = false
    setWebhookLoading(true)
    getForm(activeMatchFormId)
      .then((form) => {
        if (cancelled) return
        setWebhookForm(form)
        webhookFormIdRef.current = activeMatchFormId
      })
      .catch((error) => {
        if (cancelled) return
        console.error("Failed to load active form for webhook sync", error)
      })
      .finally(() => {
        if (!cancelled) {
          setWebhookLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [activeMatchFormId, webhookForm])


  const handleSyncMatchData = async () => {
    const candidateEvent = sanitizeEventName(eventKeyInput || currentEvent)
    if (!candidateEvent) {
      toast.error("Enter an event key before syncing the match schedule")
      return
    }

    if (!tbaApiKey.trim()) {
      toast.error("Enter your TBA API key to load the match schedule")
      return
    }

    try {
      await fetchMatchDataFromTBA(tbaApiKey, candidateEvent, rememberApiKey, handleSetApiKey)
      const nextEvents = [...events, candidateEvent]
      try {
        await performSettingsUpdate(
          { currentEvent: candidateEvent, events: nextEvents },
        )
      } catch {
        // performSettingsUpdate handles errors and toasts
      }
      setEventKeyInput(candidateEvent)

      const storedSchedule = localStorage.getItem("matchData")
      if (storedSchedule && storedSchedule !== "") {
        const timestamp = new Date().toISOString()
        localStorage.setItem("matchDataUpdatedAt", timestamp)
        setMatchUpdatedAt(timestamp)
      }
      refreshMatchSummary()
    } catch (error) {
      console.error("Failed to sync match schedule", error)
    }
  }

  const handleStartWebhookSync = async () => {
    const minutes = Number.parseInt(webhookIntervalMinutes, 10)
    const interval = Number.isNaN(minutes) ? 5 : minutes
    try {
      const status = await startWebhookSync(interval)
      applyWebhookStatus(status)
    } catch (error) {
      console.error("Failed to start webhook sync", error)
      toast.error("Failed to start webhook sync.")
    }
  }

  const handleStopWebhookSync = async () => {
    try {
      const status = await stopWebhookSync()
      applyWebhookStatus(status)
    } catch (error) {
      console.error("Failed to stop webhook sync", error)
      toast.error("Failed to stop webhook sync.")
    }
  }

  const handleTestWebhook = async () => {
    setWebhookTestLoading(true)
    try {
      const status = await testWebhookSync()
      applyWebhookStatus(status)
    } catch (error) {
      console.error("Failed to test webhook", error)
      toast.error("Webhook test failed.")
    } finally {
      setWebhookTestLoading(false)
    }
  }

  const handleSyncAllianceData = async () => {
    const candidateEvent = sanitizeEventName(currentEvent || eventKeyInput)
    if (!candidateEvent) {
      toast.error("Set an event before syncing alliance captains")
      return
    }

    setAllianceSyncing(true)
    try {
      await ensureAllianceDataCached(candidateEvent, { force: true })
      const storageKey = `allianceCaptains:${candidateEvent}`
      try {
        const stored = localStorage.getItem(storageKey)
        if (stored) {
          const parsed = JSON.parse(stored)
          setAllianceDataPreview({
            alliances: Array.isArray(parsed.alliances) ? parsed.alliances : [],
            updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString()
          })
        }
      } catch (error) {
        console.error("Failed to parse alliance data", error)
      }
      toast.success("Alliance data synced")
    } catch (error) {
      console.error("Failed to sync alliance data", error)
      toast.error("Could not load alliance data from TBA")
    } finally {
      setAllianceSyncing(false)
    }
  }

  const handleAddEvent = async () => {
    const candidate = sanitizeEventName(newEvent)
    if (!candidate) {
      toast.error("Enter an event code before adding it")
      return
    }

    if (events.some((eventName) => eventName.toLowerCase() === candidate.toLowerCase())) {
      toast.warning("That event code already exists")
      setNewEvent("")
      return
    }

    const nextList = [...events, candidate]
    try {
      await performSettingsUpdate({ events: nextList }, `Added event: ${candidate}`)
      setNewEvent("")
    } catch {
      // Errors handled in performSettingsUpdate
    }
  }

  const handleSetCurrentEvent = async (eventName: string) => {
    try {
      await performSettingsUpdate({ currentEvent: eventName }, `Current event set to ${eventName}`)
      setEventKeyInput(eventName)
    } catch {
      // Feedback already provided
    }
  }

  const handleRemoveEvent = async (eventName: string) => {
    const listWithoutEvent = events.filter((stored) => stored !== eventName)
    const shouldClearCurrent = currentEvent === eventName
    try {
      await performSettingsUpdate(
        { events: listWithoutEvent, currentEvent: shouldClearCurrent ? null : undefined },
        shouldClearCurrent
          ? "Removed the active event. Scouts will need a new selection once you set it."
          : `Removed ${eventName}`
      )
      if (shouldClearCurrent) {
        setEventKeyInput("")
      }
    } catch {
      // Error already surfaced
    }
  }

  const handleClearCurrentEvent = async () => {
    if (!currentEvent) return
    try {
      await performSettingsUpdate({ currentEvent: null }, "Cleared the active event")
      setEventKeyInput("")
    } catch {
      // Error handled by performSettingsUpdate
    }
  }

  const webhookUrl = webhookForm?.webhook?.url?.trim() || ""
  const webhookMethod = webhookForm?.webhook?.method || "GET"
  const webhookFormName = webhookForm?.name || ""

  if (!canManageEvents) {
    return null
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Event Settings</h1>
        <p className="text-muted-foreground">
          Manage the event code scouts will use during match setup. Changes propagate instantly to every open device.
        </p>
        {isSyncing && (
          <p className="mt-2 text-sm text-muted-foreground">Syncing latest settings…</p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Event</CardTitle>
          <CardDescription>
            This event code is injected into the match forms and shown to every scout.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-between rounded-md border border-dashed border-border/60 bg-muted/20 p-4">
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            {currentEvent ? (
              <Badge variant="secondary" className="text-base font-semibold">
                {currentEvent}
              </Badge>
            ) : (
              <span className="text-sm text-muted-foreground">No event selected yet</span>
            )}
          </div>
          {currentEvent && (
            <Button
              variant="outline"
              size="sm"
              disabled={isSaving}
              onClick={() => {
                void handleClearCurrentEvent()
              }}
            >
              Clear
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manage Event Codes</CardTitle>
          <CardDescription>
            Add each official event your team participates in. When you set one as active, scouts see it instantly in Game Start.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              value={newEvent}
              onChange={(event) => setNewEvent(event.target.value)}
              placeholder="Enter event code (e.g., NJBR, 2025njfla)"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  void handleAddEvent()
                }
              }}
            />
            <Button onClick={() => { void handleAddEvent() }} className="sm:w-fit" disabled={isSaving}>
              <Plus className="mr-2 h-4 w-4" />
              Add Event
            </Button>
          </div>

          <Separator />

          <div className="space-y-3">
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No saved events yet. Add your current event code above to get started.
              </p>
            ) : (
              events.map((eventName) => {
                const isActive = eventName === currentEvent
                return (
                  <div
                    key={eventName}
                    className="flex flex-col gap-2 rounded-md border border-border/70 bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Calendar className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-semibold leading-tight">{eventName}</p>
                        {isActive && (
                          <p className="text-xs text-muted-foreground">This event is currently active for all scouts.</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!isActive && (
                        <Button
                          size="sm"
                          disabled={isSaving}
                          onClick={() => {
                            void handleSetCurrentEvent(eventName)
                          }}
                        >
                          <Check className="mr-2 h-4 w-4" />
                          Set Active
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isSaving}
                        onClick={() => {
                          void handleRemoveEvent(eventName)
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Webhook Sync</CardTitle>
          <CardDescription>
            Ping the active match form webhook on a scheduled cadence.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Sync interval (minutes)</Label>
              <Select
                value={webhookIntervalMinutes}
                onValueChange={(value) => setWebhookIntervalMinutes(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick minutes" />
                </SelectTrigger>
                <SelectContent>
                  {webhookIntervalOptions.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Active webhook</Label>
              <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm">
                {webhookLoading ? (
                  <span className="text-muted-foreground">Loading active form…</span>
                ) : webhookUrl ? (
                  <div className="space-y-1">
                    <div className="font-medium">{webhookFormName || "Active match form"}</div>
                    <div className="text-xs text-muted-foreground">{webhookMethod} • {webhookUrl}</div>
                  </div>
                ) : webhookForm ? (
                  <span className="text-muted-foreground">
                    No webhook configured. Set one in the active match form.
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    No active match form. Push one from Form Builder first.
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => {
                void handleStartWebhookSync()
              }}
              disabled={webhookRunning || webhookLoading || webhookStatusLoading || !webhookUrl}
            >
              {webhookRunning ? "Sync running" : "Start sync"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                void handleTestWebhook()
              }}
              disabled={webhookLoading || webhookStatusLoading || !webhookUrl || webhookTestLoading}
            >
              {webhookTestLoading ? "Testing..." : "Test webhook"}
            </Button>
            <Button
              variant="outline"
              onClick={handleStopWebhookSync}
              disabled={!webhookRunning || webhookStatusLoading}
            >
              Stop sync
            </Button>
            {webhookLastSync && (
              <p className="text-xs text-muted-foreground">
                Last request: {new Date(webhookLastSync).toLocaleString()}
              </p>
            )}
          </div>
          <Separator />
          <div className="space-y-2">
            <div className="text-sm font-semibold">Last response</div>
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm">
              {webhookResponse.receivedAt ? (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>
                      Time: {new Date(webhookResponse.receivedAt).toLocaleString()}
                    </span>
                    <span>
                      Status: {webhookResponse.status ?? "n/a"}{" "}
                      {webhookResponse.ok ? "(ok)" : "(error)"}
                    </span>
                    <span>
                      Duration: {webhookResponse.durationMs ?? 0} ms
                    </span>
                  </div>
                  {webhookResponse.error ? (
                    <div className="text-xs text-rose-500">{webhookResponse.error}</div>
                  ) : null}
                  {webhookResponse.body ? (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">
                      {webhookResponse.body}
                    </pre>
                  ) : (
                    <div className="text-xs text-muted-foreground">No response body.</div>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">No webhook requests yet.</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>TBA Alliance Data</CardTitle>
          <CardDescription>
            Pull captain lists and pick orders for the active event. This helps alliance selection and pick list planning.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                void handleSyncAllianceData()
              }}
              disabled={allianceSyncing || !currentEvent}
            >
              {allianceSyncing ? "Syncing alliance data..." : "Sync Alliance Data"}
            </Button>
            {!currentEvent && (
              <p className="text-sm text-muted-foreground">
                Set an event to enable alliance syncing.
              </p>
            )}
            {allianceDataPreview.updatedAt && (
              <p className="text-xs text-muted-foreground">
                Last updated: {new Date(allianceDataPreview.updatedAt).toLocaleString()}
              </p>
            )}
          </div>

          {allianceDataPreview.alliances.length > 0 ? (
            <div className="space-y-3">
              {allianceDataPreview.alliances.map((alliance) => (
                <div
                  key={alliance.allianceNumber}
                  className="rounded-md border border-border/60 bg-muted/10 p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Alliance {alliance.allianceNumber}</span>
                    {alliance.captain ? (
                      <Badge variant="secondary">Captain: {alliance.captain.replace('frc', '')}</Badge>
                    ) : (
                      <Badge variant="outline">Captain TBD</Badge>
                    )}
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">
                    <p>
                      Picks:{" "}
                      {alliance.picks.length > 0
                        ? alliance.picks.map((team) => team.replace('frc', '')).join(', ')
                        : 'None yet'}
                    </p>
                    {alliance.backup && (
                      <p>Backup: {alliance.backup.replace('frc', '')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No alliance data cached yet. Sync once eliminations begin to capture captains and pick lists.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sync Match Schedule</CardTitle>
          <CardDescription>
            Fetch qualification matches from The Blue Alliance so match numbers automatically select the right teams.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tbaApiKey">TBA API key</Label>
              <Input
                id="tbaApiKey"
                type="password"
                value={tbaApiKey}
                onChange={(event) => handleSetApiKey(event.target.value)}
                placeholder="Paste your private API key"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tbaEventKey">Event key</Label>
              <Input
                id="tbaEventKey"
                value={eventKeyInput}
                onChange={(event) => setEventKeyInput(event.target.value)}
                onFocus={() => setIsEditingEventKey(true)}
                onBlur={() => setIsEditingEventKey(false)}
                placeholder="2025njfla"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="rememberApiKey"
              checked={rememberApiKey}
              onCheckedChange={(value) => handleRememberToggle(Boolean(value))}
            />
            <Label htmlFor="rememberApiKey" className="text-sm text-muted-foreground">
              Remember this key for the current browser session
            </Label>
          </div>
          <div className="flex flex-col gap-3 rounded-md border border-dashed border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <div>
              {matchDataCount > 0 ? (
                <span>
                  Stored match schedule for <strong>{syncedEventLabel}</strong> with {matchDataCount} matches.
                  {matchUpdatedAt && (
                    <> Last synced {new Date(matchUpdatedAt).toLocaleString()}.</>
                  )}
                </span>
              ) : (
                <span>No match schedule cached yet. Sync an event to enable automatic team selection.</span>
              )}
            </div>
            <Button onClick={handleSyncMatchData} disabled={matchDataLoading}>
              {matchDataLoading ? "Syncing…" : "Sync match schedule"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default EventSettingsPage
