import * as React from "react"

// import { NavDocuments } from "@/components/DashboardComponents/nav-documents"
import { NavMain } from "@/components/DashboardComponents/nav-main"
// import { NavSecondary } from "@/components/DashboardComponents/nav-secondary"
import { NavUser } from "@/components/DashboardComponents/nav-user"
import { DataAttribution } from "@/components/DataAttribution"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Separator } from "../ui/separator"
import PioneerLogo from "/pioneer.png"
import { haptics } from "@/lib/haptics"
import type { UserRole } from "@/contexts/AuthContext"

const data = {
  navSections: [
    {
      label: "Operations",
      items: [
        {
          title: "Event Settings",
          url: "/event-settings",
          minRole: "lead" as UserRole,
        },
        {
          title: "Shift Generator",
          url: "/shift-generator",
          minRole: "lead" as UserRole,
        },
        {
          title: "Pit Assignments",
          url: "/pit-assignments",
          minRole: "lead" as UserRole,
        },
        {
          title: "Match Outliers",
          url: "/outliers",
          minRole: "lead" as UserRole,
        },
        {
          title: "Scout Activity",
          url: "/scout-activity",
          minRole: "lead" as UserRole,
        },
      ],
    },
    {
      label: "People & Access",
      items: [
        {
          title: "Verification Center",
          url: "/verification-center",
          minRole: "lead" as UserRole,
        },
        {
          title: "User Management",
          url: "/user-management",
          minRole: "lead" as UserRole,
        },
        {
          title: "Scout Management",
          url: "/scout-management",
          minRole: "lead" as UserRole,
        },
        {
          title: "Pi Panel",
          url: "/pi-panel",
          minRole: "lead" as UserRole,
        },
      ],
    },
    {
      label: "System Tools",
      items: [
        {
          title: "Admin Panel",
          url: "/admin",
          minRole: "tech_lead" as UserRole,
        },
        {
          title: "JSON Data Transfer",
          url: "/json-transfer",
          minRole: "lead" as UserRole,
        },
        {
          title: "Data Management",
          url: "/data-management",
          minRole: "tech_lead" as UserRole,
        },
        {
          title: "API Data",
          url: "/api-data",
          minRole: "tech_lead" as UserRole,
        },
        {
          title: "Clear Data",
          url: "/clear-data",
          minRole: "tech_lead" as UserRole,
        },
        ...(import.meta.env.DEV
          ? [{
              title: "Dev Utilities",
              url: "/dev-utilities",
              minRole: "tech_lead" as UserRole,
            }]
          : []),
      ],
    },
  ],
  navSecondary: [
    {
      title: "Get Help (WIP)",
      url: "#",
      // icon: IconHelp,
    },
  ],
  documents: [
    {
      name: "Saved Match Strategies (WIP)",
      url: "#",
      // icon: IconDatabase,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { setOpenMobile } = useSidebar()
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null)
  
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    touchStartRef.current = { x: touch.clientX, y: touch.clientY }
  }
  
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return
    
    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchStartRef.current.x
    const deltaY = touch.clientY - touchStartRef.current.y
    const minSwipeDistance = 60
    
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
      if (deltaX < -minSwipeDistance) {
        e.preventDefault()
        haptics.light()
        setOpenMobile(false)
      }
    }
    
    touchStartRef.current = null
  }

  React.useEffect(() => {
    const handleGlobalTouchStart = (e: TouchEvent) => {
      const sidebar = document.querySelector('[data-sidebar="sidebar"]')
      if (sidebar && !sidebar.contains(e.target as Node)) {
        const touch = e.touches[0]
        touchStartRef.current = { x: touch.clientX, y: touch.clientY }
      }
    }

    const handleGlobalTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return
      
      const sidebar = document.querySelector('[data-sidebar="sidebar"]')
      if (sidebar && !sidebar.contains(e.target as Node)) {
        const touch = e.changedTouches[0]
        const deltaX = touch.clientX - touchStartRef.current.x
        const deltaY = touch.clientY - touchStartRef.current.y
        const minSwipeDistance = 60
        
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
          if (deltaX < -minSwipeDistance) {
            e.preventDefault()
            haptics.light()
            setOpenMobile(false)
          }
        }
      }
      
      touchStartRef.current = null
    }

    document.addEventListener('touchstart', handleGlobalTouchStart, { passive: true })
    document.addEventListener('touchend', handleGlobalTouchEnd, { passive: false })

    return () => {
      document.removeEventListener('touchstart', handleGlobalTouchStart)
      document.removeEventListener('touchend', handleGlobalTouchEnd)
    }
  }, [setOpenMobile])

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button] h-fit py-2"
            >
            <a href="/" aria-label="Pioneer Scouting Home" className="flex items-center gap-3 px-1">
                <img
                  src={PioneerLogo}
                  width="90"
                  height="60"
                  alt="Pioneer Scouting Logo"
                  className="shrink-0"
                />
                <span className="font-bold text-lg leading-tight tracking-tight">Pioneer Scouting</span>
              </a>
            </SidebarMenuButton>
            <Separator className="my-1" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <NavMain sections={data.navSections} />
      </SidebarContent>
      <SidebarFooter>
        <div className="px-2 py-1">
          <DataAttribution sources={['tba']} variant="compact" />
        </div>
        <NavUser />
      </SidebarFooter>
    </Sidebar>
  )
}
