self.addEventListener("push", (event) => {
  if (!event.data) {
    return
  }

  let payload
  try {
    payload = event.data.json()
  } catch (error) {
    payload = {
      title: "Upcoming match reminder",
      body: event.data.text(),
    }
  }

  const title = payload.title || "Upcoming match reminder"
  const options = {
    body: payload.body,
    data: payload.data || {},
    tag: payload.tag,
    renotify: true,
    actions: payload.actions || [{ action: "open", title: "Open app" }],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const targetUrl = event.notification?.data?.url || "/"

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus()
          if (targetUrl && "navigate" in client) {
            client.navigate(targetUrl)
          }
          return
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
      return undefined
    })
  )
})
