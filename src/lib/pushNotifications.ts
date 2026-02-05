import { apiDelete, apiPost } from "./apiClient"

export interface PersistSubscriptionPayload {
  email?: string
  subscription: PushSubscriptionJSON
  userAgent?: string
}

export const persistSubscription = async ({ email, subscription, userAgent }: PersistSubscriptionPayload): Promise<void> => {
  await apiPost("/push/subscriptions", {
    email,
    subscription,
    userAgent,
  })
}

export const removeSubscription = async (endpoint: string): Promise<void> => {
  await apiDelete("/push/subscriptions", { endpoint })
}

export const decodeVapidKey = (key: string): Uint8Array => {
  const padding = "=".repeat((4 - (key.length % 4)) % 4)
  const base64 = (key + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export const sendManualNotification = async (payload: {
  email: string
  title?: string
  body: string
  url?: string
}): Promise<void> => {
  await apiPost("/push/notify", payload)
}
