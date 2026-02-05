import { useRef } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/animate-ui/radix/tabs";
import { AllianceCard } from "./AllianceCard";
import { AllianceSelectionControls } from "./AllianceSelectionControls";
import type { Alliance } from "@/lib/allianceTypes";

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

interface TeamAnalysisProps {
  selectedTeams: string[];
  availableTeams: string[];
  activeStatsTab: string;
  confirmedAlliances: Alliance[];
  selectedBlueAlliance: string;
  selectedRedAlliance: string;
  getTeamStats: (teamNumber: string) => TeamStats | null;
  onTeamChange: (index: number, teamNumber: string) => void;
  onStatsTabChange: (value: string) => void;
  onBlueAllianceChange: (allianceId: string) => void;
  onRedAllianceChange: (allianceId: string) => void;
}

export const TeamAnalysis = ({
  selectedTeams,
  availableTeams,
  activeStatsTab,
  confirmedAlliances,
  selectedBlueAlliance,
  selectedRedAlliance,
  getTeamStats,
  onTeamChange,
  onStatsTabChange,
  onBlueAllianceChange,
  onRedAllianceChange
}: TeamAnalysisProps) => {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleAllianceCardTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleAllianceCardTouchEnd = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    
    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 50) {
      import('@/lib/haptics').then(({ haptics }) => {
        haptics.light();
      });
      
      const tabValues = ['overall', 'auto', 'teleop', 'endgame'];
      const currentIndex = tabValues.indexOf(activeStatsTab);
      
      if (currentIndex !== -1) {
        let newIndex;
        if (deltaX > 0) {
          newIndex = currentIndex > 0 ? currentIndex - 1 : tabValues.length - 1;
        } else {
          newIndex = currentIndex < tabValues.length - 1 ? currentIndex + 1 : 0;
        }
        
        const newValue = tabValues[newIndex];
        onStatsTabChange(newValue);
      }
    }
    
    touchStartRef.current = null;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <AllianceSelectionControls
          confirmedAlliances={confirmedAlliances}
          selectedBlueAlliance={selectedBlueAlliance}
          selectedRedAlliance={selectedRedAlliance}
          onBlueAllianceChange={onBlueAllianceChange}
          onRedAllianceChange={onRedAllianceChange}
        />
        
        <Tabs value={activeStatsTab} onValueChange={onStatsTabChange} className="w-full" enableSwipe={true}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overall">Overall</TabsTrigger>
            <TabsTrigger value="auto">Auto</TabsTrigger>
            <TabsTrigger value="teleop">Teleop</TabsTrigger>
            <TabsTrigger value="endgame">Endgame</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      
      <CardContent>
        <div className="flex flex-col lg:flex-row gap-6">
          <AllianceCard
            alliance="blue"
            selectedTeams={selectedTeams}
            availableTeams={availableTeams}
            activeStatsTab={activeStatsTab}
            getTeamStats={getTeamStats}
            onTeamChange={onTeamChange}
            onTouchStart={handleAllianceCardTouchStart}
            onTouchEnd={handleAllianceCardTouchEnd}
          />

          <div className="lg:w-px lg:bg-border lg:mx-0 lg:h-auto h-px bg-border w-full my-0 lg:my-4"></div>
          
          <AllianceCard
            alliance="red"
            selectedTeams={selectedTeams}
            availableTeams={availableTeams}
            activeStatsTab={activeStatsTab}
            getTeamStats={getTeamStats}
            onTeamChange={onTeamChange}
            onTouchStart={handleAllianceCardTouchStart}
            onTouchEnd={handleAllianceCardTouchEnd}
          />
        </div>
      </CardContent>
    </Card>
  );
};
