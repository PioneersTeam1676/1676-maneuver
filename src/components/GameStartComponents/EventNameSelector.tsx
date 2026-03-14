import { useEffect, useState } from "react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Check, ChevronsUpDown, Calendar, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useAuth } from "@/contexts/AuthContext"
import { Link, useNavigate } from "react-router-dom"
import { ApiError } from "@/lib/apiClient"
import {
  EVENT_UPDATED_EVENT,
  STORAGE_EVENT_NAME_KEY,
  STORAGE_EVENTS_KEY,
  STORAGE_EVENT_DISPLAY_NAMES_KEY,
  getEventDisplayName,
  syncEventSettings,
  updateEventSettings,
} from "@/lib/eventSettingsClient"

interface EventNameSelectorProps {
  currentEventName: string
  onEventNameChange: (eventName: string) => void
}

const loadEventsFromStorage = (): string[] => {
  if (typeof window === "undefined") return []
  try {
    const stored = localStorage.getItem(STORAGE_EVENTS_KEY)
    if (!stored) return []
    const parsed = JSON.parse(stored) as unknown
    if (!Array.isArray(parsed)) return []
    const normalized = parsed.filter((item): item is string => typeof item === "string")
    const unique = Array.from(new Set(normalized.map((value) => value.trim()).filter(Boolean)))
    return unique.sort((a, b) => a.localeCompare(b))
  } catch (error) {
    console.warn("Failed to parse stored events", error)
    return []
  }
}

const loadCurrentEventFromStorage = (): string => {
  if (typeof window === "undefined") return ""
  try {
    return localStorage.getItem(STORAGE_EVENT_NAME_KEY) || ""
  } catch (error) {
    console.warn("Failed to read stored current event", error)
    return ""
  }
}

export function EventNameSelector({ currentEventName, onEventNameChange }: EventNameSelectorProps) {
  const [open, setOpen] = useState(false)
  const [eventsList, setEventsList] = useState<string[]>(loadEventsFromStorage)
  const [isUpdating, setIsUpdating] = useState(false)
  const { role } = useAuth()
  const isEditable = role === "lead" || role === "tech_lead"
  const navigate = useNavigate()

  // Load saved events list on component mount
  useEffect(() => {
    const storedEvents = loadEventsFromStorage()
    setEventsList(storedEvents)

    const currentEvent = loadCurrentEventFromStorage()
    if (currentEvent && !currentEventName) {
      onEventNameChange(currentEvent)
    }
  }, [currentEventName, onEventNameChange])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_EVENT_NAME_KEY) {
        const value = event.newValue || ""
        onEventNameChange(value)
      }
      if (event.key === STORAGE_EVENTS_KEY || event.key === STORAGE_EVENT_DISPLAY_NAMES_KEY) {
        setEventsList(loadEventsFromStorage())
      }
    }

    const handleEventNameUpdated = () => {
      const latestEvent = loadCurrentEventFromStorage()
      onEventNameChange(latestEvent)
      setEventsList(loadEventsFromStorage())
    }

    window.addEventListener("storage", handleStorage)
    window.addEventListener(EVENT_UPDATED_EVENT, handleEventNameUpdated as EventListener)

    return () => {
      window.removeEventListener("storage", handleStorage)
      window.removeEventListener(EVENT_UPDATED_EVENT, handleEventNameUpdated as EventListener)
    }
  }, [onEventNameChange])

  useEffect(() => {
    let cancelled = false
    let inflight = false

    const syncSettings = async () => {
      if (inflight) return
      inflight = true
      try {
        const settings = await syncEventSettings()
        if (cancelled) return
        setEventsList(settings.events)
        if (!currentEventName && settings.currentEvent) {
          onEventNameChange(settings.currentEvent)
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to sync event settings", error)
        }
      } finally {
        inflight = false
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
  }, [currentEventName, onEventNameChange])

  const saveEvent = async (name: string) => {
    if (!name.trim()) return

    const trimmedName = name.trim()
    setIsUpdating(true)
    try {
      await updateEventSettings({ currentEvent: trimmedName })
      onEventNameChange(trimmedName)
      setOpen(false)
      toast.success(`Event set to: ${getEventDisplayName(trimmedName)}`)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Failed to update the event"
      toast.error(message)
    } finally {
      setIsUpdating(false)
    }
  }

  if (!isEditable) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-2 text-sm">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-foreground">
            {currentEventName ? getEventDisplayName(currentEventName) : "Awaiting event assignment"}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">Set by alliance leads</span>
      </div>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={isUpdating}
        >
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            {currentEventName ? getEventDisplayName(currentEventName) : "Select event..."}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0">
        <Command>
          <CommandInput placeholder="Search events..." />
          <CommandEmpty>
            <div className="text-center p-4">
              <p className="text-sm text-muted-foreground mb-2">No saved events yet</p>
              <Button asChild variant="outline" size="sm" className="w-full">
                <Link to="/event-settings">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Manage Events
                </Link>
              </Button>
            </div>
          </CommandEmpty>
          <CommandList>
            <CommandGroup>
              {eventsList.map((event) => {
                const displayName = getEventDisplayName(event)
                return (
                  <CommandItem
                    key={event}
                    value={displayName}
                    disabled={isUpdating}
                    onSelect={() => {
                      void saveEvent(event)
                    }}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center">
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          currentEventName === event ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {displayName}
                      </div>
                    </div>
                  </CommandItem>
                )
              })}
              {eventsList.length === 0 && (
                <CommandItem disabled>
                  Events will appear here after you add them in Event Settings.
                </CommandItem>
              )}
            </CommandGroup>
            <CommandGroup heading="Manage">
              <CommandItem
                onSelect={() => {
                  setOpen(false)
                  navigate("/event-settings")
                }}
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Event Settings
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
