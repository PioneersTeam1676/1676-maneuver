import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type NumberStepperProps = {
  value: number
  onChange: (value: number) => void
  adjustments?: number[]
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  className?: string
  inputClassName?: string
}

const normalizeAdjustments = (adjustments: number[]) =>
  Array.from(
    new Set(
      adjustments
        .map((value) => Math.abs(Number(value)))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  ).sort((a, b) => a - b)

export function NumberStepper({
  value,
  onChange,
  adjustments = [1],
  min,
  max,
  step = 1,
  disabled = false,
  className,
  inputClassName,
}: NumberStepperProps) {
  const safeValue = Number.isFinite(value) ? value : min ?? 0
  const normalizedAdjustments = normalizeAdjustments(adjustments)
  const hasMin = Number.isFinite(min)
  const hasMax = Number.isFinite(max)

  const clampValue = (nextValue: number) => {
    let clamped = nextValue
    if (hasMin) clamped = Math.max(min as number, clamped)
    if (hasMax) clamped = Math.min(max as number, clamped)
    return clamped
  }

  const handleAdjust = (delta: number) => {
    onChange(clampValue(safeValue + delta))
  }

  const handleInputChange = (rawValue: string) => {
    if (rawValue === "") {
      onChange(clampValue(min ?? 0))
      return
    }

    const parsed = Number(rawValue)
    if (!Number.isFinite(parsed)) return
    onChange(clampValue(parsed))
  }

  return (
    <div
      className={cn(
        "mx-auto grid w-full max-w-[22rem] grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3.25rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-1.5",
        className
      )}
    >
      {normalizedAdjustments
        .slice()
        .reverse()
        .map((amount) => {
          const nextValue = clampValue(safeValue - amount)
          return (
            <Button
              key={`decrease-${amount}`}
              type="button"
              variant="outline"
              size="sm"
              className="h-10 min-w-0 w-full px-0 text-sm font-semibold"
              onClick={() => handleAdjust(-amount)}
              disabled={disabled || nextValue === safeValue}
            >
              -{amount}
            </Button>
          )
        })}

      <Input
        type="number"
        inputMode="numeric"
        value={safeValue}
        min={min}
        max={max}
        step={step}
        onChange={(event) => handleInputChange(event.target.value)}
        disabled={disabled}
        className={cn("h-10 w-[3.25rem] px-1 text-center text-sm font-semibold tabular-nums", inputClassName)}
      />

      {normalizedAdjustments.map((amount) => {
        const nextValue = clampValue(safeValue + amount)
        return (
          <Button
            key={`increase-${amount}`}
            type="button"
            variant="outline"
            size="sm"
            className="h-10 min-w-0 w-full px-0 text-sm font-semibold"
            onClick={() => handleAdjust(amount)}
            disabled={disabled || nextValue === safeValue}
          >
            +{amount}
          </Button>
        )
      })}
    </div>
  )
}
