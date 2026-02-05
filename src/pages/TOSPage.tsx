import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ShieldCheck, ScrollText, Users } from "lucide-react";

export default function TOSPage() {
  return (
    <div className="min-h-screen w-full bg-background px-4 py-16">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 text-foreground">
        <div className="space-y-2 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-1 text-xs uppercase tracking-[0.25rem] text-accent">
            <ScrollText className="h-4 w-4" /> Pioneer Scouting
          </span>
          <h1 className="text-4xl font-bold sm:text-5xl">Terms of Service</h1>
          <p className="mx-auto max-w-2xl text-sm text-muted-foreground sm:text-base">
            These terms govern your use of Pioneer Scouting (https://scouting.team1676.org), developed by FRC Team 1676 (The Pascack Pi-oneers), to keep the platform fair, secure, and focused on delivering reliable data.
          </p>
          <p className="mx-auto max-w-2xl text-xs text-muted-foreground/80">
            Effective Date: October 21, 2025 | Last Updated: October 21, 2025
          </p>
        </div>

        <Card className="border-accent/20 bg-card">
          <CardHeader className="border-b border-accent/20">
            <CardTitle className="flex items-center gap-2 text-foreground">
              <ShieldCheck className="h-5 w-5 text-accent" />
              Your agreement with Pioneer Scouting
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              By using this application you confirm that you understand and accept the responsibilities outlined below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-8 py-8 text-foreground/80">
            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-accent">1. Appropriate use</h2>
              <p className="text-muted-foreground">Pioneer Scouting exists to support FRC scouting, analytics, and match preparation. You agree to:</p>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                <li>Use the platform solely for legitimate FIRST Robotics Competition activities.</li>
                <li>Provide accurate data and refrain from intentionally misrepresenting match outcomes.</li>
                <li>Avoid reverse engineering, scraping, or attempting to disrupt other users.</li>
              </ul>
            </section>

            <Separator className="border-accent/20" />

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-accent">2. Data ownership & processing</h2>
              <p className="text-muted-foreground">
                You retain ownership of the scouting notes, analytics, and uploads you create. Pioneer Scouting processes that data strictly to provide product features such as local storage, backup, and data transfer tooling.
              </p>
              <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
                <li>Most data lives locally on your device (IndexedDB, cache storage, and encrypted browser storage).</li>
                <li>Optional exports allow you to share data with other scouts or event partners.</li>
                <li>You control when to delete or export information stored in the application.</li>
              </ul>
            </section>

            <Separator className="border-accent/20" />

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-accent">3. Alliance conduct</h2>
              <p className="text-muted-foreground">
                The Team 1676 Scouting Alliance thrives on collaboration. You agree to respect other teams and volunteers by keeping conversations civil and data truthful.
              </p>
              <div className="flex flex-col gap-3 rounded-xl border border-accent/20 bg-accent/5 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-accent" />
                  <div>
                    <h3 className="text-sm font-semibold text-accent">Alliance trust</h3>
                    <p className="text-muted-foreground">Grant shared access only to teams who uphold the alliance code of conduct.</p>
                  </div>
                </div>
                <p className="rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs uppercase tracking-wide text-accent">
                  Collaboration first
                </p>
              </div>
            </section>

            <Separator className="border-accent/20" />

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-accent">4. Use of Google services</h2>
              <p className="text-muted-foreground">
                Pioneer Scouting relies on Google Identity Services for authentication. By signing in with Google you also agree to the{" "}
                <a
                  className="text-accent underline underline-offset-4 hover:text-accent/80"
                  href="https://policies.google.com/terms"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Terms of Service
                </a>
                {" "}and{" "}
                <a
                  className="text-accent underline underline-offset-4 hover:text-accent/80"
                  href="https://policies.google.com/privacy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google Privacy Policy
                </a>.
                Authentication data obtained from Google is used solely to confirm your identity, determine your alliance role, and secure access. We do not request or store any additional Google account information, and we comply with the{" "}
                <a
                  className="text-accent underline underline-offset-4 hover:text-accent/80"
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noreferrer"
                >
                  Google API Services User Data Policy (Limited Use)
                </a>.
              </p>
            </section>

            <Separator className="border-accent/20" />

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-accent">5. Warranty & liability</h2>
              <p className="text-muted-foreground">
                Pioneer Scouting is provided "as is." We don't guarantee uninterrupted service, and we are not liable for damages that result from reliance on the application or its data.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-xl font-semibold text-accent">6. Updates</h2>
              <p className="text-muted-foreground">
                We may revise these terms to reflect new capabilities or policies. Continuing to use the application after an update means you accept the latest version.
              </p>
            </section>

            <p className="text-xs uppercase tracking-[0.25rem] text-accent/70">Last updated · October 22, 2025</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
