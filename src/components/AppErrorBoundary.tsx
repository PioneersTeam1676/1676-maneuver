import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("App render error:", error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-dvh w-full flex-col items-center justify-center gap-4 bg-background px-4 text-center">
          <p className="text-lg font-semibold">Something went wrong</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {this.state.error.message || "An unexpected error occurred. Try reloading."}
          </p>
          <Button onClick={() => window.location.reload()}>Reload app</Button>
        </div>
      )
    }

    return this.props.children
  }
}
