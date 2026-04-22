import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteScoutingEntries,
  loadAllPitScoutingEntries,
  loadAllScoutingEntries,
  loadScoutingEntriesByEvent,
  saveScoutingEntry,
  type ScoutingEntryDB,
} from "@/lib/dexieDB";
import { listForms } from "@/lib/formBuilderApi";
import { readScoutingSeason, writeScoutingSeason } from "@/lib/scoutingSeason";
import {
  STORAGE_EVENT_NAME_KEY,
  STORAGE_EVENTS_KEY,
  syncEventSettings,
} from "@/lib/eventSettingsClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, ClipboardCheck, Edit, Filter, Search, Trash2, X } from "lucide-react";
import { fetchRemoteSchedule } from "@/lib/scheduleApi";
import { fetchQualificationSchedule, resolveTbaApiKey } from "@/lib/tbaUtils";
import type { ParsedMatch } from "@/types/schedule";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type SortOption = "matchAsc" | "matchDesc" | "timestampDesc" | "timestampAsc" | "teamAsc";

interface MissingMatch {
  matchNumber: string;
  matchNumNormalized: string;
  position: string;
  alliance: "Red" | "Blue";
  slotIndex: number;
  teamNumber: string;
  assignedScout: string;
}

const normalizeMatchNum = (v: string) => v.replace(/\D/g, "");
const RESERVED_EDIT_KEYS = new Set([
  "selectTeam",
  "teamNumber",
  "Team Number",
  "matchNumber",
  "Match Number",
  "alliance",
  "Alliance",
  "scoutTeam",
  "Scout Team",
  "scoutName",
  "Scout Name",
  "eventName",
  "Event",
  "playerStation",
  "teamPosition",
  "stationNumber",
  "alliancePositionLabel",
]);

const normalizeText = (value: unknown) => String(value ?? "").trim();

const hasText = (value: unknown) => normalizeText(value).length > 0;

const extractStationContext = (entry: ScoutingEntryDB) => {
  const data = entry.data ?? {};
  const stationCandidates = [
    data.playerStation,
    data.alliancePositionLabel,
    data.scoutTeam,
    data.station,
    data.driverStation,
    data.alliance,
    entry.alliance,
  ];

  const parseStationLabel = (value: unknown) => {
    const text = normalizeText(value).toLowerCase();
    if (!text) return null;
    const compact = text.replace(/alliance/g, "").replace(/[^a-z0-9]/g, "");
    const match = compact.match(/^(red|blue)([123])$/);
    if (match) {
      return {
        alliance: match[1] === "red" ? "Red" : "Blue",
        slotNumber: match[2],
      };
    }
    if (compact === "red" || compact === "blue") {
      return {
        alliance: compact === "red" ? "Red" : "Blue",
        slotNumber: "",
      };
    }
    return null;
  };

  for (const candidate of stationCandidates) {
    const parsed = parseStationLabel(candidate);
    if (parsed) {
      return {
        ...parsed,
        label: parsed.slotNumber ? `${parsed.alliance} ${parsed.slotNumber}` : parsed.alliance,
      };
    }
  }

  const positionCandidates = [
    data.teamPosition,
    data.stationNumber,
    data.slotIndex,
    data.teamSlot,
  ];
  const slotNumber = positionCandidates
    .map((candidate) => {
      const numeric = Number(candidate);
      if (!Number.isFinite(numeric)) return "";
      if (numeric >= 1 && numeric <= 3) return String(numeric);
      if (numeric >= 0 && numeric <= 2) return String(numeric + 1);
      return "";
    })
    .find(Boolean) || "";

  const allianceText = normalizeText(data.alliance || data.scoutTeam || entry.alliance).toLowerCase();
  const alliance =
    allianceText.includes("red") ? "Red" :
    allianceText.includes("blue") ? "Blue" :
    "";

  if (!alliance) {
    return { alliance: "", slotNumber: "", label: "" };
  }

  return {
    alliance,
    slotNumber,
    label: slotNumber ? `${alliance} ${slotNumber}` : alliance,
  };
};

