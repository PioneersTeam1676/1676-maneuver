import { Binoculars, ChevronRight, type LucideIcon } from "lucide-react"
import { useAuth, type UserRole } from "@/contexts/AuthContext"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { useNavigationConfirm } from "@/hooks/useNavigationConfirm";
import { NavigationConfirmDialog } from "@/components/NavigationConfirmDialog";
import { toast } from "sonner";

const roleWeights: Record<UserRole, number> = {
  pending: 0,
  scout: 1,
  lead: 2,
  form_maker: 3,
  admin: 4,
  ultra_admin: 5,
}

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    isActive?: boolean
    minRole?: UserRole
    items?: {
      title: string
      url: string
      minRole?: UserRole
    }[]
  }[]
}) {
    const { canAccessPath, role } = useAuth();
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

    // Handler for sub-menu clicks
    const handleSubItemClick = (url: string) => {
        const label = url.split('/').pop() || "this page";
        if (!canAccessPath(url)) {
          toast.error("You don’t have access to that page yet.");
          return;
        }
        
        if (confirmNavigation(url, label)) {
          // Navigation was allowed immediately
          if (isMobile) {
            setOpenMobile(false);
          }
        }
        // If navigation was blocked, confirmNavigation will show the dialog
    };

    // Close sidebar when navigation is confirmed
    const handleConfirmNavigation = () => {
      if (isMobile) {
        setOpenMobile(false);
      }
      handleConfirm();
    };

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Platform</SidebarGroupLabel>
        <SidebarMenu>
          {/* Home tab removed as requested */}
          <SidebarMenuItem className="flex items-center gap-2">
            <SidebarMenuButton tooltip={"Scout"} onClick={() => proceedClick("/game-start")}>
              <Binoculars />
              <span>Scout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {items
            .filter((item) => !item.minRole || roleWeights[role] >= roleWeights[item.minRole])
            .map((item) => (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={item.isActive}
              className="group/collapsible"
            >
              
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items
                      ?.filter((subItem) => !subItem.minRole || roleWeights[role] >= roleWeights[subItem.minRole])
                      .map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton asChild>
                            <button onClick={() => handleSubItemClick(subItem.url)}>
                              <span>{subItem.title}</span>
                            </button>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          ))}
        </SidebarMenu>
      </SidebarGroup>
      
      <NavigationConfirmDialog
        open={isConfirmDialogOpen}
        onConfirm={handleConfirmNavigation}
        onCancel={handleCancel}
        destinationLabel={pendingDestinationLabel}
      />
    </>
  )
}
