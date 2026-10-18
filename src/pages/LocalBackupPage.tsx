import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Copy, Download, FileJson, FileSpreadsheet, RefreshCw, Share2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  BACKUP_CHANGED_EVENT,
  BACKUP_RETENTION_MS,
  buildBackupCsv,
  buildBackupJson,
  latestPerEntry,
  listLocalBackups,
  type BackupRecord,
} from "@/lib/localBackup"
import { db, pitDB, syncCachedPitScoutingEntries, syncCachedScoutingEntries, type ScoutingEntryDB } from "@/lib/dexieDB"
import { getPendingSubmissions } from "@/lib/pendingScoutingQueue"
import type { PitScoutingEntry } from "@/lib/pitScoutingTypes"
import { useAuth } from "@/contexts/AuthContext"
import { apiGet, apiPost } from "@/lib/apiClient"

type ServerSnapshot = { name: string; size: number; createdAt: string }

// Leads only: rolling JSON snapshots the server keeps (server/data/backups).
const ServerSnapshots = () => {
  const [snapshots, setSnapshots] = useState<ServerSnapshot[] | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const { backups } = await apiGet<{ backups: ServerSnapshot[] }>("/backups")
      setSnapshots(backups)
    } catch {
      setSnapshots(null)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const takeNow = async () => {
    setBusy(true)
    try {
      await apiPost("/backups", {}, { timeoutMs: 60_000 })
      toast.success("Server snapshot saved.")
      await load()
    } catch (error) {
      toast.error(`Snapshot failed: ${(error as Error)?.message || "unknown error"}`)
    } finally {
      setBusy(false)
    }
  }

  const download = async (name: string) => {
    try {
      const data = await apiGet<unknown>(`/backups/${encodeURIComponent(name)}`, { timeoutMs: 60_000 })
      downloadText(name, JSON.stringify(data, null, 2), "application/json")
    } catch (error) {
      toast.error(`Download failed: ${(error as Error)?.message || "unknown error"}`)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Server snapshots</CardTitle>
        <CardDescription>
          The server saves every scouting and pit entry to a JSON file each hour and keeps the last 24 hours.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button size="sm" variant="outline" onClick={() => void takeNow()} disabled={busy}>
          {busy ? "Saving…" : "Take snapshot now"}
        </Button>
        {snapshots === null ? (
          <p className="text-sm text-muted-foreground">Server snapshots are unavailable right now.</p>
        ) : snapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No snapshots yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm">
            {snapshots.map((snapshot) => (
              <li key={snapshot.name} className="flex items-center gap-3 py-2">
                <span className="flex-1">{formatTime(Date.parse(snapshot.createdAt))}</span>
                <span className="text-xs text-muted-foreground">{Math.max(1, Math.round(snapshot.size / 1024))} KB</span>
                <Button size="sm" variant="ghost" onClick={() => void download(snapshot.name)}>
                  <Download className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

const retentionHours = Math.round(BACKUP_RETENTION_MS / 3_600_000)

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)

const deviceLabel = () => {
  try {
    return localStorage.getItem("currentScout") || localStorage.getItem("scoutName") || "device"
  } catch {
    return "device"
  }
}

const safeName = (value: string) => value.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40) || "device"

const downloadText = (filename: string, text: string, mime: string) => {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const formatTime = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })

type Unsynced = { matches: ScoutingEntryDB[]; pit: PitScoutingEntry[]; queued: number }

const LocalBackupPage = () => {
  const { isLead } = useAuth()
  const [records, setRecords] = useState<BackupRecord[]>([])
  const [unsynced, setUnsynced] = useState<Unsynced>({ matches: [], pit: [], queued: 0 })
  const [loading, setLoading] = useState(true)
  const [allCopies, setAllCopies] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [rows, matches, pit] = await Promise.all([
        listLocalBackups(),
        db.scoutingData.filter((row) => row.synced === false).toArray(),
        pitDB.pitScoutingData.filter((row) => row.synced === false).toArray(),
      ])
      setRecords(rows)
      setUnsynced({ matches, pit, queued: getPendingSubmissions().length })
    } catch (error) {
      console.error("Failed to load local backup", error)
      toast.error("Could not read the device backup.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const onChange = () => void refresh()
    window.addEventListener(BACKUP_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(BACKUP_CHANGED_EVENT, onChange)
  }, [refresh])

  const exportRows = useMemo(() => (allCopies ? records : latestPerEntry(records)), [allCopies, records])
  const counts = useMemo(() => {
    const latest = latestPerEntry(records)
    return {
      match: latest.filter((row) => row.kind === "match").length,
      pit: latest.filter((row) => row.kind === "pit").length,
      drive: latest.filter((row) => row.kind === "drive").length,
    }
  }, [records])

  const jsonText = useCallback(
    () =>
      buildBackupJson(exportRows, {
        device: deviceLabel(),
        // Entries that have not reached the server yet, straight from the
        // sync caches and the emergency queue, so nothing is missed even if
        // the backup copy predates a later edit.
        unsynced: {
          matches: unsynced.matches,
          pit: unsynced.pit,
          queued: getPendingSubmissions(),
        },
      }),
    [exportRows, unsynced],
  )

  const baseName = `maneuver-backup-${safeName(deviceLabel())}-${stamp()}`

  const handleJson = () => {
    downloadText(`${baseName}.json`, jsonText(), "application/json")
    toast.success(`Downloaded ${exportRows.length} record${exportRows.length === 1 ? "" : "s"}.`)
  }

  const handleCsv = () => {
    downloadText(`${baseName}.csv`, buildBackupCsv(exportRows), "text/csv;charset=utf-8")
    toast.success("CSV downloaded.")
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonText())
      toast.success("Backup JSON copied to clipboard.")
    } catch {
      toast.error("Clipboard not available here. Use Download instead.")
    }
  }

  const canShareFiles = typeof navigator !== "undefined" && typeof navigator.canShare === "function"

  const handleShare = async () => {
    try {
      const file = new File([jsonText()], `${baseName}.json`, { type: "application/json" })
      if (!navigator.canShare?.({ files: [file] })) {
        toast.error("Sharing files is not supported on this device. Use Download instead.")
        return
      }
      await navigator.share({ files: [file], title: "Maneuver scouting backup" })
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") {
        toast.error("Share failed. Use Download instead.")
      }
    }
  }

  // Load a backup file (from this or another device) back into the sync
  // queue. The server upserts by entry id, so re-sending an entry that is
  // already stored just updates it; nothing is duplicated.
  const handleRestore = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as {
        format?: string
        records?: Array<{ kind?: string; payload?: unknown }>
        unsynced?: { matches?: ScoutingEntryDB[]; pit?: PitScoutingEntry[] }
      }
      if (parsed.format !== "maneuver-local-backup") {
        toast.error("That is not a Maneuver device backup file.")
        return
      }
      const matches = new Map<string, ScoutingEntryDB>()
      const pit = new Map<string, PitScoutingEntry>()
      for (const record of parsed.records ?? []) {
        const payload = record.payload as { id?: string } | undefined
        if (!payload?.id) continue
        if (record.kind === "match") matches.set(payload.id, payload as ScoutingEntryDB)
        if (record.kind === "pit") pit.set(payload.id, payload as PitScoutingEntry)
      }
      for (const row of parsed.unsynced?.matches ?? []) if (row?.id) matches.set(row.id, row)
      for (const row of parsed.unsynced?.pit ?? []) if (row?.id) pit.set(row.id, row)

      await db.scoutingData.bulkPut(Array.from(matches.values()).map((row) => ({ ...row, synced: false })))
      await pitDB.pitScoutingData.bulkPut(Array.from(pit.values()).map((row) => ({ ...row, synced: false })))
      toast.success(`Queued ${matches.size} match and ${pit.size} pit entr${matches.size + pit.size === 1 ? "y" : "ies"} for upload.`)
      const results = await Promise.allSettled([syncCachedScoutingEntries(), syncCachedPitScoutingEntries()])
      if (results.some((result) => result.status === "rejected")) {
        toast.warning("Some entries could not upload yet. They stay queued and retry automatically.")
      } else {
        toast.success("Restored entries uploaded.")
      }
    } catch (error) {
      console.error("Restore failed", error)
      toast.error("Could not read that backup file.")
    } finally {
      void refresh()
    }
  }

  const unsyncedTotal = unsynced.matches.length + unsynced.pit.length

  return (
    <div className="container mx-auto max-w-4xl space-y-4 px-4 py-6">
      <Card>
        <CardHeader>
          <CardTitle>Device Backup</CardTitle>
          <CardDescription>
            Every entry saved on this device in the last {retentionHours} hours is kept here, whether or not it has
            synced. Works offline and without signing in again. Download it to hand data over manually.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{counts.match} match</Badge>
            <Badge variant="secondary">{counts.pit} pit</Badge>
            <Badge variant="secondary">{counts.drive} drive team</Badge>
            <Badge variant={unsyncedTotal || unsynced.queued ? "destructive" : "outline"}>
              {unsyncedTotal} not yet uploaded{unsynced.queued ? ` · ${unsynced.queued} in emergency queue` : ""}
            </Badge>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button onClick={handleJson} disabled={loading}>
              <FileJson className="mr-2 h-4 w-4" /> Download JSON
            </Button>
            <Button onClick={handleCsv} variant="outline" disabled={loading || exportRows.length === 0}>
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Download CSV
            </Button>
            {canShareFiles && (
              <Button onClick={() => void handleShare()} variant="outline" disabled={loading}>
                <Share2 className="mr-2 h-4 w-4" /> Share file
              </Button>
            )}
            <Button onClick={() => void handleCopy()} variant="outline" disabled={loading}>
              <Copy className="mr-2 h-4 w-4" /> Copy JSON
            </Button>
          </div>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={allCopies} onChange={(event) => setAllCopies(event.target.checked)} />
            Include every saved copy (not just the latest version of each entry)
          </label>

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Restore a backup file
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                event.target.value = ""
                if (file) void handleRestore(file)
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Saved on this device</CardTitle>
          <CardDescription>Newest first. Older than {retentionHours} h is removed automatically.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : records.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing saved on this device in the last {retentionHours} hours.</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {latestPerEntry(records).slice(0, 200).map((row) => (
                <li key={`${row.kind}:${row.entryId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <Badge variant="outline" className="capitalize">{row.kind}</Badge>
                  <span className="font-medium">
                    {row.teamNumber ? `Team ${row.teamNumber}` : "No team"}
                    {row.matchNumber ? ` · Match ${row.matchNumber}` : ""}
                  </span>
                  <span className="text-muted-foreground">{row.scoutName || ""}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{formatTime(row.savedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {isLead && <ServerSnapshots />}

      <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
        <Download className="h-3 w-3" /> On iPhone, Download opens a preview: use the share icon there to save to Files.
      </p>
    </div>
  )
}

export default LocalBackupPage
