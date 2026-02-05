interface TeamStats {
  matchesPlayed: number;
  overall: { avgTotalPoints: number };
  auto: { avgTotalPoints: number; mobilityRate: number };
  teleop: { avgTotalPoints: number; avgCoral: number; avgAlgae: number };
  endgame: { avgTotalPoints: number; climbRate: number };
}

interface TeamStatsHeadersProps {
  alliance: 'red' | 'blue';
  activeStatsTab: string;
  selectedTeams: string[];
  getTeamStats: (teamNumber: string) => TeamStats | null;
}

export const TeamStatsHeaders = ({ 
  alliance, 
  activeStatsTab, 
  selectedTeams, 
  getTeamStats 
}: TeamStatsHeadersProps) => {
  // Get the correct team slice based on alliance
  const teamSlice = alliance === 'red' ? selectedTeams.slice(0, 3) : selectedTeams.slice(3, 6);
  
  const renderStatsHeader = () => {
    switch (activeStatsTab) {
      case "overall":
        return(
          <div className="text-right text-sm h-12 flex flex-col justify-center">
            <div className="font-bold text-lg">
              {Math.round(teamSlice.reduce((sum, team) => {
                const stats = getTeamStats(team);
                return sum + (stats?.overall.avgTotalPoints || 0);
              }, 0))} pts
            </div>
            <div className="text-xs text-muted-foreground">
              {teamSlice.filter(team => {
                const stats = getTeamStats(team);
                return stats && stats.endgame.climbRate > 50;
              }).length}/3 climbers
            </div>
          </div>
        );
      case "auto":
        return (
          <div className="text-right text-sm h-12 flex flex-col justify-center">
            <div className="font-bold text-lg">
              {Math.round(teamSlice.reduce((sum, team) => {
                const stats = getTeamStats(team);
                return sum + (stats?.auto.avgTotalPoints || 0);
              }, 0))} pts
            </div>
            <div className="text-xs text-muted-foreground">
              {teamSlice.filter(team => {
                const stats = getTeamStats(team);
                return stats && stats.auto.mobilityRate > 50;
              }).length}/3 mobile
            </div>
          </div>
        );
      case "teleop":
        return (
          <div className="text-right text-sm h-12 flex flex-col justify-center">
            <div className="font-bold text-lg">
              {Math.round(teamSlice.reduce((sum, team) => {
                const stats = getTeamStats(team);
                return sum + (stats?.teleop.avgTotalPoints || 0);
              }, 0))} pts
            </div>
            <div className="text-xs text-muted-foreground">
              {Math.round(teamSlice.reduce((sum, team) => {
                const stats = getTeamStats(team);
                return sum + (stats?.teleop.avgCoral || 0);
              }, 0) * 10) / 10} coral | {Math.round(teamSlice.reduce((sum, team) => {
                const stats = getTeamStats(team);
                return sum + (stats?.teleop.avgAlgae || 0);
              }, 0) * 10) / 10} algae
            </div>
          </div>
        );
      case "endgame":
        return (
          <div className="text-right text-sm h-12 flex flex-col justify-center">
            <div className="font-bold text-lg">
              {Math.round(teamSlice.reduce((sum, team) => {
                const stats = getTeamStats(team);
                return sum + (stats?.endgame.avgTotalPoints || 0);
              }, 0))} pts
            </div>
             <div className="text-xs text-muted-foreground">
              {teamSlice.filter(team => {
                const stats = getTeamStats(team);
                return stats && stats.endgame.climbRate > 50;
              }).length}/3 climbers
            </div>
          </div>
        );
    }
  }

  return (
    <>
      {renderStatsHeader()}
    </>
  );
};
