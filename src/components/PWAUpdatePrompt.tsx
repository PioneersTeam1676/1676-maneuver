/* eslint-disable @typescript-eslint/no-explicit-any */
// src/components/PWAUpdatePrompt.tsx
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { analytics } from '@/lib/analytics';

export function PWAUpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  const [applyingUpdate, setApplyingUpdate] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      const handleUpdateAvailable = (event: any) => {
        setWaitingWorker(event.detail.waiting);
        setShowPrompt(true);
      };

      const handleUpdateInstalled = () => {
        setShowPrompt(false);
        toast.success('App updated successfully!');
      };

      const checkForWaitingWorker = async () => {
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          if (!registration) return;
          await registration.update().catch(() => undefined);
          if (registration.waiting) {
            setWaitingWorker(registration.waiting);
            setShowPrompt(true);
          }
        } catch {
          // Ignore SW update probe failures.
        }
      };

      // Check for updates on page load
      navigator.serviceWorker.ready.then((registration) => {
        // Immediately check for a waiting worker
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setShowPrompt(true);
        }
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                setWaitingWorker(newWorker);
                setShowPrompt(true);
              }
            });
          }
        });
      });

      const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
          void checkForWaitingWorker();
        }
      };

      window.addEventListener('pageshow', checkForWaitingWorker);
      window.addEventListener('focus', checkForWaitingWorker);
      window.addEventListener('online', checkForWaitingWorker);
      document.addEventListener('visibilitychange', handleVisibility);

      // Custom events for update notifications
      window.addEventListener('sw-update-available', handleUpdateAvailable);
      window.addEventListener('sw-update-installed', handleUpdateInstalled);

      return () => {
        window.removeEventListener('pageshow', checkForWaitingWorker);
        window.removeEventListener('focus', checkForWaitingWorker);
        window.removeEventListener('online', checkForWaitingWorker);
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('sw-update-available', handleUpdateAvailable);
        window.removeEventListener('sw-update-installed', handleUpdateInstalled);
      };
    }
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      // Track PWA update
      analytics.trackPWAUpdate();
      setApplyingUpdate(true);

      const handleControllerChange = () => {
        window.location.reload();
      };

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange, { once: true });
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
      setShowPrompt(false);

      // Fallback in case iOS delays controllerchange notification.
      window.setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  };

  const handleClose = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <Card className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto w-auto max-w-80 shadow-lg">
      <CardContent className="p-4">
        <div className="space-y-3">
          <p className="text-sm font-medium">
            A new version of Pioneer Scouting is available!
          </p>
          <p className="text-xs text-muted-foreground">
            Update now to get the latest features and improvements.
          </p>
          <p className="text-xs text-red-400">
            WARNING: This will refresh the app and apply the update.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleUpdate} disabled={applyingUpdate}>
              {applyingUpdate ? 'Updating...' : 'Update Now'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleClose} disabled={applyingUpdate}>
              Later
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
