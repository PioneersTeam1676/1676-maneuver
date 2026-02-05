import { useState, useEffect, useMemo } from "react";
import { db, loadAllPitScoutingEntries, loadAllScoutingEntries, type ScoutingEntryDB } from "@/lib/dexieDB";
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
import { Trash2, Edit, Search, Filter, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

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
  const [searchTeam, setSearchTeam] = useState("");
  const [searchMatch, setSearchMatch] = useState("");
  const [filterScout, setFilterScout] = useState<string>("all");
  const [filterAlliance, setFilterAlliance] = useState<string>("all");
  const [filterEvent, setFilterEvent] = useState<string>("all");
  
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

  const loadData = async () => {
    setLoading(true);
    try {
      const allEntries = await db.scoutingData.toArray();
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
    return entries.filter((entry) => {
      if (searchTeam && !entry.teamNumber?.includes(searchTeam)) return false;
      if (searchMatch && !entry.matchNumber?.includes(searchMatch)) return false;
      if (filterScout !== "all" && entry.scoutName !== filterScout) return false;
      if (filterAlliance !== "all" && entry.alliance !== filterAlliance) return false;
      if (filterEvent !== "all" && entry.eventName !== filterEvent) return false;
      return true;
    });
  }, [entries, searchTeam, searchMatch, filterScout, filterAlliance, filterEvent]);

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
      await db.scoutingData.bulkDelete(deletingIds);
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
    setEditedData({ ...entry.data });
  };

  const saveEdit = async () => {
    if (!editingEntry) return;
    
    try {
      const updated: ScoutingEntryDB = {
        ...editingEntry,
        data: editedData,
        teamNumber: String(editedData.selectTeam || editingEntry.teamNumber || ''),
        matchNumber: String(editedData.matchNumber || editingEntry.matchNumber || ''),
        alliance: String(editedData.alliance || editingEntry.alliance || ''),
        scoutName: String(editedData.scoutName || editingEntry.scoutName || ''),
        eventName: String(editedData.eventName || editingEntry.eventName || ''),
      };
      
      await db.scoutingData.put(updated);
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
    setSearchTeam("");
    setSearchMatch("");
    setFilterScout("all");
    setFilterAlliance("all");
    setFilterEvent("all");
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

  const hasActiveFilters = searchTeam || searchMatch || filterScout !== "all" || filterAlliance !== "all" || filterEvent !== "all";

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

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
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
                    <TableHead className="w-20">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        Loading data...
                      </TableCell>
                    </TableRow>
                  ) : filteredEntries.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        No entries found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredEntries.map((entry) => (
                      <TableRow key={entry.id}>
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
                    ))
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
                  <Input
                    value={String(editedData.selectTeam || '')}
                    onChange={(e) => setEditedData({ ...editedData, selectTeam: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Match Number</Label>
                  <Input
                    value={String(editedData.matchNumber || '')}
                    onChange={(e) => setEditedData({ ...editedData, matchNumber: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Alliance</Label>
                  <Select
                    value={String(editedData.alliance || '')}
                    onValueChange={(value) => setEditedData({ ...editedData, alliance: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="red">Red</SelectItem>
                      <SelectItem value="blue">Blue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Scout Name</Label>
                  <Input
                    value={String(editedData.scoutName || '')}
                    onChange={(e) => setEditedData({ ...editedData, scoutName: e.target.value })}
                  />
                </div>
              </div>
              
              <div>
                <Label>Event Name</Label>
                <Input
                  value={String(editedData.eventName || '')}
                  onChange={(e) => setEditedData({ ...editedData, eventName: e.target.value })}
                />
              </div>
              
              <div className="border-t pt-4">
                <Label className="text-sm font-semibold">Raw Data (JSON)</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Advanced: Edit the raw JSON data directly
                </p>
                <textarea
                  className="w-full h-64 p-2 font-mono text-sm border rounded-md"
                  value={JSON.stringify(editedData, null, 2)}
                  onChange={(e) => {
                    try {
                      setEditedData(JSON.parse(e.target.value));
                    } catch {
                      // Invalid JSON, don't update
                    }
                  }}
                />
              </div>
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
