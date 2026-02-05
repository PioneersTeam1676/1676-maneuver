import { useAuth } from "@/contexts/AuthContext"
import { useNavigate } from "react-router-dom"
import { useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { ShieldCheck } from "lucide-react"

const AllianceOnboardingPage = () => {
  const { user, role, allowedAllianceDomain, allianceProfile } = useAuth()
  const navigate = useNavigate()
  
  // Redirect verified users away from onboarding page
  useEffect(() => {
    if (role !== 'pending') {
      navigate('/', { replace: true })
    }
  }, [role, navigate])

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <ShieldCheck className="h-6 w-6" />
            Team 1676 Scouting Alliance
          </CardTitle>
          <CardDescription>
            Provide your details so an administrator can approve scouting access for your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 p-4 text-sm text-muted-foreground">
            <p>
              Accounts using the <Badge variant="outline" className="mx-1">@{allowedAllianceDomain}</Badge> domain are granted
              scouting access automatically. Others must confirm their alliance membership and wait for approval from a 1676 admin.
            </p>
          </div>

          <div>
            <h2 className="text-lg font-semibold">Current status</h2>
            <ul className="mt-2 space-y-2 text-sm">
              <li>
                <span className="font-medium text-foreground">Signed in as:</span>{" "}
                {user ? `${user.name} (${user.email})` : "Not signed in"}
              </li>
              <li>
                <span className="font-medium text-foreground">Role:</span>{" "}
                {role === "pending" ? "Pending approval" : role}
              </li>
              <li>
                <span className="font-medium text-foreground">Alliance form:</span>{" "}
                {allianceProfile ? `Submitted on ${new Date(allianceProfile.submittedAt).toLocaleString()}` : "Awaiting submission"}
              </li>
            </ul>
          </div>

          <Alert>
            <AlertDescription>
              Complete the confirmation dialog to submit your team details. Once an admin approves your account, you’ll
              unlock the scouting workflows automatically.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}

export default AllianceOnboardingPage
