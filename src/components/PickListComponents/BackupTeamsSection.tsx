import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GenericSelector } from "@/components/ui/generic-selector";
import { TeamStatsButton } from "@/components/ui/team-stats-button";
import { Trash2 } from "lucide-react";
import type { BackupTeam } from "@/lib/allianceTypes";
import type { TeamStats } from "@/lib/pickListTypes";

interface BackupTeamsSectionProps {
  backups: BackupTeam[];
  availableTeams: TeamStats[];
  selectedTeams: string[];
  onUpdateBackups: (backups: BackupTeam[]) => void;
}

export const BackupTeamsSection = ({
  backups,
  availableTeams,
  selectedTeams,
  onUpdateBackups
}: BackupTeamsSectionProps) => {
  const [backupSelectValue, setBackupSelectValue] = useState("placeholder");

  const getAvailableTeamsForSelection = () => {
    return availableTeams.filter(team => !selectedTeams.includes(team.teamNumber));
  };

  const addToBackups = (teamNumber: string) => {
    if (teamNumber === "placeholder") return;
    
    const newBackup: BackupTeam = {
      teamNumber,
      rank: backups.length + 1
    };
    onUpdateBackups([...backups, newBackup]);
    setBackupSelectValue("placeholder");
  };

  const removeFromBackups = (teamNumber: string) => {
    const updatedBackups = backups.filter(b => b.teamNumber !== teamNumber);
    const renumberedBackups = updatedBackups.map((backup, index) => ({
      ...backup,
      rank: index + 1
    }));
    onUpdateBackups(renumberedBackups);
  };

  const getTeamStats = (teamNumber: string): TeamStats | undefined => {
    return availableTeams.find(t => t.teamNumber === teamNumber);
  };

  const getBackupTeamOptions = () => {
    const available = getAvailableTeamsForSelection();
    return ["placeholder", ...available.map(team => team.teamNumber)];
  };

  const getBackupTeamDisplayFormat = (value: string) => {
    if (value === "placeholder") return "Select a team...";
    return value;
  };

  const availableForSelection = getAvailableTeamsForSelection();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backup Teams</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Add to backups */}
          <div className="flex items-center gap-4">
            <GenericSelector
              label="Add Backup Team"
              value={backupSelectValue}
              availableOptions={getBackupTeamOptions()}
              onValueChange={(value) => {
                setBackupSelectValue(value);
                addToBackups(value);
              }}
              placeholder="Add backup team"
              displayFormat={getBackupTeamDisplayFormat}
              className="w-48"
            />
            <span className="text-sm text-muted-foreground">
              {availableForSelection.length} teams available
            </span>
          </div>

          {/* Backup teams list */}
          {backups.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {backups.map((backup) => {
                const teamStats = getTeamStats(backup.teamNumber);
                return (
                  <Card key={backup.teamNumber} className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">{backup.rank}</Badge>
                          <span className="font-medium">Team {backup.teamNumber}</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <TeamStatsButton 
                          teamNumber={backup.teamNumber}
                          teamStats={teamStats}
                          className="h-auto"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFromBackups(backup.teamNumber)}
                          className="text-red-400 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
          
          {backups.length === 0 && (
            <div className="text-center py-6 text-muted-foreground">
              No backup teams selected
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
