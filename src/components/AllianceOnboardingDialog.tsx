import { useEffect, useMemo, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { toast } from "sonner"

export const AllianceOnboardingDialog = () => {
  const {
    requiresAllianceConfirmation,
    submitAllianceProfile,
    allianceProfile,
    user,
    allowedAllianceDomain,
  } = useAuth()

  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [teamNumber, setTeamNumber] = useState("")
  const [confirmAlliance, setConfirmAlliance] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const derivedNames = useMemo(() => {
    if (!user?.name) return { first: "", last: "" }
    const parts = user.name.trim().split(/\s+/)
    return {
      first: parts[0] || "",
      last: parts.length > 1 ? parts.slice(1).join(" ") : "",
    }
  }, [user])

  useEffect(() => {
    if (!requiresAllianceConfirmation) {
      return
    }
    setFirstName(allianceProfile?.firstName || derivedNames.first)
    setLastName(allianceProfile?.lastName || derivedNames.last)
    setTeamNumber(allianceProfile?.teamNumber || "")
    setConfirmAlliance(Boolean(allianceProfile?.confirmedAlliance))
    setError(null)
  }, [requiresAllianceConfirmation, allianceProfile, derivedNames])

  if (!requiresAllianceConfirmation || !user) {
    return null
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    const result = await submitAllianceProfile({
      firstName,
      lastName,
      teamNumber,
      confirmedAlliance: confirmAlliance,
    }).finally(() => setSubmitting(false))

    if (!result.success) {
      setError(result.message ?? "We couldn’t save your confirmation. Please try again.")
      return
    }

    toast.success("Alliance confirmation received. An admin will review your access shortly.")
  }

  return (
    <Dialog open onOpenChange={() => {}}>
      <DialogContent className="max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Confirm your scouting alliance</DialogTitle>
          <DialogDescription>
            To help keep data trustworthy, scouts outside the {allowedAllianceDomain} domain must confirm their team
            and agree to the Team 1676 Scouting Alliance guidelines before continuing.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                autoComplete="given-name"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                autoComplete="family-name"
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="teamNumber">Team number</Label>
            <Input
              id="teamNumber"
              value={teamNumber}
              onChange={(event) => setTeamNumber(event.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              required
            />
          </div>

          <div className="space-y-3 rounded-md border border-dashed border-muted-foreground/40 p-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="confirmAlliance"
                checked={confirmAlliance}
                onCheckedChange={(checked) => setConfirmAlliance(checked === true)}
                required
              />
              <Label htmlFor="confirmAlliance" className="text-sm leading-relaxed">
                I confirm that I am a member of the Team 1676 Scouting Alliance and will not upload false or
                misleading data. I understand access remains limited until an administrator approves my account.
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              Need access for your team? Contact a 1676 scouting lead to be added before submitting data.
            </p>
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Submitting..." : "Submit for review"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
