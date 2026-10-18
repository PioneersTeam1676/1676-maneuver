import { Binoculars, Calendar, Wrench, Gamepad2, RotateCcw, HardDriveDownload, type LucideIcon } from "lucide-react"
import { useAuth, type UserRole } from "@/contexts/AuthContext"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useNavigationConfirm } from "@/hooks/useNavigationConfirm";
import { NavigationConfirmDialog } from "@/components/NavigationConfirmDialog";
import { toast } from "sonner";

const roleWeights: Record<UserRole, number> = {
  blocked: 0,
  pending: 0,
  pit_scout: 1,
  drive_team: 1,
  scout_minus: 2,
  scout: 2,
  scout_plus: 2,
  lead: 3,
  tech_lead: 4,
}

export function NavMain({
  sections,
}: {
  sections: {
    label: string
    items: {
      title: string
      url: string
      icon?: LucideIcon
      minRole?: UserRole
    }[]
  }[]
}) {
    const { canAccessPath, role, canRescout } = useAuth();
    const { isMobile, setOpenMobile } = useSidebar();
    const { 
      confirmNavigation, 
      handleConfirm, 
      handleCancel, 
      isConfirmDialogOpen, 
      pendingDestinationLabel 
    } = useNavigationConfirm();

    // navigate to the destination page
    const proceedClick = (url?: string) => {
        const destination = url || "/";
        const label = url === "/" ? "Home" : "this page";

        if (!canAccessPath(destination)) {
          toast.error("You don’t have access to that page yet.");
          return;
        }
        
        if (confirmNavigation(destination, label)) {
          // Navigation was allowed immediately
          if (isMobile) {
            setOpenMobile(false);
          }
        }
        // If navigation was blocked, confirmNavigation will show the dialog
    };

    const handleItemClick = (url: string, label?: string) => {
        const destinationLabel = label || url.split('/').pop() || "this page";
        if (!canAccessPath(url)) {
          toast.error("You don’t have access to that page yet.");
          return;
        }
        
        if (confirmNavigation(url, destinationLabel)) {
          if (isMobile) {
            setOpenMobile(false);
          }
        }
    };

    // Close sidebar when navigation is confirmed
    const handleConfirmNavigation = () => {
      if (isMobile) {
        setOpenMobile(false);
      }
      handleConfirm();
    };

    const hasAccessForRole = (minRole?: UserRole) => !minRole || roleWeights[role] >= roleWeights[minRole]

    const platformItems: Array<{ title: string; url: string; icon: LucideIcon; minRole?: UserRole; hidden?: boolean }> = [
      { title: "Scout", url: "/game-start", icon: Binoculars },
      { title: "Pit Scouting", url: "/pit-scouting", icon: Wrench, minRole: "pit_scout" },
      { title: "Drive Team Scouting", url: "/drive-scouting", icon: Gamepad2, minRole: "drive_team" },
      { title: "Schedule", url: "/schedule", icon: Calendar, minRole: "scout" },
      { title: "Rescout", url: "/rescout", icon: RotateCcw, hidden: !canRescout },
      { title: "Device Backup", url: "/device-backup", icon: HardDriveDownload },
    ]

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Platform</SidebarGroupLabel>
        <SidebarMenu>
          {platformItems
            .filter((item) => !item.hidden && hasAccessForRole(item.minRole))
            .map((item) => (
              <SidebarMenuItem key={item.title} className="flex items-center gap-2">
                <SidebarMenuButton tooltip={item.title} onClick={() => proceedClick(item.url)}>
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
        </SidebarMenu>
      </SidebarGroup>

      {sections.map((section) => {
        const visibleItems = section.items.filter((item) => hasAccessForRole(item.minRole))
        if (visibleItems.length === 0) return null

        return (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.title} className="flex items-center gap-2">
                  <SidebarMenuButton tooltip={item.title} onClick={() => handleItemClick(item.url, item.title)}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        )
      })}
      
      <NavigationConfirmDialog
        open={isConfirmDialogOpen}
        onConfirm={handleConfirmNavigation}
        onCancel={handleCancel}
        destinationLabel={pendingDestinationLabel}
      />
    </>
  )
}
