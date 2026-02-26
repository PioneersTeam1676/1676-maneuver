import { parseSpecialChoiceOptions } from "@/lib/specialChoiceOptions"
import { cn } from "@/lib/utils"

type SpecialMultipleChoiceProps = {
  ariaLabel: string
  options?: string[]
  value?: string
  values?: string[]
  onValueChange: (value: string) => void
  onValuesChange?: (values: string[]) => void
  multiSelect?: boolean
  allowDeselect?: boolean
  disabled?: boolean
}

export function SpecialMultipleChoice({
  ariaLabel,
  options,
  value,
  values,
  onValueChange,
  onValuesChange,
  multiSelect = false,
  allowDeselect = true,
  disabled = false,
}: SpecialMultipleChoiceProps) {
  const parsedOptions = parseSpecialChoiceOptions(options)

  if (!parsedOptions.length) {
    return null
  }

  if (multiSelect) {
    const selected = values ?? []
    return (
      <div role="group" aria-label={ariaLabel} className="space-y-1">
        {parsedOptions.map((option, index) => {
          const isSelected = selected.includes(option.value)
          return (
            <button
              key={`${option.value}_${index}`}
              type="button"
              aria-pressed={isSelected}
              onClick={() => {
                const next = isSelected
                  ? selected.filter((v) => v !== option.value)
                  : [...selected, option.value]
                onValuesChange?.(next)
              }}
              disabled={disabled}
              className={cn(
                "w-full rounded-md border px-2 py-1.5 text-center text-white transition-all touch-manipulation select-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                "disabled:cursor-not-allowed disabled:opacity-60",
                isSelected
                  ? "border-primary/80 bg-primary/10 hover:bg-primary/15"
                  : "bg-card border-border/70 hover:border-border hover:bg-muted/30"
              )}
            >
              <p className="text-balance text-sm font-semibold leading-tight">{option.title}</p>
              {option.description ? (
                <p className="mt-1 text-balance text-[10px] text-white/70">{option.description}</p>
              ) : null}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div role="radiogroup" aria-label={ariaLabel} className="space-y-1">
        {parsedOptions.map((option, index) => {
          const isSelected = value === option.value

          return (
            <button
              key={`${option.value}_${index}`}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onValueChange(isSelected && allowDeselect ? "" : option.value)}
              disabled={disabled}
              className={cn(
                "w-full rounded-md border px-2 py-1.5 text-center text-white transition-all touch-manipulation select-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                "disabled:cursor-not-allowed disabled:opacity-60",
                isSelected
                  ? "border-primary/80 bg-primary/10 hover:bg-primary/15"
                  : "bg-card border-border/70 hover:border-border hover:bg-muted/30"
              )}
            >
              <p className="text-balance text-sm font-semibold leading-tight">{option.title}</p>
              {option.description ? (
                <p className="mt-1 text-balance text-[10px] text-white/70">{option.description}</p>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
