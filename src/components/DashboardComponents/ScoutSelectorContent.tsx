import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Check, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"

interface ScoutSelectorContentProps {
  currentScout: string
  scoutsList: string[]
  onScoutSelect: (name: string) => Promise<void>
  onScoutRemove: (name: string) => Promise<void>
  onClose?: () => void
  canRemove?: boolean
}

export function ScoutSelectorContent({ 
  currentScout, 
  scoutsList, 
  onScoutSelect, 
  onScoutRemove,
  onClose,
  canRemove = true,
}: ScoutSelectorContentProps) {
  const getScoutName = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0).toUpperCase())
      .join('')
      .slice(0, 3) // Limit to 3 characters
  }

  const handleScoutSelect = async (name: string) => {
    await onScoutSelect(name)
    onClose?.()
  }

  return (
    <Command shouldFilter={true}>
      <>
        <CommandInput placeholder="Search scouts..." />
        <CommandEmpty>
          <div className="p-4 text-center text-sm text-muted-foreground">
            No scouts found.
          </div>
        </CommandEmpty>
        <CommandList>
          <CommandGroup>
            {scoutsList.map((scout) => (
              <CommandItem
                key={scout}
                value={scout}
                onSelect={() => handleScoutSelect(scout)}
                className="flex items-center justify-between"
              >
                <div className="flex items-center">
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      currentScout === scout ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-xs bg-muted">
                        {getScoutName(scout)}
                      </AvatarFallback>
                    </Avatar>
                    {scout}
                  </div>
                </div>
                {canRemove && (
                  <button
                    type="button"
                    aria-label={`Remove ${scout}`}
                    onClick={async (e) => {
                      e.stopPropagation()
                      await onScoutRemove(scout)
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </>
    </Command>
  )
}