const getIssueDetails = (entry: ScoutingEntryDB, duplicateEntryIds: Set<string>) => {
  const details: string[] = [];
  const teamLabel = normalizeText(entry.teamNumber) || "Unknown team";
  const matchLabel = normalizeText(entry.matchNumber);
  const station = extractStationContext(entry);
  const stationLabel = station.label ? ` at ${station.label}` : "";

  if (duplicateEntryIds.has(entry.id)) {
    const duplicateMatchLabel = matchLabel ? `match ${matchLabel}` : "unknown match";
    details.push(`Duplicate entry for Team ${teamLabel} in ${duplicateMatchLabel}${stationLabel}.`);
  }
  if (!hasText(entry.teamNumber)) {
    details.push(`Missing team number${matchLabel ? ` for match ${matchLabel}` : ""}${stationLabel}.`);
  }
  if (!hasText(entry.matchNumber)) {
    details.push(`Missing match number for Team ${teamLabel}${stationLabel}.`);
  }
  if (!hasText(entry.scoutName)) {
    details.push(`Missing scout name for Team ${teamLabel}${matchLabel ? ` in match ${matchLabel}` : ""}${stationLabel}.`);
  }
  if (!hasText(entry.eventName)) {
    details.push(`Missing event for Team ${teamLabel}${matchLabel ? ` in match ${matchLabel}` : ""}${stationLabel}.`);
  }

  return details;
};

