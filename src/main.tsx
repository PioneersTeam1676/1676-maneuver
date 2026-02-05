import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

const shouldRegisterServiceWorker = () => {
  if (!('serviceWorker' in navigator)) return false
  if (import.meta.env.PROD) return true
  const hostname = window.location.hostname
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

if (shouldRegisterServiceWorker()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        let updateNotified = false

        const notifyUpdate = () => {
          if (updateNotified || !registration.waiting) return
          updateNotified = true
          window.dispatchEvent(new CustomEvent('sw-update-available', {
            detail: { waiting: registration.waiting }
          }))
        }

        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                notifyUpdate()
              }
            });
          }
        });

        // If an update is already waiting, surface it immediately.
        notifyUpdate()

        const checkForUpdates = async () => {
          try {
            await registration.update()
            notifyUpdate()
          } catch {
            // Ignore update check failures (offline, etc.)
          }
        }

        // Re-check updates when the tab becomes visible.
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            void checkForUpdates()
          }
        })

        // Periodic update check.
        window.setInterval(() => {
          void checkForUpdates()
        }, 5 * 60 * 1000)
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}
