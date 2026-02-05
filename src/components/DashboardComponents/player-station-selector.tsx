import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"

type PlayerStationSelectorProps = {
  className?: string
}

type PlayerStationOption = {
  value: string
  label: string
  requiresLead?: boolean
}

const PLAYER_STATION_OPTIONS: PlayerStationOption[] = [
  { value: "lead", label: "Lead", requiresLead: true },
  { value: "red-1", label: "Red 1" },
  { value: "red-2", label: "Red 2" },
  { value: "red-3", label: "Red 3" },
  { value: "blue-1", label: "Blue 1" },
  { value: "blue-2", label: "Blue 2" },
  { value: "blue-3", label: "Blue 3" },
]

export function PlayerStationSelector({ className }: PlayerStationSelectorProps) {
  const [selected, setSelected] = useState<string | null>(() => {
    if (typeof window === "undefined") return null
    return localStorage.getItem("playerStation")
  })
  const { role, isLead } = useAuth()
  const isScout = role === "scout"

  useEffect(() => {
    const handlePlayerStationUpdated = (event: Event) => {
      if (event instanceof CustomEvent && typeof event.detail === "string") {
        setSelected(event.detail)
        return
      }
      if (typeof window !== "undefined") {
        setSelected(localStorage.getItem("playerStation"))
      }
    }

    window.addEventListener("playerStationUpdated", handlePlayerStationUpdated)
    return () => {
      window.removeEventListener("playerStationUpdated", handlePlayerStationUpdated)
    }
  }, [])

  const handleChange = (value: string) => {
    if (isScout) return
    setSelected(value)
    localStorage.setItem("playerStation", value)
    window.dispatchEvent(new CustomEvent("playerStationUpdated", { detail: value }))
  }

  return (
    <Select
      onValueChange={handleChange}
      value={selected ?? undefined}
      disabled={isScout}
    >
      <SelectTrigger
        id="playerStation"
        aria-label="Select player station"
        className={cn("h-11 min-w-[8rem] justify-between", className)}
      >
        <SelectValue placeholder="Choose station" />
      </SelectTrigger>
      <SelectContent>
        {PLAYER_STATION_OPTIONS.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            disabled={option.requiresLead && !isLead}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
