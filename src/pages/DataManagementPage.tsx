import { useCallback, useEffect, useMemo, useState } from "react";
import {
  deleteScoutingEntries,
  loadAllPitScoutingEntries,
  loadAllScoutingEntries,
  saveScoutingEntry,
  type ScoutingEntryDB,
} from "@/lib/dexieDB";
import { listForms } from "@/lib/formBuilderApi";
import { readScoutingSeason, writeScoutingSeason } from "@/lib/scoutingSeason";
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
import { AlertTriangle, Edit, Filter, Search, Trash2, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type SortOption = "matchAsc" | "matchDesc" | "timestampDesc" | "timestampAsc" | "teamAsc";
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
]);

const DataManagementPage = () => {
  const [entries, setEntries] = useState<ScoutingEntryDB[]>([]);
  const [loading, setLoading] = useState(true);
  const [seasonOptions, setSeasonOptions] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(() => readScoutingSeason() ?? "auto");
  const [syncingSeason, setSyncingSeason] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingEntry, setEditingEntry] = useState<ScoutingEntryDB | null>(null);
  const [editedData, setEditedData] = useState<Record<string, unknown>>({});
  
  // Filters
  const [searchAll, setSearchAll] = useState("");
  const [searchTeam, setSearchTeam] = useState("");
  const [searchMatch, setSearchMatch] = useState("");
  const [filterScout, setFilterScout] = useState<string>("all");
  const [filterAlliance, setFilterAlliance] = useState<string>("all");
  const [filterEvent, setFilterEvent] = useState<string>("all");
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);
  const [showIssuesOnly, setShowIssuesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>("matchAsc");
  
  // Unique values for filters
  const [scouts, setScouts] = useState<string[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  
  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);

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

  const normalizeSearchValue = (value: unknown) => String(value ?? "").trim().toLowerCase();

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
    if (!entry.teamNumber) flags.push("Missing team");
    if (!entry.matchNumber) flags.push("Missing match");
    if (!entry.scoutName) flags.push("Missing scout");
    if (!entry.eventName) flags.push("Missing event");
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

  const loadData = async () => {
    setLoading(true);
    try {
      const allEntries = await loadAllScoutingEntries();
      setEntries(allEntries);
      
      // Extract unique scouts and events
      const uniqueScouts = Array.from(new Set(allEntries.map(e => e.scoutName).filter(Boolean))) as string[];
      const uniqueEvents = Array.from(new Set(allEntries.map(e => e.eventName).filter(Boolean))) as string[];
      
      setScouts(uniqueScouts.sort());
      setEvents(uniqueEvents.sort());
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error("Failed to load scouting data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

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
      if (filterEvent !== "all" && entry.eventName !== filterEvent) return false;
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
    filterEvent,
    filterScout,
    getEntryFlags,
    searchAll,
    searchMatch,
    searchTeam,
    showDuplicatesOnly,
    showIssuesOnly,
    sortBy,
  ]);

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
    try {
      await deleteScoutingEntries(deletingIds);
      toast.success(`Deleted ${deletingIds.length} ${deletingIds.length === 1 ? 'entry' : 'entries'}`);
      setSelectedIds(new Set());
      await loadData();
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
      await loadData();
    } catch (error) {
      console.error("Failed to update entry:", error);
      toast.error("Failed to update entry");
    }
  };

  const clearFilters = () => {
    setSearchAll("");
    setSearchTeam("");
    setSearchMatch("");
    setFilterScout("all");
    setFilterAlliance("all");
    setFilterEvent("all");
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
      await loadData();
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
    filterEvent !== "all" ||
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

          {/* Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Data Season</CardTitle>
              <CardDescription>
                Load scouting data from a specific season database. This replaces the local cache and routes new saves to that season until you switch back to Auto.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 md:flex-row md:items-end">
              <div className="grid gap-2">
                <Label htmlFor="season-select">Season</Label>
                <Select value={selectedSeason} onValueChange={handleSeasonChange}>
                  <SelectTrigger id="season-select" className="w-[220px]">
                    <SelectValue placeholder="Select a season" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Auto (current season)</SelectItem>
                    {seasonOptions.map((year) => (
                      <SelectItem key={year} value={year}>
                        Season {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSeasonSync} disabled={syncingSeason}>
                {syncingSeason ? "Loading…" : "Load Season Data"}
              </Button>
              <span className="text-xs text-muted-foreground">
                Use this to restore previous seasons after switching forms, then return to Auto for current scouting.
              </span>
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
                  <Label htmlFor="filterEvent">Event</Label>
                  <Select value={filterEvent} onValueChange={setFilterEvent}>
                    <SelectTrigger id="filterEvent">
                      <SelectValue placeholder="All Events" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      {events.map((event) => (
                        <SelectItem key={event} value={event}>
                          {event}
                        </SelectItem>
                      ))}
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
                    filteredEntries.map((entry) => {
                      const flags = getEntryFlags(entry);
                      return (
                      <TableRow key={entry.id} className={flags.length > 0 ? "bg-yellow-50/40 dark:bg-yellow-950/10" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(entry.id)}
                            onCheckedChange={() => toggleSelect(entry.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{entry.teamNumber || "—"}</TableCell>
                        <TableCell>{entry.matchNumber || "—"}</TableCell>
                        <TableCell>
                          {entry.alliance ? (
                            <Badge variant={entry.alliance === "red" ? "destructive" : "default"}>
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
                    {events.map((event) => (
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
