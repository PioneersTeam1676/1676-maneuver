import { Button } from "@/components/ui/button";
import { GenericSelector } from "@/components/ui/generic-selector";
import { Trash2, X } from "lucide-react";
import type { Alliance } from "@/lib/allianceTypes";
import type { TeamStats } from "@/lib/pickListTypes";

interface AllianceRowProps {
  alliance: Alliance;
  availableTeams: TeamStats[];
  selectedTeams: string[];
  onUpdateTeam: (allianceId: number, position: 'captain' | 'pick1' | 'pick2' | 'pick3', teamNumber: string) => void;
  onRemoveTeam: (allianceId: number, position: 'captain' | 'pick1' | 'pick2' | 'pick3') => void;
  onRemoveAlliance: (allianceId: number) => void;
}

export const AllianceRow = ({
  alliance,
  availableTeams,
  selectedTeams,
  onUpdateTeam,
  onRemoveTeam,
  onRemoveAlliance
}: AllianceRowProps) => {
  const getTeamOptions = (currentTeam?: string) => {
    const available = availableTeams.filter(team => !selectedTeams.includes(team.teamNumber));
    const options = ["none", ...available.map(team => team.teamNumber)];
    if (currentTeam && !options.includes(currentTeam)) {
      options.push(currentTeam);
    }
    return options;
  };

  const getTeamDisplayFormat = (value: string) => {
    if (value === "none") return "None";
    return value;
  };

  return (
    <tr className="border-b hover:bg-muted/50">
      <td className="p-3">
        <span className="font-medium text-lg">{alliance.allianceNumber}</span>
      </td>
      {(['captain', 'pick1', 'pick2', 'pick3'] as const).map((position) => {
        const teamNumber = alliance[position];
        
        return (
          <td key={position} className="p-3">
            <div className="flex items-center gap-2">
              <GenericSelector
                label={`Alliance ${alliance.allianceNumber} ${position}`}
                value={teamNumber || "none"}
                availableOptions={getTeamOptions(teamNumber)}
                onValueChange={(value) => onUpdateTeam(alliance.id, position, value === "none" ? "" : value)}
                placeholder="Team"
                displayFormat={getTeamDisplayFormat}
                className="w-28"
              />
              
              {teamNumber && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemoveTeam(alliance.id, position)}
                  className="h-6 w-6 p-0 flex-shrink-0"
                >
                  <X className="h-3 w-3 text-red-400" />
                </Button>
              )}
            </div>
          </td>
        );
      })}
      <td className="p-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRemoveAlliance(alliance.id)}
          className="text-red-400 hover:text-red-500"
          title="Remove Alliance"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
};
