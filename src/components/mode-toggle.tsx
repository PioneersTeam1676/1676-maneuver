import { Moon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

export function ModeToggle() {
    const { setTheme } = useTheme()

    return (
        <Button
            variant="outline"
            size="icon"
            className="relative h-10 w-10"
            onClick={() => setTheme("dark")}
            title="Dark mode"
            aria-label="Dark mode"
        >
            <Moon className="h-5 w-5" />
            <span className="sr-only">Dark mode</span>
        </Button>
    )
}
