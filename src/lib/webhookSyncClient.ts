import { apiGet, apiPost } from "@/lib/apiClient"

export type WebhookSyncStatus = {
  enabled: boolean
  intervalMinutes: number
  lastRunAt?: string | null
  lastStatus?: number | null
  lastOk?: boolean
  lastDurationMs?: number | null
  lastBody?: string | null
  lastError?: string | null
  activeFormId?: string | null
}

export const getWebhookSyncStatus = async (): Promise<WebhookSyncStatus> => {
  return apiGet<WebhookSyncStatus>("/webhook-sync")
}

export const startWebhookSync = async (intervalMinutes: number): Promise<WebhookSyncStatus> => {
  return apiPost<WebhookSyncStatus>("/webhook-sync/start", { intervalMinutes })
}

export const stopWebhookSync = async (): Promise<WebhookSyncStatus> => {
  return apiPost<WebhookSyncStatus>("/webhook-sync/stop")
}

export const testWebhookSync = async (): Promise<WebhookSyncStatus> => {
  return apiPost<WebhookSyncStatus>("/webhook-sync/test")
}
