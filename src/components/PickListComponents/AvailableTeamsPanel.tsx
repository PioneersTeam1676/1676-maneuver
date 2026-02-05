import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TeamCard } from "./TeamCard";
import { SortSelector } from "./SortSelector";
import type { TeamStats, PickList, SortOption } from "@/lib/pickListTypes";
import type { Alliance } from "@/lib/allianceTypes";
import LogoSearching from "../../assets/searching.png";

interface AvailableTeamsPanelProps {
  teams: TeamStats[];
  pickLists: PickList[];
  alliances?: Alliance[];
  searchFilter: string;
  sortBy: SortOption;
  onSearchChange: (value: string) => void;
  onSortChange: (value: SortOption) => void;
  onAddTeamToList: (team: TeamStats, listId: number) => void;
  onAddTeamToAlliance?: (teamNumber: string, allianceId: number) => void;
}

export const AvailableTeamsPanel = ({
  teams,
  pickLists,
  alliances,
  searchFilter,
  sortBy,
  onSearchChange,
  onSortChange,
  onAddTeamToList,
  onAddTeamToAlliance
}: AvailableTeamsPanelProps) => {
  return (
    <Card className="lg:col-span-1 max-h-screen">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Available Teams
          <Badge variant="secondary">{teams.length} teams</Badge>
        </CardTitle>
        
        {/* Filters */}
        <div className="space-y-3">
          <Input
            placeholder="Search teams..."
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          <SortSelector sortBy={sortBy} onSortChange={onSortChange} />
        </div>
      </CardHeader>
      
      <CardContent className="space-y-2 max-h-10/12 overflow-y-auto">
        {teams.map(team => (
          <TeamCard
            key={team.teamNumber}
            team={team}
            pickLists={pickLists}
            alliances={alliances}
            onAddTeamToList={onAddTeamToList}
            onAddTeamToAlliance={onAddTeamToAlliance}
          />
        ))}

        {/* Placeholder for no teams */}
        {teams.length === 0 && (
          <div className="flex flex-col text-center items-center justify-center py-8 text-muted-foreground">
            <img src={LogoSearching} alt="No Data" className="mb-4 dark:invert" />
            <p>No teams found. Try adjusting your search or filters.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
