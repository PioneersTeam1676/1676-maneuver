import { useMemo, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { GlobalFooter } from "@/components/GlobalFooter"
import LiquidEther from "@/components/LiquidEther"
import { Button } from "@/components/ui/button"
import { GoogleButton } from "@/components/ui/google-button"
import { useAuth } from "@/contexts/AuthContext"

const FEATURES = [
  {
    title: "Scout every match with confidence",
    description: "Structured forms mirror the field flow so rookies and veterans capture the same precise data.",
  },
  {
    title: "Decisions backed by analytics",
    description: "Pick lists, trend charts, and auto-generated insights give strategy leads instant clarity.",
  },
  {
    title: "Offline ready, alliance friendly",
    description: "Works in poor venue Wi-Fi, then syncs across the team the moment you reconnect.",
  },
]

const SECTIONS = [
  {
    label: "Built for competition days",
    points: [
      "Assign scouts, track attendance, and monitor live progress from a unified dashboard.",
      "Instantly load official TBA schedules to auto-fill alliances and eliminate manual typos.",
      "Flag anomalies, request verification, and keep a clean record of every submission.",
    ],
  },
  {
    label: "Designed for strategy rooms",
    points: [
      "Surface alliance-ready metrics: auto, teleop, endgame, and reliability at a glance.",
      "Build and adjust pick lists collaboratively without losing the history of any changes.",
      "Export data for drive teams or bring tablets straight to the pits with offline caching.",
    ],
  },
]

const STEPS = [
  "Configure your event and roles in minutes—no backend deployment needed.",
  "Scout matches from any device and let Maneuver reconcile duplicate or missing entries.",
  "Review, verify, and turn raw observations into alliance-winning calls before the next match.",
]

const DATA_PRACTICES = [
  {
    title: "Why we request your Google account data",
    description: "We use Google Sign-In to authenticate scouts and team members. We request your name, email address, and profile photo solely to: (1) verify your identity as an authorized team member, (2) assign appropriate access roles (scout, lead, admin), and (3) display your name in scouting assignments and activity logs. Your data is never sold or shared with third parties for advertising."
  },
  {
    title: "Match and pit scouting data",
    description: "All match observations, pit notes, team statistics, and strategy data you collect stay in your browser's local storage by default. This data is never automatically uploaded to external servers. You control when and how to export or share your scouting data with other team members."
  },
  {
    title: "Optional data syncing",
    description: "When you choose to sync data with our servers or import schedules from The Blue Alliance, those operations only occur with your explicit action. The app functions fully offline at competitions, ensuring your data remains on your device until you decide to share it."
  },
]

export default function LandingPage() {
  const { login, ready, user, defaultRoute } = useAuth()
  const navigate = useNavigate()

  // Automatically redirect authenticated users to their dashboard
  useEffect(() => {
    if (user && defaultRoute) {
      navigate(defaultRoute, { replace: true })
    }
  }, [user, defaultRoute, navigate])

  const heroCta = useMemo(() => {
    if (user) {
      return (
        <Button size="lg" className="h-12 w-full px-8 sm:w-auto" onClick={() => navigate(defaultRoute)}>
          Continue to dashboard
        </Button>
      )
    }
    return (
      <GoogleButton className="h-12 w-full max-w-xs text-base" onClick={login} disabled={!ready} />
    )
  }, [defaultRoute, login, navigate, ready, user])

  return (
    <div className="relative flex h-dvh min-h-dvh flex-col overflow-x-hidden overflow-y-auto bg-black text-white">
      <div className="absolute inset-0 -z-10" aria-hidden>
        <LiquidEther
          colors={["#5227FF", "#FF9FFC", "#B19EEF"]}
          mouseForce={20}
          cursorSize={100}
          isViscous={false}
          viscous={30}
          iterationsViscous={32}
          iterationsPoisson={32}
          resolution={0.5}
          isBounce={false}
          autoDemo
          autoSpeed={0.5}
          autoIntensity={2.2}
          takeoverDuration={0.25}
          autoResumeDelay={3000}
          autoRampDuration={0.6}
          className="h-full w-full opacity-90"
          style={{ width: "100%", height: "100%" }}
        />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,204,0,0.28),rgba(0,0,0,0.65))] mix-blend-screen opacity-70" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(82,39,255,0.25),rgba(0,0,0,0))] mix-blend-screen opacity-50" />
      </div>

      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <img src="/pioneer.png" alt="Pioneer Scouting" className="h-12 w-12 rounded-lg border border-white/10 bg-white/10 p-1" />
          <div className="leading-tight">
            <span className="text-sm uppercase tracking-[0.3rem] text-accent">FRC Team 1676</span>
            <p className="text-2xl font-semibold">Pioneer Scouting</p>
          </div>
        </div>
        {user ? (
          <Button size="sm" variant="outline" onClick={() => navigate(defaultRoute)} className="w-full sm:w-auto">
            Enter app
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={login} disabled={!ready} className="w-full sm:w-auto">
            Sign in
          </Button>
        )}
      </header>

      <main className="flex flex-1 w-full items-start justify-center px-4 pb-16 pt-8 sm:px-6 sm:pb-24">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 sm:gap-16">
          <section className="grid items-center gap-8 rounded-3xl border border-white/10 bg-white/[0.02] p-6 backdrop-blur-md sm:p-8 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] md:p-10">
            <div className="space-y-8">
              <span className="inline-flex items-center rounded-full border border-accent/30 bg-accent/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.25rem] text-accent">
                FRC Scouting Platform
              </span>
              <h1 className="text-3xl font-bold leading-tight sm:text-5xl lg:text-6xl">
                Pioneer Scouting: FRC Match Intelligence Platform
              </h1>
              <p className="max-w-xl text-base text-white/70 sm:text-lg">
                <strong>Pioneer Scouting</strong> is a comprehensive scouting and strategy application for FIRST Robotics Competition (FRC) teams, developed by FRC Team 1676 (The Pascack Pi-oneers). Our platform helps teams collect, analyze, and visualize match data, pit scouting information, and team performance metrics to make data-driven decisions during competitions.
              </p>
              <div className="rounded-xl border border-accent/30 bg-accent/10 p-4 text-sm text-white/90">
                <strong className="text-accent">What We Do:</strong> We provide tools for real-time match scouting, team statistics analysis, alliance selection strategy, and pit scouting management. Our app works offline-first, ensuring reliable performance even in venues with poor connectivity.
              </div>
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
                {heroCta}
                <p className="text-xs uppercase tracking-[0.35rem] text-white/50">Secure Google sign-in</p>
              </div>
              <p className="text-xs text-white/60">
                Signing in lets your coaches confirm your identity and align scouting assignments. Read how we protect your data in our <Link className="text-accent underline-offset-4 hover:underline" to="/privacy">privacy policy</Link>.
              </p>
            </div>

            <div className="grid gap-6 rounded-2xl border border-white/10 bg-black/60 p-8 shadow-[0_0_50px_rgba(255,204,0,0.08)]">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="space-y-2">
                  <h2 className="text-lg font-semibold text-accent">{feature.title}</h2>
                  <p className="text-sm text-white/70">{feature.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-10 rounded-3xl border border-white/10 bg-white/[0.02] p-10 backdrop-blur">
            <header className="space-y-4 text-center">
              <h2 className="text-3xl font-semibold">Why teams rely on Maneuver</h2>
              <p className="mx-auto max-w-3xl text-sm text-white/70">
                From early qualification matches to elimination war rooms, the platform keeps everyone on the same page without sacrificing depth. Here is how it supports each phase of competition.
              </p>
            </header>

            <div className="grid gap-8 lg:grid-cols-2">
              {SECTIONS.map((section) => (
                <article key={section.label} className="rounded-2xl border border-white/10 bg-black/60 p-8">
                  <h3 className="text-xl font-semibold text-accent">{section.label}</h3>
                  <ul className="mt-4 space-y-3 text-sm text-white/70">
                    {section.points.map((point) => (
                      <li key={point} className="flex items-start gap-3">
                        <span className="mt-[6px] h-2 w-2 flex-shrink-0 rounded-full bg-accent" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>

            <div className="rounded-2xl border border-accent/30 bg-accent/10 p-8 text-white">
              <h3 className="text-xl font-semibold text-accent">Race-ready in three simple steps</h3>
              <ol className="mt-4 space-y-4 text-sm text-white/80">
                {STEPS.map((step, index) => (
                  <li key={step} className="flex gap-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-accent/40 bg-black/70 text-sm font-semibold text-accent">
                      {index + 1}
                    </span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* <section className="grid gap-8 rounded-3xl border border-white/10 bg-black/60 p-10 text-white/80">
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold text-white">Trusted by the Pioneer Alliance</h2>
              <p className="max-w-2xl text-sm">
                Every feature is battle-tested at regional, district, and championship events. We iterate between matches, so the tooling keeps pace when the schedule moves fast.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
                <p className="text-4xl font-semibold text-accent">15+</p>
                <p className="mt-2 text-xs uppercase tracking-[0.3rem] text-white/50">Events supported</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
                <p className="text-4xl font-semibold text-accent">100K+</p>
                <p className="mt-2 text-xs uppercase tracking-[0.3rem] text-white/50">Data points logged</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6 text-center">
                <p className="text-4xl font-semibold text-accent">24/7</p>
                <p className="mt-2 text-xs uppercase tracking-[0.3rem] text-white/50">Offline capable</p>
              </div>
            </div>
          </section> */}

          <section className="grid gap-6 rounded-3xl border border-white/10 bg-white/[0.02] p-10 backdrop-blur">
            <div className="space-y-4">
              <h2 className="text-3xl font-semibold text-white">Why we request your Google data</h2>
              <p className="max-w-3xl text-sm text-white/70">
                Transparency is essential. Pioneer Scouting uses your Google account information solely for authentication and team management purposes. We comply with Google's API Services User Data Policy, including the Limited Use requirements.
              </p>
            </div>
            <div className="grid gap-6">
              {DATA_PRACTICES.map((item) => (
                <div key={item.title} className="rounded-2xl border border-white/10 bg-black/60 p-6">
                  <h3 className="mb-2 text-lg font-semibold text-accent">{item.title}</h3>
                  <p className="text-sm text-white/75">{item.description}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-6 text-sm text-white md:flex-row md:items-center md:justify-between">
              <span>
                Want the full details? Review our comprehensive privacy policy and terms of service to understand how we protect your data.
              </span>
              <div className="flex flex-wrap items-center gap-3">
                <Link className="rounded-full border border-accent/30 bg-black/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25rem] text-accent transition hover:border-accent/60" to="/privacy">
                  Privacy Policy
                </Link>
                <Link className="rounded-full border border-white/20 bg-black/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25rem] text-white/80 transition hover:border-white/40" to="/terms">
                  Terms of Service
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>

      <GlobalFooter className="mt-auto bg-transparent text-white/70" />
    </div>
  )
}
