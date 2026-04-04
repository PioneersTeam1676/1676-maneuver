import { Binoculars, Settings } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFullscreen } from '@/hooks/useFullscreen';
import { useNavigationConfirm } from '@/hooks/useNavigationConfirm';
import { NavigationConfirmDialog } from '@/components/NavigationConfirmDialog';
import { haptics } from '@/lib/haptics';
import Button from '@/components/ui/button';
import { useAuth, type UserRole } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface BottomNavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  minRole?: UserRole;
}

const baseNavItems: BottomNavItem[] = [
  {
    icon: Binoculars,
    label: 'Scout',
    href: '/game-start',
    minRole: 'scout',
  },
];

const devNavItem: BottomNavItem = {
  icon: Settings,
  label: 'Dev',
  href: '/dev-utilities',
  minRole: 'tech_lead',
};

const navItems: BottomNavItem[] = import.meta.env.DEV 
  ? [...baseNavItems, devNavItem] 
  : baseNavItems;

export function BottomNavigation() {
  const location = useLocation();
  const isMobile = useIsMobile();
  const { isFullscreen } = useFullscreen();
  const { canAccessPath } = useAuth();
  const { 
    confirmNavigation, 
    handleConfirm, 
    handleCancel, 
    isConfirmDialogOpen, 
    pendingDestinationLabel 
  } = useNavigationConfirm();

  const shouldShow = isMobile && !isFullscreen;

  if (!shouldShow) {
    return null;
  }

  const visibleNavItems = navItems.filter((item) => !item.minRole || canAccessPath(item.href))

  const handleNavigation = (href: string, label: string) => {
    if (!canAccessPath(href)) {
      toast.error("You don’t have access to that page yet.");
      return;
    }
    haptics.light();
    confirmNavigation(href, label);
  };

  return (
    <>
      <div 
        className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-t border-border shadow-lg safe-area-bottom safe-area-inline"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* QE: reduced nav padding */}
        <nav className="flex items-center justify-around py-1 px-1" aria-label="Bottom navigation">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            
            return (
              <Button
                key={item.href}
                variant="ghost"
                onClick={() => handleNavigation(item.href, item.label)}
                className={cn(
                  /* QE: reduced nav button padding and size */
                  "flex flex-col items-center gap-0.5 p-1.5 rounded-lg transition-all duration-200",
                  "min-w-0 flex-1 max-w-20 h-auto min-h-[2.5rem] touch-manipulation",
                  isActive 
                    ? "text-primary bg-primary/15 font-semibold shadow-sm" 
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60 active:scale-95"
                )}
                aria-label={item.label}
                aria-current={isActive ? 'page' : undefined}
              >
                {/* QE: smaller nav icons and text */}
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="text-[0.625rem] font-medium truncate w-full text-center leading-tight">{item.label}</span>
              </Button>
            );
          })}
        </nav>
      </div>
      
      <NavigationConfirmDialog
        open={isConfirmDialogOpen}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
        destinationLabel={pendingDestinationLabel}
      />
    </>
  );
}
