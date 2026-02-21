import { parseSpecialChoiceOptions } from "@/lib/specialChoiceOptions"
import { cn } from "@/lib/utils"

type SpecialMultipleChoiceProps = {
  ariaLabel: string
  options?: string[]
  value?: string
  onValueChange: (value: string) => void
  allowDeselect?: boolean
  disabled?: boolean
}

export function SpecialMultipleChoice({
  ariaLabel,
  options,
  value,
  onValueChange,
  allowDeselect = true,
  disabled = false,
}: SpecialMultipleChoiceProps) {
  const parsedOptions = parseSpecialChoiceOptions(options)

  if (!parsedOptions.length) {
    return null
  }

  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label={ariaLabel} className="space-y-3">
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
                "w-full rounded-xl border px-4 py-4 text-center transition-all sm:px-5 sm:py-5",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                "disabled:cursor-not-allowed disabled:opacity-60",
                isSelected
                  ? "border-primary/80 bg-primary/10 hover:bg-primary/15"
                  : "bg-card border-border/70 hover:border-border hover:bg-muted/30"
              )}
            >
              <p className="text-balance text-lg font-semibold leading-tight sm:text-xl">{option.title}</p>
              {option.description ? (
                <p className="mt-1.5 text-balance text-[11px] text-muted-foreground sm:text-xs">{option.description}</p>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
