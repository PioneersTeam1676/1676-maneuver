import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SortableList, SortableListItem } from "@/components/ui/sortable-list";
import { TeamStatsButton } from "@/components/ui/team-stats-button";
import { GenericSelector } from "@/components/ui/generic-selector";
import { Trash2 } from "lucide-react";
import type { PickList, PickListItem, TeamStats } from "@/lib/pickListTypes";
import type { Alliance } from "@/lib/allianceTypes";
import LogoConfused from "../../assets/confused.png";

interface PickListCardProps {
  pickList: PickList;
  availableTeams: TeamStats[];
  alliances: Alliance[];
  canDelete: boolean;
  onDeleteList: (listId: number) => void;
  onUpdateTeams: (listId: number, newTeams: PickListItem[]) => void;
  onAssignToAlliance: (teamNumber: string, allianceIndex: number) => void;
}

export const PickListCard = ({
  pickList,
  availableTeams,
  alliances,
  canDelete,
  onDeleteList,
  onUpdateTeams,
  onAssignToAlliance
}: PickListCardProps) => {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {pickList.name}
              <Badge variant="outline">{pickList.teams.length} teams</Badge>
            </CardTitle>
            {pickList.description && (
              <p className="text-sm text-muted-foreground mt-1">{pickList.description}</p>
            )}
          </div>
          {canDelete && (
            <Button 
              onClick={() => onDeleteList(pickList.id)} 
              variant="outline" 
              size="sm"
              className="text-red-400 hover:text-red-500"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {pickList.teams.length === 0 ? (
          <div className="flex flex-col text-center items-center justify-center py-8 text-muted-foreground">
            <img src={LogoConfused} alt="No Teams" className="mb-4 dark:invert" />
            <p>No teams in this list yet</p>
            <p className="text-sm">Add teams from the available teams panel</p>
          </div>
        ) : (
          <SortableList
            items={pickList.teams}
            setItems={(newTeams) => {
              // Handle both function and direct array updates
              if (typeof newTeams === 'function') {
                onUpdateTeams(pickList.id, newTeams(pickList.teams));
              } else {
                onUpdateTeams(pickList.id, newTeams);
              }
            }}
            onCompleteItem={(id) => {
              // Toggle the checked state to show/hide delete button
              const updatedTeams = pickList.teams.map(team => 
                team.id === id ? { ...team, checked: !team.checked } : team
              );
              onUpdateTeams(pickList.id, updatedTeams);
            }}
            renderItem={(item, order, onCompleteItem, onRemoveItem) => {
              // Extract team number from item.text (format: "Team 1234")
              const teamNumber = item.text.replace('Team ', '');
              const teamStats = availableTeams.find(t => t.teamNumber === teamNumber);
              return (
                <SortableListItem
                  key={item.id}
                  item={item}
                  order={order}
                  onCompleteItem={onCompleteItem}
                  onRemoveItem={onRemoveItem}
                  handleDrag={() => {}}
                  renderExtra={() => (
                    <div className="flex flex-1 justify-end px-2 py-2 gap-1">
                      <GenericSelector
                        label="Add to Alliance"
                        value=""
                        availableOptions={alliances.map((_, index) => `${index}`)}
                        onValueChange={(value: string) => {
                          if (value) {
                            onAssignToAlliance(teamNumber, parseInt(value));
                          }
                        }}
                        placeholder="Add to Alliance"
                        displayFormat={(value: string) => `Alliance ${parseInt(value) + 1}`}
                        buttonDisplayFormat={(value: string) => value ? `Alliance ${parseInt(value) + 1}` : "Add to Alliance"}
                        className="h-8 w-fit"
                      />
                      <TeamStatsButton 
                        teamNumber={teamNumber}
                        teamStats={teamStats}
                        variant="ghost"
                        size="sm"
                        className="h-8"
                      />
                    </div>
                  )}
                />
              );
            }}
          />
        )}
      </CardContent>
    </Card>
  );
};
