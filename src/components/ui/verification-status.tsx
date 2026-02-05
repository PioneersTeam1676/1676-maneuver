import { Check, X } from "lucide-react"

import { cn } from "@/lib/utils"

type VerificationStatusProps = {
  value: boolean
  className?: string
  yesLabel?: string
  noLabel?: string
}

export function VerificationStatus({ value, className, yesLabel = "Yes", noLabel = "No" }: VerificationStatusProps) {
  const label = value ? yesLabel : noLabel

  return (
    <span className={cn("inline-flex items-center gap-1 text-sm font-medium", className)}>
      {value ? (
        <Check aria-hidden className="h-4 w-4 text-emerald-500" />
      ) : (
        <X aria-hidden className="h-4 w-4 text-destructive" />
      )}
      <span>{label}</span>
    </span>
  )
}
