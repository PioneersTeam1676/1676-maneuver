self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

// Push notifications handler
try {
  self.importScripts("/push-handler.js")
} catch (error) {
  // eslint-disable-next-line no-console
  console.warn("Failed to load push handler", error)
}
