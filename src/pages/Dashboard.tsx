import { AppSidebar } from "@/components/DashboardComponents/app-sidebar"
import { SiteHeader } from "@/components/DashboardComponents/site-header"
import { BottomNavigation } from "@/components/BottomNavigation"
import { ScrollToTop } from "@/components/ScrollToTop"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { GlobalFooter } from "@/components/GlobalFooter"
import { AllianceOnboardingDialog } from "@/components/AllianceOnboardingDialog"
import { VerificationBanner } from "@/components/DashboardComponents/VerificationBanner"
import { useAuth } from "@/contexts/AuthContext"

import { Outlet, useLocation } from "react-router-dom"



export default function Dashboard() {
    const { role } = useAuth()
    const location = useLocation()
    const isPending = role === 'pending'
    const isFormMakerRoute = location.pathname === "/form-maker" || location.pathname.startsWith("/form-maker/")
    
    // For unverified (pending) users, show minimal layout without sidebar
    if (isPending) {
        return (
            <div className="flex h-dvh min-h-dvh flex-col overflow-hidden bg-background safe-area-bottom safe-area-top safe-area-inline">
                <ScrollToTop />
                <AllianceOnboardingDialog />
                <div
                    data-scrollable
                    className="flex-1 min-h-0 overflow-y-auto px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-5 md:px-6"
                >
                    <Outlet />
                </div>
            </div>
        )
    }
    
    return (
        <SidebarProvider
        style={
            {
            "--sidebar-width": "min(calc(var(--spacing) * 64), 19rem)",
            "--header-height": "calc(var(--spacing) * 12)",
            } as React.CSSProperties
        }
        >
        <AppSidebar variant="inset" />
        <SidebarInset className="flex h-dvh min-h-dvh flex-col bg-background safe-area-bottom safe-area-top safe-area-inline">
            <ScrollToTop />
            <SiteHeader />
            <AllianceOnboardingDialog />
            <div
                data-scrollable
                className={`flex-1 min-h-0 overflow-y-auto px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] ${isFormMakerRoute ? "pt-0" : "pt-5"} sm:px-5 md:px-6 2xl:pb-12`}
            >
                <VerificationBanner />
                <Outlet />
            </div>
            <GlobalFooter className="border-t bg-background/90 px-3 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-1 sm:px-5 md:px-6 sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pt-2" />
            <BottomNavigation />
        </SidebarInset>
        </SidebarProvider>
    )
}
