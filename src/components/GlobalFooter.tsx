import { Link } from "react-router-dom"

export function GlobalFooter({ className = "" }: { className?: string }) {
  const year = new Date().getFullYear()
  return (
    <footer className={`w-full border-t border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 ${className}`}>
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 py-1 text-xs text-muted-foreground sm:flex-row sm:py-2">
        <span>Pascack Pi-oneers © {year}</span>
        <div className="flex items-center gap-4">
          <Link className="transition hover:text-foreground" to="/terms">
            Terms of Service
          </Link>
          <Link className="transition hover:text-foreground" to="/privacy">
            Privacy Policy
          </Link>
        </div>
      </div>
    </footer>
  )
}
