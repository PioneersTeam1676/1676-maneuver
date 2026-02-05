import { Badge } from "@/components/ui/badge";

interface TeamStats {
  matchesPlayed: number;
  overall: {
    totalPiecesScored: number;
    avgTotalPoints: number;
    avgCoral: number;
    avgAlgae: number;
  };
  auto: {
    mobilityRate: number;
    avgCoral: number;
    avgAlgae: number;
    avgTotalPoints: number;
    startingPositions: Array<{ position: string; percentage: number }>;
  };
  teleop: {
    avgCoral: number;
    avgAlgae: number;
    avgTotalPoints: number;
  };
  endgame: {
    climbRate: number;
    parkRate: number;
    shallowClimbRate: number;
    deepClimbRate: number;
    avgTotalPoints: number;
  };
}

interface TeamStatsDetailProps {
  stats: TeamStats | null;
  activeStatsTab: string;
}

export const TeamStatsDetail = ({ stats, activeStatsTab }: TeamStatsDetailProps) => {
  if (!stats) return null;

  const renderStatsContent = () => {
    switch (activeStatsTab) {
      case "overall":
        return (
          <div className="h-24 flex items-center">
            <div className="grid grid-cols-3 gap-2 text-sm w-full">
              <div className="text-center">
                <p className="font-medium text-xs">Coral</p>
                <p className="text-lg font-bold text-orange-600">{stats.overall.avgCoral}</p>
              </div>
              <div className="text-center">
                <p className="font-medium text-xs">Algae</p>
                <p className="text-lg font-bold text-green-600">{stats.overall.avgAlgae}</p>
              </div>
              <div className="text-center">
                <p className="font-medium text-xs">Avg Points</p>
                <p className="text-lg font-bold text-blue-600">{stats.overall.avgTotalPoints}</p>
              </div>
            </div>
          </div>
        );

      case "auto":
        return (
          <div className="h-24 flex flex-col justify-center">
            <div className="grid grid-cols-3 gap-2 text-sm mb-2">
              <div className="text-center">
                <p className="font-medium text-xs">Mobility</p>
                <p className="text-lg font-bold text-blue-600">{stats.auto.mobilityRate}%</p>
              </div>
              <div className="text-center">
                <p className="font-medium text-xs">Coral</p>
                <p className="text-lg font-bold text-orange-600">{stats.auto.avgCoral}</p>
              </div>
              <div className="text-center">
                <p className="font-medium text-xs">Algae</p>
                <p className="text-lg font-bold text-green-600">{stats.auto.avgAlgae}</p>
              </div>
            </div>
            {stats.auto.startingPositions.length > 0 && (
              <div className="flex flex-col items-center">
                <p className="font-medium text-xs mb-1">Starting Positions:</p>
                <div className="flex flex-wrap gap-1 justify-center max-h-8 overflow-hidden">
                  {stats.auto.startingPositions.slice(0, 4).map((pos, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {pos.position}: {pos.percentage}%
                    </Badge>
                  ))}
                  {stats.auto.startingPositions.length > 4 && (
                    <Badge variant="secondary" className="text-xs">
                      +{stats.auto.startingPositions.length - 4} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case "teleop":
        return (
          <div className="h-24 flex items-center">
            <div className="grid grid-cols-2 gap-2 text-sm w-full">
              <div className="text-center">
                <p className="font-medium text-xs">Coral</p>
                <p className="text-lg font-bold text-orange-600">{stats.teleop.avgCoral}</p>
              </div>
              <div className="text-center">
                <p className="font-medium text-xs">Algae</p>
                <p className="text-lg font-bold text-green-600">{stats.teleop.avgAlgae}</p>
              </div>
            </div>
          </div>
        );

      case "endgame":
        return (
          <div className="h-24 flex items-center">
            <div className="grid grid-cols-2 gap-2 text-sm w-full">
              <div className="text-center">
                <p className="font-medium text-xs">Overall Climb</p>
                <p className="text-lg font-bold text-purple-600">{stats.endgame.climbRate}%</p>
              </div>
              <div className="text-center">
                <p className="font-medium text-xs">Park</p>
                <p className="text-sm font-bold text-gray-600">{stats.endgame.parkRate}%</p>
              </div>
              <div className="text-center">
                <p className="font-medium text-xs">Shallow</p>
                <p className="text-sm font-bold text-blue-600">{stats.endgame.shallowClimbRate}%</p>
              </div>
              <div className="text-center">
                <p className="font-medium text-xs">Deep</p>
                <p className="text-sm font-bold text-red-600">{stats.endgame.deepClimbRate}%</p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
      {renderStatsContent()}
      <div className="text-center text-xs text-muted-foreground mt-2">
        {stats.matchesPlayed} matches played
      </div>
    </div>
  );
};