const DataManagementPage = () => {
  const [entries, setEntries] = useState<ScoutingEntryDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [seasonOptions, setSeasonOptions] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(() => readScoutingSeason() ?? "auto");
  const [syncingSeason, setSyncingSeason] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingEntry, setEditingEntry] = useState<ScoutingEntryDB | null>(null);
  const [editedData, setEditedData] = useState<Record<string, unknown>>({});
  
  // Event-scoped loading
  const [loadingEvent, setLoadingEvent] = useState<string>(() => {
    try { return localStorage.getItem(STORAGE_EVENT_NAME_KEY) ?? ""; } catch { return ""; }
  });
  const [availableEvents, setAvailableEvents] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_EVENTS_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch { return []; }
  });

  // Filters
  const [searchAll, setSearchAll] = useState("");
  const [searchTeam, setSearchTeam] = useState("");
  const [searchMatch, setSearchMatch] = useState("");
  const [filterScout, setFilterScout] = useState<string>("all");
  const [filterAlliance, setFilterAlliance] = useState<string>("all");
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("matchAsc");

  // Unique values for filters
  const [scouts, setScouts] = useState<string[]>([]);
  
  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);

  // Missing matches audit
  const [missingMatches, setMissingMatches] = useState<MissingMatch[]>([]);
  const [missingMatchesLoading, setMissingMatchesLoading] = useState(false);
  const [missingMatchesChecked, setMissingMatchesChecked] = useState(false);
  const [missingEventKey, setMissingEventKey] = useState("");

  // Duplicate grouping
  const [groupDuplicates, setGroupDuplicates] = useState(false);

  const formatEntryDate = (timestamp: number) => {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "—";
    const parts = new Intl.DateTimeFormat("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    }).formatToParts(date);
    const month = parts.find((part) => part.type === "month")?.value ?? "";
    const day = parts.find((part) => part.type === "day")?.value ?? "";
    const year = parts.find((part) => part.type === "year")?.value ?? "";
    if (!month || !day || !year) return date.toLocaleDateString("en-US").replace(/\//g, "-");
    return `${month}-${day}-${year}`;
  };

  const parseMatchNumber = (value?: string) => {
    if (!value) return Number.MAX_SAFE_INTEGER;
    const parsed = Number.parseInt(value.replace(/[^\d]/g, ""), 10);
    return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
  };

  const normalizeSearchValue = (value: unknown) => normalizeText(value).toLowerCase();

  const buildDuplicateKey = useCallback((entry: ScoutingEntryDB) => {
    const eventName = normalizeSearchValue(entry.eventName);
    const matchNumber = normalizeSearchValue(entry.matchNumber);
    const teamNumber = normalizeSearchValue(entry.teamNumber);
    const alliance = normalizeSearchValue(entry.alliance);

    if (!eventName || !matchNumber || !teamNumber) {
      return null;
    }

    return [eventName, matchNumber, teamNumber, alliance].join("::");
  }, []);

  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, string[]>();
    entries.forEach((entry) => {
      const key = buildDuplicateKey(entry);
      if (!key) return;
      const existing = groups.get(key) ?? [];
      existing.push(entry.id);
      groups.set(key, existing);
    });
    return groups;
  }, [buildDuplicateKey, entries]);

  const duplicateEntryIds = useMemo(() => {
    const ids = new Set<string>();
    duplicateGroups.forEach((group) => {
      if (group.length < 2) return;
      group.forEach((id) => ids.add(id));
    });
    return ids;
  }, [duplicateGroups]);

  const duplicateGroupCount = useMemo(() => {
    let count = 0;
    duplicateGroups.forEach((group) => {
      if (group.length > 1) count += 1;
    });
    return count;
  }, [duplicateGroups]);

  const getEntryFlags = useCallback((entry: ScoutingEntryDB) => {
    const flags: string[] = [];
    if (duplicateEntryIds.has(entry.id)) flags.push("Duplicate");
    if (!hasText(entry.teamNumber)) flags.push("Missing team");
    if (!hasText(entry.matchNumber)) flags.push("Missing match");
    if (!hasText(entry.scoutName)) flags.push("Missing scout");
    if (!hasText(entry.eventName)) flags.push("Missing event");
    return flags;
  }, [duplicateEntryIds]);

  const issueEntryCount = useMemo(
    () => entries.filter((entry) => getEntryFlags(entry).length > 0).length,
    [entries, getEntryFlags]
  );

  const teamOptions = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.teamNumber).filter(Boolean) as string[])).sort((a, b) => Number(a) - Number(b)),
    [entries]
  );

  const matchOptions = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.matchNumber).filter(Boolean) as string[])).sort((a, b) => parseMatchNumber(a) - parseMatchNumber(b)),
    [entries]
  );

  const loadData = async (eventName: string) => {
    setLoading(true);
    try {
      const loaded = eventName
        ? await loadScoutingEntriesByEvent(eventName)
        : await loadAllScoutingEntries();
      setEntries(loaded);
      const uniqueScouts = Array.from(new Set(loaded.map(e => e.scoutName).filter(Boolean))) as string[];
      setScouts(uniqueScouts.sort());
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error("Failed to load scouting data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const settings = await syncEventSettings();
        setAvailableEvents(settings.events);
        setLoadingEvent(prev => prev || settings.currentEvent);
      } catch {
        // Use cached localStorage values
      }
    })();
  }, []);

  useEffect(() => {
    void loadData(loadingEvent);
  }, [loadingEvent]);

  useEffect(() => {
    const loadSeasons = async () => {
      try {
        const forms = await listForms();
        const years = Array.from(new Set(forms.map((form) => form.year).filter(Boolean)));
        years.sort((a, b) => b.localeCompare(a));
        setSeasonOptions(years);
      } catch (error) {
        console.warn("Failed to load season list", error);
      }
    };
    void loadSeasons();
  }, []);

  const filteredEntries = useMemo(() => {
    const filtered = entries.filter((entry) => {
      const searchableBlob = [
        entry.teamNumber,
        entry.matchNumber,
        entry.alliance,
        entry.scoutName,
        entry.eventName,
        entry.id,
        JSON.stringify(entry.data ?? {}),
      ].join(" ").toLowerCase();

      if (searchAll && !searchableBlob.includes(searchAll.toLowerCase())) return false;
      if (searchTeam && !entry.teamNumber?.includes(searchTeam)) return false;
      if (searchMatch && !entry.matchNumber?.includes(searchMatch)) return false;
      if (filterScout !== "all" && entry.scoutName !== filterScout) return false;
      if (filterAlliance !== "all" && entry.alliance !== filterAlliance) return false;
      if (showDuplicatesOnly && !duplicateEntryIds.has(entry.id)) return false;
      if (showIssuesOnly && getEntryFlags(entry).length === 0) return false;
      return true;
    });

    return [...filtered].sort((a, b) => {
      const matchA = parseMatchNumber(a.matchNumber);
      const matchB = parseMatchNumber(b.matchNumber);

      if (sortBy === "teamAsc") {
        return String(a.teamNumber || "").localeCompare(String(b.teamNumber || ""), undefined, { numeric: true, sensitivity: "base" });
      }

      if (sortBy === "timestampDesc") {
        return b.timestamp - a.timestamp;
      }

      if (sortBy === "timestampAsc") {
        return a.timestamp - b.timestamp;
      }

      if (matchA !== matchB) {
        return sortBy === "matchAsc" ? matchA - matchB : matchB - matchA;
      }

      return sortBy === "matchAsc" ? a.timestamp - b.timestamp : b.timestamp - a.timestamp;
    });
  }, [
    duplicateEntryIds,
    entries,
    filterAlliance,
    filterScout,
    getEntryFlags,
    searchAll,
    searchMatch,
    searchTeam,
    showDuplicatesOnly,
    showIssuesOnly,
    sortBy,
  ]);

  const displayEntries = useMemo(() => {
    if (!groupDuplicates) return filteredEntries;

    const groups = new Map<string, ScoutingEntryDB[]>();
    const singles: ScoutingEntryDB[] = [];

    for (const entry of filteredEntries) {
      if (duplicateEntryIds.has(entry.id)) {
        const key = buildDuplicateKey(entry) ?? entry.id;
        const group = groups.get(key) ?? [];
        group.push(entry);
        groups.set(key, group);
      } else {
        singles.push(entry);
      }
    }

    const sortedGroups = Array.from(groups.values()).sort(
      (a, b) => parseMatchNumber(a[0]?.matchNumber) - parseMatchNumber(b[0]?.matchNumber)
    );

    return [...sortedGroups.flat(), ...singles];
  }, [filteredEntries, groupDuplicates, duplicateEntryIds, buildDuplicateKey]);

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredEntries.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredEntries.map(e => e.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) {
      toast.error("No entries selected");
      return;
    }
    setDeletingIds(Array.from(selectedIds));
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    const deleteTargets = deletingIds.map((id) => {
      const entry = entries.find((item) => String(item.id) === String(id));
      return entry ? { id, eventName: entry.eventName } : String(id);
    });

    try {
      await deleteScoutingEntries(deleteTargets);
      toast.success(`Deleted ${deletingIds.length} ${deletingIds.length === 1 ? 'entry' : 'entries'}`);
      setSelectedIds(new Set());
      await loadData(loadingEvent);
    } catch (error) {
      console.error("Failed to delete entries:", error);
      toast.error("Failed to delete entries");
    } finally {
      setShowDeleteConfirm(false);
      setDeletingIds([]);
    }
  };

  const handleEdit = (entry: ScoutingEntryDB) => {
    setEditingEntry(entry);
    setEditedData({
      ...entry.data,
      selectTeam: String(
        entry.data.selectTeam ??
        entry.data.teamNumber ??
        entry.data["Team Number"] ??
        entry.teamNumber ??
        ""
      ),
      teamNumber: String(
        entry.data.teamNumber ??
        entry.data.selectTeam ??
        entry.data["Team Number"] ??
        entry.teamNumber ??
        ""
      ),
      matchNumber: String(
        entry.data.matchNumber ??
        entry.data["Match Number"] ??
        entry.matchNumber ??
        ""
      ),
      alliance: String(
        entry.data.alliance ??
        entry.data.scoutTeam ??
        entry.data["Scout Team"] ??
        entry.data.Alliance ??
        entry.alliance ??
        ""
      ),
      scoutTeam: String(
        entry.data.scoutTeam ??
        entry.data.alliance ??
        entry.data["Scout Team"] ??
        entry.data.Alliance ??
        entry.alliance ??
        ""
      ),
      scoutName: String(
        entry.data.scoutName ??
        entry.data["Scout Name"] ??
        entry.scoutName ??
        ""
      ),
      eventName: String(
        entry.data.eventName ??
        entry.data.Event ??
        entry.eventName ??
        ""
      ),
    });
  };

  const setCanonicalField = (
    key: "teamNumber" | "matchNumber" | "alliance" | "scoutName" | "eventName",
    value: string
  ) => {
    setEditedData((prev) => {
      const next = { ...prev };
      if (key === "teamNumber") {
        next.selectTeam = value;
        next.teamNumber = value;
        next["Team Number"] = value;
      } else if (key === "matchNumber") {
        next.matchNumber = value;
        next["Match Number"] = value;
      } else if (key === "alliance") {
        next.alliance = value;
        next.scoutTeam = value;
        next["Scout Team"] = value;
        next.Alliance = value;
      } else if (key === "scoutName") {
        next.scoutName = value;
        next["Scout Name"] = value;
      } else if (key === "eventName") {
        next.eventName = value;
        next.Event = value;
      }
      return next;
    });
  };

  const extraEditableFields = useMemo(() => {
    return Object.entries(editedData)
      .filter(([key, value]) => {
        if (RESERVED_EDIT_KEYS.has(key)) return false;
        return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || Array.isArray(value);
      })
      .sort(([a], [b]) => a.localeCompare(b));
  }, [editedData]);

  const saveEdit = async () => {
    if (!editingEntry) return;
    
    try {
      await saveScoutingEntry({
        id: editingEntry.id,
        data: editedData,
        timestamp: editingEntry.timestamp,
      });
      toast.success("Entry updated successfully");
      setEditingEntry(null);
      setEditedData({});
      await loadData(loadingEvent);
    } catch (error) {
      console.error("Failed to update entry:", error);
      toast.error("Failed to update entry");
    }
  };

  const handleFindMissingMatches = async () => {
    setMissingMatchesLoading(true);
    setMissingMatchesChecked(false);
    try {
      const schedule = await fetchRemoteSchedule(missingEventKey || undefined);
      if (!schedule || !schedule.assignments.length) {
        toast.error("No schedule found — publish a schedule first");
        return;
      }

      const aliases = schedule.aliases ?? {};
      const effectiveEventKey = missingEventKey.trim() || schedule.eventKey || "";

      type MatchTeamData = { red: string[]; blue: string[] };
      const matchTeamMap = new Map<string, MatchTeamData>();
      let usedTba = false;

      if (effectiveEventKey && resolveTbaApiKey()) {
        try {
          const tbaSchedule = await fetchQualificationSchedule(effectiveEventKey);
          for (const m of tbaSchedule) {
            matchTeamMap.set(String(m.matchNum), { red: m.redAlliance, blue: m.blueAlliance });
          }
          usedTba = tbaSchedule.length > 0;
        } catch (err) {
          console.warn("TBA fetch failed, falling back to schedule data", err);
        }
      }

      if (!usedTba) {
        const fallbackMap = new Map<string, ParsedMatch>();
        for (const m of schedule.matches) {
          fallbackMap.set(normalizeMatchNum(m.matchNumber), m);
        }
        for (const [k, m] of fallbackMap) {
          matchTeamMap.set(k, { red: m.red, blue: m.blue });
        }
      }

      const existingKeys = new Set<string>();
      let latestMatchNum = 0;
      for (const entry of entries) {
        if (!entry.matchNumber || !entry.teamNumber) continue;
        existingKeys.add(`${normalizeMatchNum(entry.matchNumber)}::${entry.teamNumber}`);
        const n = parseInt(normalizeMatchNum(entry.matchNumber), 10);
        if (Number.isFinite(n) && n > latestMatchNum) latestMatchNum = n;
      }

      const missing: MissingMatch[] = [];
      for (const assignment of schedule.assignments) {
        const matchNorm = normalizeMatchNum(assignment.matchNumber);
        if (latestMatchNum > 0 && parseInt(matchNorm, 10) > latestMatchNum) continue;
        const teamData = matchTeamMap.get(matchNorm);

        for (const pos of (["red-1", "red-2", "red-3", "blue-1", "blue-2", "blue-3"] as const)) {
          const scoutEmail = assignment.positions[pos];
          if (!scoutEmail || scoutEmail === "Unassigned") continue;

          const [allianceStr, slotStr] = pos.split("-");
          const slotIndex = parseInt(slotStr, 10) - 1;

          const teamNumber = teamData
            ? (allianceStr === "red" ? teamData.red[slotIndex] : teamData.blue[slotIndex]) ?? ""
            : "";

          if (!teamNumber) continue;

          if (!existingKeys.has(`${matchNorm}::${teamNumber}`)) {
            missing.push({
              matchNumber: assignment.matchNumber,
              matchNumNormalized: matchNorm,
              position: pos,
              alliance: allianceStr === "red" ? "Red" : "Blue",
              slotIndex: slotIndex + 1,
              teamNumber,
              assignedScout: aliases[scoutEmail] ?? scoutEmail,
            });
          }
        }
      }

      missing.sort((a, b) => {
        const mDiff = parseInt(a.matchNumNormalized, 10) - parseInt(b.matchNumNormalized, 10);
        return mDiff !== 0 ? mDiff : a.position.localeCompare(b.position);
      });

      setMissingMatches(missing);
      setMissingMatchesChecked(true);

      const source = usedTba ? "TBA" : "schedule data";
      if (missing.length === 0) {
        toast.success(`All assigned matches have entries (checked via ${source})`);
      } else {
        toast.warning(`${missing.length} missing ${missing.length === 1 ? "entry" : "entries"} (via ${source})`);
      }
    } catch (error) {
      console.error("Failed to find missing matches:", error);
      toast.error("Failed to check schedule");
    } finally {
      setMissingMatchesLoading(false);
    }
  };

  const clearFilters = () => {
    setSearchAll("");
    setSearchTeam("");
    setSearchMatch("");
    setFilterScout("all");
    setFilterAlliance("all");
    setShowDuplicatesOnly(false);
    setShowIssuesOnly(false);
    setSortBy("matchAsc");
  };

  const handleSeasonChange = (value: string) => {
    setSelectedSeason(value);
    writeScoutingSeason(value === "auto" ? null : value);
  };

  const handleSeasonSync = async () => {
    setSyncingSeason(true);
    try {
      await loadAllScoutingEntries();
      await loadAllPitScoutingEntries();
      setSelectedIds(new Set());
      await loadData(loadingEvent);
      const label = selectedSeason === "auto" ? "current season" : `season ${selectedSeason}`;
      toast.success(`Loaded scouting data for ${label}`);
    } catch (error) {
      console.error("Failed to sync season data:", error);
      toast.error("Failed to load season data from the server");
    } finally {
      setSyncingSeason(false);
    }
  };

  const hasActiveFilters =
    searchAll ||
    searchTeam ||
    searchMatch ||
    filterScout !== "all" ||
    filterAlliance !== "all" ||
    showDuplicatesOnly ||
    showIssuesOnly ||
    sortBy !== "matchAsc";

  return (
    <div className="min-h-screen w-full px-4 pt-6 pb-6">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex flex-col gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Data Management</h1>
            <p className="text-muted-foreground">
              Advanced data filtering, editing, and cleanup tools
            </p>
          </div>

          {/* Event + Season selector */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Data Scope</CardTitle>
              <CardDescription>
                Select which event to load data for. Only that event's entries are fetched from the server.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="event-select">Event</Label>
                  <Select
                    value={loadingEvent || "__all__"}
                    onValueChange={(val) => setLoadingEvent(val === "__all__" ? "" : val)}
                  >
                    <SelectTrigger id="event-select" className="w-[260px]">
                      <SelectValue placeholder="Select an event" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All events (slow)</SelectItem>
                      {availableEvents.map((ev) => (
                        <SelectItem key={ev} value={ev}>{ev}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {loadingEvent && (
                  <Badge variant="secondary" className="h-fit">{loadingEvent}</Badge>
                )}
              </div>

              <div className="border-t pt-4 flex flex-col sm:flex-row sm:items-end gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="season-select">Season database</Label>
                  <Select value={selectedSeason} onValueChange={handleSeasonChange}>
                    <SelectTrigger id="season-select" className="w-[220px]">
                      <SelectValue placeholder="Select a season" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (current season)</SelectItem>
                      {seasonOptions.map((year) => (
                        <SelectItem key={year} value={year}>Season {year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSeasonSync} disabled={syncingSeason}>
                  {syncingSeason ? "Loading…" : "Load Season Data"}
                </Button>
                <span className="text-xs text-muted-foreground">
                  Use to restore previous seasons, then return to Auto for current scouting.
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Entries</CardDescription>
                <CardTitle className="text-3xl">{entries.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Filtered Results</CardDescription>
                <CardTitle className="text-3xl">{filteredEntries.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Selected</CardDescription>
                <CardTitle className="text-3xl">{selectedIds.size}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Scouts</CardDescription>
                <CardTitle className="text-3xl">{scouts.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Duplicate Groups</CardDescription>
                <CardTitle className="text-3xl">{duplicateGroupCount}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Entries With Issues</CardDescription>
                <CardTitle className="text-3xl">{issueEntryCount}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Quick Search</CardDescription>
                <CardTitle className="text-base font-medium">
                  Search team, match, scout, event, ID, or raw JSON fields
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Missing Matches Audit */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4" />
                <CardTitle className="text-lg">Missing Matches Audit</CardTitle>
              </div>
              <CardDescription>
                Compare the published schedule against submitted scouting entries to find gaps.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="missingEventKey">Event Key (optional)</Label>
                  <Input
                    id="missingEventKey"
                    placeholder="e.g. 2025txdal — leave blank for active event"
                    value={missingEventKey}
                    onChange={(e) => setMissingEventKey(e.target.value)}
                    className="w-72"
                  />
                </div>
                <Button onClick={handleFindMissingMatches} disabled={missingMatchesLoading}>
                  {missingMatchesLoading ? "Checking…" : "Find Missing Matches"}
                </Button>
                {missingMatchesChecked && (
                  <Badge variant={missingMatches.length === 0 ? "secondary" : "outline"} className={missingMatches.length > 0 ? "border-yellow-400 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" : ""}>
                    {missingMatches.length === 0 ? "All entries present" : `${missingMatches.length} missing`}
                  </Badge>
                )}
              </div>

              {missingMatchesChecked && missingMatches.length > 0 && (
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Match</TableHead>
                        <TableHead>Team</TableHead>
                        <TableHead>Position</TableHead>
                        <TableHead>Assigned Scout</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {missingMatches.map((m) => (
                        <TableRow key={`${m.matchNumNormalized}-${m.position}`} className="bg-yellow-50/40 dark:bg-yellow-950/10">
                          <TableCell className="font-medium">{m.matchNumNormalized}</TableCell>
                          <TableCell>{m.teamNumber}</TableCell>
                          <TableCell>
                            <Badge variant={m.alliance === "Red" ? "destructive" : "default"}>
                              {m.alliance} {m.slotIndex}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{m.assignedScout}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {missingMatchesChecked && missingMatches.length === 0 && (
                <p className="text-sm text-muted-foreground">Every scheduled position has a corresponding scouting entry.</p>
              )}
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <CardTitle className="text-lg">Filters</CardTitle>
                </div>
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    <X className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
                <div className="lg:col-span-2">
                  <Label htmlFor="searchAll">Quick Search</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="searchAll"
                      placeholder="Scout, team, match, event, ID, note..."
                      value={searchAll}
                      onChange={(e) => setSearchAll(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="searchTeam">Team Number</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="searchTeam"
                      placeholder="Search..."
                      value={searchTeam}
                      onChange={(e) => setSearchTeam(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="searchMatch">Match Number</Label>
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="searchMatch"
                      placeholder="Search..."
                      value={searchMatch}
                      onChange={(e) => setSearchMatch(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="filterScout">Scout</Label>
                  <Select value={filterScout} onValueChange={setFilterScout}>
                    <SelectTrigger id="filterScout">
                      <SelectValue placeholder="All Scouts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Scouts</SelectItem>
                      {scouts.map((scout) => (
                        <SelectItem key={scout} value={scout}>
                          {scout}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="filterAlliance">Alliance</Label>
                  <Select value={filterAlliance} onValueChange={setFilterAlliance}>
                    <SelectTrigger id="filterAlliance">
                      <SelectValue placeholder="All Alliances" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Alliances</SelectItem>
                      <SelectItem value="red">Red</SelectItem>
                      <SelectItem value="blue">Blue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="sortEntries">Sort</Label>
                  <Select value={sortBy} onValueChange={(value: SortOption) => setSortBy(value)}>
                    <SelectTrigger id="sortEntries">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="matchAsc">Match Number: Low to High</SelectItem>
                      <SelectItem value="matchDesc">Match Number: High to Low</SelectItem>
                      <SelectItem value="timestampDesc">Newest First</SelectItem>
                      <SelectItem value="timestampAsc">Oldest First</SelectItem>
                      <SelectItem value="teamAsc">Team Number</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-4 rounded-md border bg-muted/20 px-3 py-3">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={showDuplicatesOnly}
                    onCheckedChange={(checked) => setShowDuplicatesOnly(Boolean(checked))}
                  />
                  Show duplicates only
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={showIssuesOnly}
                    onCheckedChange={(checked) => setShowIssuesOnly(Boolean(checked))}
                  />
                  Show issues only
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={groupDuplicates}
                    onCheckedChange={(checked) => setGroupDuplicates(Boolean(checked))}
                  />
                  Group duplicates together
                </label>
                <div className="text-sm text-muted-foreground">
                  Duplicates are matched by event, match, team, and alliance.
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex justify-between items-center">
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                disabled={selectedIds.size === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Selected ({selectedIds.size})
              </Button>
            </div>
            <Badge variant="secondary">
              Showing {filteredEntries.length} of {entries.length} entries
            </Badge>
          </div>
        </div>

        {/* Data Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedIds.size === filteredEntries.length && filteredEntries.length > 0}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead>Team</TableHead>
                    <TableHead>Match</TableHead>
                    <TableHead>Alliance</TableHead>
                    <TableHead>Scout</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Flags</TableHead>
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        Loading data...
                      </TableCell>
                    </TableRow>
                  ) : filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8">
                        No entries found
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayEntries.map((entry, idx) => {
                      const flags = getEntryFlags(entry);
                      const issueDetails = getIssueDetails(entry, duplicateEntryIds);
                      const station = extractStationContext(entry);

                      const isDup = duplicateEntryIds.has(entry.id);
                      const currentDupKey = isDup ? buildDuplicateKey(entry) : null;
                      const prevEntry = displayEntries[idx - 1];
                      const prevIsDup = prevEntry ? duplicateEntryIds.has(prevEntry.id) : false;
                      const prevDupKey = prevEntry && prevIsDup ? buildDuplicateKey(prevEntry) : null;
                      const showSeparator = groupDuplicates && isDup && idx > 0 && prevIsDup && currentDupKey !== prevDupKey;

                      return (
                      <Fragment key={entry.id}>
                        {showSeparator && (
                          <TableRow>
                            <TableCell colSpan={9} className="h-0.5 p-0 bg-border" />
                          </TableRow>
                        )}
                        <TableRow className={flags.length > 0 ? "bg-yellow-50/40 dark:bg-yellow-950/10" : undefined}>
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(entry.id)}
                              onCheckedChange={() => toggleSelect(entry.id)}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{entry.teamNumber || "—"}</TableCell>
                          <TableCell>{entry.matchNumber || "—"}</TableCell>
                          <TableCell>
                            {station.label ? (
                              <Badge variant={station.alliance === "Red" ? "destructive" : "default"}>
                                {station.label}
                              </Badge>
                            ) : entry.alliance ? (
                              <Badge variant={String(entry.alliance).toLowerCase().includes("red") ? "destructive" : "default"}>
                                {entry.alliance}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>{entry.scoutName || "—"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {entry.eventName || "—"}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatEntryDate(entry.timestamp)}
                          </TableCell>
                          <TableCell>
                            {flags.length > 0 ? (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-1">
                                  {flags.map((flag) => (
                                    <Badge
                                      key={`${entry.id}-${flag}`}
                                      variant="outline"
                                      className="border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-300"
                                    >
                                      {flag === "Duplicate" && <AlertTriangle className="mr-1 h-3 w-3" />}
                                      {flag}
                                    </Badge>
                                  ))}
                                </div>
                                {issueDetails.length > 0 ? (
                                  <div className="space-y-1 text-xs text-muted-foreground">
                                    {issueDetails.map((detail) => (
                                      <div key={`${entry.id}-${detail}`}>{detail}</div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleEdit(entry)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => {
                                  setDeletingIds([entry.id]);
                                  setShowDeleteConfirm(true);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      </Fragment>
                    )})
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingEntry} onOpenChange={(open) => !open && setEditingEntry(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Entry</DialogTitle>
            <DialogDescription>
              Make changes to the scouting entry data
            </DialogDescription>
          </DialogHeader>
          
          {editingEntry && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Team Number</Label>
                  <Select
                    value={String(editedData.selectTeam || editedData.teamNumber || "")}
                    onValueChange={(value) => setCanonicalField("teamNumber", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select team number" />
                    </SelectTrigger>
                    <SelectContent>
                      {teamOptions.map((team) => (
                        <SelectItem key={team} value={team}>
                          {team}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Match Number</Label>
                  <Select
                    value={String(editedData.matchNumber || "")}
                    onValueChange={(value) => setCanonicalField("matchNumber", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select match number" />
                    </SelectTrigger>
                    <SelectContent>
                      {matchOptions.map((match) => (
                        <SelectItem key={match} value={match}>
                          {match}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Alliance</Label>
                  <Select
                    value={String(editedData.alliance || editedData.scoutTeam || "")}
                    onValueChange={(value) => setCanonicalField("alliance", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select alliance" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="red">Red</SelectItem>
                      <SelectItem value="blue">Blue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Scout Name</Label>
                  <Select
                    value={String(editedData.scoutName || "")}
                    onValueChange={(value) => setCanonicalField("scoutName", value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select scout" />
                    </SelectTrigger>
                    <SelectContent>
                      {scouts.map((scout) => (
                        <SelectItem key={scout} value={scout}>
                          {scout}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label>Event Name</Label>
                <Select
                  value={String(editedData.eventName || "")}
                  onValueChange={(value) => setCanonicalField("eventName", value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select event" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableEvents.map((event) => (
                      <SelectItem key={event} value={event}>
                        {event}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {extraEditableFields.length > 0 && (
                <div className="border-t pt-4 space-y-3">
                  <div>
                    <Label className="text-sm font-semibold">Other Fields</Label>
                    <p className="text-xs text-muted-foreground">
                      Extra top-level fields from this entry are editable here without raw JSON.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {extraEditableFields.map(([key, value]) => (
                      <div key={key}>
                        <Label>{key}</Label>
                        {typeof value === "boolean" ? (
                          <Select
                            value={value ? "true" : "false"}
                            onValueChange={(nextValue) =>
                              setEditedData((prev) => ({ ...prev, [key]: nextValue === "true" }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="true">True</SelectItem>
                              <SelectItem value="false">False</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
                            onChange={(e) =>
                              setEditedData((prev) => ({
                                ...prev,
                                [key]: Array.isArray(value)
                                  ? e.target.value.split(",").map((item) => item.trim()).filter(Boolean)
                                  : typeof value === "number"
                                    ? Number(e.target.value)
                                    : e.target.value,
                              }))
                            }
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingEntry(null)}>
              Cancel
            </Button>
            <Button onClick={saveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {deletingIds.length} {deletingIds.length === 1 ? 'entry' : 'entries'}?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DataManagementPage;
