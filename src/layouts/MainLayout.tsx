import Dashboard from "@/pages/Dashboard";
import LandingPage from "@/pages/LandingPage";
import { Toaster } from "@/components/ui/sonner";
import MatchReminderBackground from "@/components/MatchReminderBackground";
import SessionRenewalBanner from "@/components/SessionRenewalBanner";
import PendingScoutingBanner from "@/components/PendingScoutingBanner";
import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

const MainLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { canAccessPath, defaultRoute, user, ready, authorizationReady } = useAuth();

  useEffect(() => {
    if (!ready) return;
    if (user && !authorizationReady) return;
    
    // If user is not logged in and not on a public page, show landing page
    if (!user && location.pathname === '/') {
      return; // Stay on landing page
    }
    
    const permitted = canAccessPath(location.pathname);
    if (!permitted) {
      navigate(defaultRoute, { replace: true });
      return;
    }
  }, [location.pathname, canAccessPath, defaultRoute, navigate, user, ready, authorizationReady]);

  // Show landing page for unauthenticated users on root path
  if (location.pathname === '/' && !user) {
    return (
      <>
        <LandingPage />
        <Toaster />
      </>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh w-full items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <AppErrorBoundary>
      <div className="flex min-h-dvh w-full flex-col bg-background">
        <PendingScoutingBanner />
        <SessionRenewalBanner />
        <Dashboard />
        <MatchReminderBackground />
        <Toaster />
      </div>
    </AppErrorBoundary>
  );
};

export default MainLayout;
