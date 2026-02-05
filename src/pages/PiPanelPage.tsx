import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getAllScouts, getScout, updateScoutStats } from "@/lib/scoutGameUtils";
import { getScoutAchievements, addAchievementForScout, removeAchievementForScout } from "@/lib/achievementAdmin";
import { ACHIEVEMENT_DEFINITIONS } from "@/lib/achievementTypes";

export default function PiPanelPage() {
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scouts, setScouts] = useState<Array<{ name: string; pis: number; correctPredictions: number; totalPredictions: number; currentStreak: number; longestStreak: number }>>([]);
  const [query, setQuery] = useState("");
  const [selectedScout, setSelectedScout] = useState<string>("");
  const [statsForm, setStatsForm] = useState({ pis: 0, correctPredictions: 0, totalPredictions: 0, currentStreak: 0, longestStreak: 0 });
  const [achievements, setAchievements] = useState<{ unlocked: Array<{ id: string; name: string; unlockedAt: number }>; available: Array<{ id: string; name: string }>; } | null>(null);
  const [newAchievementId, setNewAchievementId] = useState<string>("");

  useEffect(() => {
    void (async () => {
      try {
        const list = await getAllScouts();
        setScouts(list);
      } catch (e) {
        console.error(e);
        toast.error("Failed to load scouts");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      if (!selectedScout) {
        setAchievements(null);
        return;
      }
      try {
        const s = await getScout(selectedScout);
        if (s) {
          setStatsForm({
            pis: s.pis ?? 0,
            correctPredictions: s.correctPredictions ?? 0,
            totalPredictions: s.totalPredictions ?? 0,
            currentStreak: s.currentStreak ?? 0,
            longestStreak: s.longestStreak ?? 0,
          });
        }
        const ach = await getScoutAchievements(selectedScout);
        setAchievements({
          unlocked: ach.unlocked.map((a: { id: string; name: string; unlockedAt: number }) => ({ id: a.id, name: a.name, unlockedAt: a.unlockedAt })),
          available: ach.available.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })),
        });
      } catch (e) {
        console.error(e);
        toast.error("Failed to load scout details");
      }
    })();
  }, [selectedScout]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scouts;
    return scouts.filter((s) => s.name.toLowerCase().includes(q));
  }, [query, scouts]);

  useEffect(() => {
    if (!isAdmin || !selectedScout) {
      return;
    }
    if (selectedScout) {
      // Scroll the edit section into view to make it obvious
      const el = document.getElementById('pi-panel-edit-section');
      if (el && 'scrollIntoView' in el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      toast.message(`Editing ${selectedScout}`);
    }
  }, [isAdmin, selectedScout]);

  if (!isAdmin) {
    return (
      <div className="container mx-auto max-w-3xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>Admin access required</CardTitle>
            <CardDescription>You need admin privileges to use the Pi Panel.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleEdit = (name: string) => {
    setSelectedScout(name);
  };

  const handleSaveStats = async () => {
    if (!selectedScout) return;
    try {
      setSaving(true);
      await updateScoutStats(
        selectedScout,
        statsForm.pis,
        statsForm.correctPredictions,
        statsForm.totalPredictions,
        statsForm.currentStreak,
        statsForm.longestStreak,
        0,
      );
      toast.success("Scout stats updated");
      // refresh list
      const list = await getAllScouts();
      setScouts(list);
    } catch (e) {
      console.error(e);
      toast.error("Failed to update stats");
    } finally {
      setSaving(false);
    }
  };

  const handleAddAchievement = async () => {
    if (!selectedScout || !newAchievementId) return;
    try {
      const def = ACHIEVEMENT_DEFINITIONS.find((a) => a.id === newAchievementId);
      await addAchievementForScout(selectedScout, newAchievementId, true);
      toast.success(`Added achievement${def ? `: ${def.name}` : ''}`);
      setNewAchievementId("");
      // refresh achievements
      const ach = await getScoutAchievements(selectedScout);
      setAchievements({
        unlocked: ach.unlocked.map((a: { id: string; name: string; unlockedAt: number }) => ({ id: a.id, name: a.name, unlockedAt: a.unlockedAt })),
        available: ach.available.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })),
      });
      // refresh stats (if Pi reward applied)
      const list = await getAllScouts();
      setScouts(list);
    } catch (e) {
      console.error(e);
      toast.error("Failed to add achievement");
    }
  };

  const handleRemoveAchievement = async (achievementId: string) => {
    if (!selectedScout) return;
    try {
      await removeAchievementForScout(selectedScout, achievementId);
      toast.success("Removed achievement");
      const ach = await getScoutAchievements(selectedScout);
      setAchievements({
        unlocked: ach.unlocked.map((a: { id: string; name: string; unlockedAt: number }) => ({ id: a.id, name: a.name, unlockedAt: a.unlockedAt })),
        available: ach.available.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })),
      });
    } catch (e) {
      console.error(e);
      toast.error("Failed to remove achievement");
    }
  };

  return (
    <div className="container mx-auto max-w-6xl space-y-6 py-10">
      <div>
        <h1 className="text-3xl font-bold">Pi Panel</h1>
        <p className="text-muted-foreground">Adjust Pis, prediction stats, and manage achievements for any scout.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scouts</CardTitle>
          <CardDescription>Search and select a scout to edit.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="max-w-md">
              <Label htmlFor="search">Search by name</Label>
              <Input id="search" placeholder="Type a name..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Pis</TableHead>
                    <TableHead className="text-right">Correct/Total</TableHead>
                    <TableHead className="text-right">Streaks</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell>
                    </TableRow>
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">No scouts found</TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((s) => (
                      <TableRow key={s.name}>
                        <TableCell className="font-medium">{s.name}</TableCell>
                        <TableCell className="text-right">{s.pis}</TableCell>
                        <TableCell className="text-right">{s.correctPredictions}/{s.totalPredictions}</TableCell>
                        <TableCell className="text-right">{s.currentStreak} / {s.longestStreak}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" onClick={() => handleEdit(s.name)}>Edit</Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedScout && (
        <div id="pi-panel-edit-section" className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Edit Stats</CardTitle>
              <CardDescription>Directly set values and save.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="pis">Pis</Label>
                <Input id="pis" type="number" inputMode="numeric" value={statsForm.pis} onChange={(e) => setStatsForm((f) => ({ ...f, pis: Math.max(0, parseInt(e.target.value || '0', 10) || 0) }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="correct">Correct predictions</Label>
                <Input id="correct" type="number" inputMode="numeric" value={statsForm.correctPredictions} onChange={(e) => setStatsForm((f) => ({ ...f, correctPredictions: Math.max(0, parseInt(e.target.value || '0', 10) || 0) }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="total">Total predictions</Label>
                <Input id="total" type="number" inputMode="numeric" value={statsForm.totalPredictions} onChange={(e) => setStatsForm((f) => ({ ...f, totalPredictions: Math.max(0, parseInt(e.target.value || '0', 10) || 0) }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="currentStreak">Current streak</Label>
                <Input id="currentStreak" type="number" inputMode="numeric" value={statsForm.currentStreak} onChange={(e) => setStatsForm((f) => ({ ...f, currentStreak: Math.max(0, parseInt(e.target.value || '0', 10) || 0) }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="longestStreak">Longest streak</Label>
                <Input id="longestStreak" type="number" inputMode="numeric" value={statsForm.longestStreak} onChange={(e) => setStatsForm((f) => ({ ...f, longestStreak: Math.max(0, parseInt(e.target.value || '0', 10) || 0) }))} />
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={handleSaveStats} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground">Editing: <span className="font-medium">{selectedScout}</span></p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Achievements</CardTitle>
              <CardDescription>Add or remove achievements for this scout.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="ach">Add achievement</Label>
                  {achievements?.available?.length ? (
                    <Select value={newAchievementId} onValueChange={setNewAchievementId}>
                      <SelectTrigger id="ach">
                        <SelectValue placeholder="Choose an achievement" />
                      </SelectTrigger>
                      <SelectContent>
                        {achievements.available.map((a) => (
                          <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                      No available achievements to add
                    </div>
                  )}
                </div>
                <Button onClick={handleAddAchievement} disabled={!newAchievementId || !(achievements?.available?.length)}>Add</Button>
              </div>

              <div className="space-y-2">
                <Label>Unlocked</Label>
                {!achievements?.unlocked?.length ? (
                  <p className="text-sm text-muted-foreground">No achievements unlocked yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {achievements.unlocked.map((u) => (
                      <div key={u.id} className="inline-flex items-center gap-2 rounded-md border px-2 py-1">
                        <span className="text-sm">{u.name}</span>
                        <Badge variant="secondary" className="text-[10px]">{new Date(u.unlockedAt).toLocaleDateString()}</Badge>
                        <Button size="sm" variant="ghost" onClick={() => handleRemoveAchievement(u.id)}>Remove</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
