import { createContext, useContext, useEffect, useState } from "react"

type Theme = "dark" | "light" | "system"

type ThemeProviderProps = {
    children: React.ReactNode
    defaultTheme?: Theme
    storageKey?: string
}

type ThemeProviderState = {
    theme: Theme
    setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
    theme: "system",
    setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

export function ThemeProvider({
    children,
    defaultTheme = "dark",
    storageKey = "vite-ui-theme",
    ...props
}: ThemeProviderProps) {
    const [theme, setThemeState] = useState<Theme>("dark")

    useEffect(() => {
        const root = window.document.documentElement

        // Dark-only application mode.
        root.classList.remove("light")
        root.classList.add("dark")
        root.style.colorScheme = "dark"
        localStorage.setItem(storageKey, "dark")
        if (theme !== "dark") {
          setThemeState("dark")
        }
    }, [storageKey, theme])

    const value = {
        theme: "dark" as Theme,
        setTheme: (_theme: Theme) => {
        localStorage.setItem(storageKey, "dark")
        setThemeState("dark")
        },
    }

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
        {children}
        </ThemeProviderContext.Provider>
    )
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext)

    if (context === undefined)
        throw new Error("useTheme must be used within a ThemeProvider")

    return context
}
