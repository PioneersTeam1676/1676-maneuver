import { SidebarTrigger } from "@/components/ui/sidebar"

export function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:-mx-2 md:-mt-2 md:rounded-t-xl md:border md:border-b"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="flex min-h-[3.25rem] w-full items-center px-3 sm:px-4 lg:px-6">
        <SidebarTrigger className="-ml-1" size="lg" aria-label="Open navigation" />
      </div>
    </header>
  )
}
