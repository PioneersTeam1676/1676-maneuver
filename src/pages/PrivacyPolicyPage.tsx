import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Lock, Shield, Database } from "lucide-react";

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen w-full bg-background px-4 py-16">
  <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 text-foreground">
                <div className="space-y-2 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1 text-xs uppercase tracking-[0.25rem] text-accent">
            <Lock className="h-4 w-4" /> Privacy first
          </span>
          <h1 className="text-4xl font-bold sm:text-5xl">Privacy Policy</h1>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
            Pioneer Scouting, developed by FRC Team 1676 (The Pascack Pi-oneers), is built to collect robotics competition data—not personal information about you. Here's how we safeguard your information.
          </p>
          <p className="mx-auto max-w-2xl text-xs text-muted-foreground/80">
            Effective Date: October 21, 2025 | Last Updated: October 21, 2025
          </p>
        </div>

        <Card className="border-accent/20 bg-card">
          <CardHeader className="border-b border-accent/20">
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Shield className="h-5 w-5 text-accent" />
              About Pioneer Scouting
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Pioneer Scouting (https://scouting.team1676.org) is a comprehensive FRC (FIRST Robotics Competition) scouting and strategy platform developed and maintained by FRC Team 1676. Our application helps robotics teams collect match data, analyze team performance, conduct pit scouting, and develop alliance selection strategies during competitions. This privacy policy explains how we handle your data.
            </CardDescription>
          </CardHeader>
        </Card>

  <Card className="border-accent/20 bg-card">
          <CardHeader className="border-b border-accent/20">
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Shield className="h-5 w-5 text-accent" />
              Data Collection and Use
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              We comply with the Google API Services User Data Policy, including the Limited Use requirements. The sections below outline exactly what we collect and why.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 py-8 text-foreground/80">
            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-accent">Google User Data We Access</h2>
              <p className="text-sm">
                When you sign in with Google, Pioneer Scouting accesses the following information from your Google account:
              </p>
              <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                <li><strong className="text-accent">Name:</strong> To identify you in scout assignments and activity logs</li>
                <li><strong className="text-accent">Email address:</strong> To verify your affiliation with authorized teams and assign appropriate access roles (scout, lead, admin)</li>
                <li><strong className="text-accent">Profile photo:</strong> To display in the user interface for easier team member identification</li>
                <li><strong className="text-accent">Google Subject ID:</strong> A unique identifier to maintain your account session</li>
              </ul>
              <p className="text-sm mt-3 text-muted-foreground">
                <strong className="text-accent">Purpose:</strong> We use this information solely for authentication, role management, and team coordination. Your Google data is never shared with third parties, sold to advertisers, or used for any purpose other than operating the scouting application.
              </p>
            </section>

            <Separator className="border-accent/20" />

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-accent">1. Information we process</h2>
              <ul className="grid gap-4 sm:grid-cols-2">
                <li className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <h3 className="font-semibold text-accent">Scouting inputs</h3>
                  <p className="text-sm text-muted-foreground">Match metrics, pit scouting notes, and analytics you or your team create inside the app.</p>
                </li>
                <li className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <h3 className="font-semibold text-accent">Device storage</h3>
                  <p className="text-sm text-muted-foreground">Local caches (IndexedDB, Cache Storage) that keep the app available offline at events.</p>
                </li>
                <li className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <h3 className="font-semibold text-accent">Google account data (when you sign in)</h3>
                  <p className="text-sm text-muted-foreground">Your name, email, profile photo, and Google ID are used exclusively for authentication, role assignment, and team coordination. This data is not shared with third parties or used for advertising.</p>
                </li>
                <li className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <h3 className="font-semibold text-accent">Optional analytics</h3>
                  <p className="text-sm text-muted-foreground">Lightweight events help us improve UI flows. Disable them anytime by using offline mode.</p>
                </li>
              </ul>
            </section>

            <Separator className="border-accent/20" />

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-accent">2. Storage, retention, and control</h2>
              <p>
                Your match data stays with you. Pioneer Scouting never uploads match logs to a central server unless you explicitly export them.
              </p>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                <li>All scouting data lives locally by default. Delete it in-app or via your browser's storage controls.</li>
                <li>Backups you export (JSON, QR codes) are in your control. Share them only with trusted teams.</li>
                <li>Google sign-in details only determine roles and account access; they are not shared with other teams.</li>
              </ul>
            </section>

            <Separator className="border-accent/20" />

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-accent">3. Integrations we rely on</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <Database className="mb-2 h-5 w-5 text-accent" />
                  <h3 className="font-semibold text-accent">External data sources</h3>
                  <p className="text-sm text-muted-foreground">Used for match schedules and historical data. Provider API terms apply when you sync data.</p>
                </div>
                <div className="rounded-xl border border-accent/20 bg-accent/5 p-4">
                  <Lock className="mb-2 h-5 w-5 text-accent" />
                  <h3 className="font-semibold text-accent">Google Identity Services</h3>
                  <p className="text-sm text-muted-foreground">
                    Handles authentication and ensures only approved alliance members gain elevated access. We request only your name, email, and Google subject identifier to assign roles, and we follow the{" "}
                    <a
                      className="text-accent underline underline-offset-4 hover:text-accent/80"
                      href="https://developers.google.com/terms/api-services-user-data-policy"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Google API Services User Data Policy (Limited Use)
                    </a>
                    .
                  </p>
                </div>
              </div>
            </section>

            <Separator className="border-accent/20" />

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-accent">4. Your privacy choices</h2>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                <li>Use the app completely offline with manual exports if you prefer.</li>
                <li>Clear local storage through in-app tools or browser settings at any time.</li>
                <li>Request role changes or data removal by contacting a Team 1676 admin.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-accent">5. Managing Google account access</h2>
              <p>
                You may disconnect Pioneer Scouting from your Google account at any time by visiting the{" "}
                <a
                  className="text-accent underline underline-offset-4 hover:text-accent/80"
                  href="https://myaccount.google.com/permissions"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google security permissions page
                </a>
                . Removing access deletes the app’s ability to authenticate you. If you do so, contact an alliance admin to re-grant the appropriate role.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-accent">Need help?</h2>
              <p>
                Reach the maintainers through your team’s communication channels. We respond quickly during build and competition season.
              </p>
            </section>

            <p className="text-xs uppercase tracking-[0.25rem] text-accent/70">Last updated · October 21, 2025</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
