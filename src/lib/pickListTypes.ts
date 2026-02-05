export interface TeamStats {
  teamNumber: string;
  matchesPlayed: number;
  avgAutoCoralTotal: number;
  avgTeleopCoralTotal: number;
  avgTotalCoralTotal: number;
  avgAutoCoralL1: number;
  avgAutoCoralL2: number;
  avgAutoCoralL3: number;
  avgAutoCoralL4: number;
  avgTeleopCoralL1: number;
  avgTeleopCoralL2: number;
  avgTeleopCoralL3: number;
  avgTeleopCoralL4: number;
  avgTotalCoralL1: number;
  avgTotalCoralL2: number;
  avgTotalCoralL3: number;
  avgTotalCoralL4: number;
  avgAutoAlgaeTotal: number;
  avgTeleopAlgaeTotal: number;
  avgTotalAlgaeTotal: number;
  avgAutoAlgaeNet: number;
  avgAutoAlgaeProcessor: number;
  avgTeleopAlgaeNet: number;
  avgTeleopAlgaeProcessor: number;
  climbRate: number;
  breakdownRate: number;
  defenseRate: number;
  mobilityRate: number;
  startPositions: {
    position0: number;
    position1: number;
    position2: number;
    position3: number;
    position4: number;
  };
}

export interface PickListItem {
  id: number;
  text: string;
  checked: boolean;
  description: string; // Make required to match Item interface
}

export interface PickList {
  id: number;
  name: string;
  description: string;
  teams: PickListItem[];
}

export type SortOption = "number" | "totalCoral" | "totalAlgae" | "autoCorals" | "teleopCorals" | "coralL1" | "coralL2" | "coralL3" | "coralL4" | "climb" | "matches";
