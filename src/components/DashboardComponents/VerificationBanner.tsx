import { useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { ShieldAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
import { isPendingVerificationRequest } from "@/lib/verificationRequest"

export function VerificationBanner() {
  const {
    isLead,
    recentUsers,
    roleAssignments,
    allowedAllianceDomains,
  } = useAuth()
  const navigate = useNavigate()

  const pendingVerifications = useMemo(() => {
    if (!isLead) return []
    const domains = allowedAllianceDomains.filter(Boolean)

    return recentUsers.filter((record) =>
      isPendingVerificationRequest({
        ...record,
        assignedRole: roleAssignments[record.email] ?? "pending",
      }, domains)
    )
  }, [isLead, recentUsers, roleAssignments, allowedAllianceDomains])

  if (!isLead || pendingVerifications.length === 0) {
    return null
  }

  const handleNavigate = () => {
    navigate("/verification-center")
  }

  return (
    <Alert className="mb-4 border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-500/70 dark:bg-amber-500/10 dark:text-amber-100">
      <ShieldAlert className="h-5 w-5" />
      <AlertTitle className="flex items-center gap-2">
        Verification needed
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span>
          {pendingVerifications.length === 1
            ? "A new external Google sign-in is waiting for approval."
            : `${pendingVerifications.length} external Google sign-ins need verification.`}
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleNavigate}>
            Review now
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  )
}
