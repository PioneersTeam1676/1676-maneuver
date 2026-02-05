import type { TeamStats, PickList, PickListItem, SortOption } from "./pickListTypes";

// Sort teams based on selected criteria
export const sortTeams = (teams: TeamStats[], sortBy: SortOption): TeamStats[] => {
  return teams.sort((a, b) => {
    // For performance sorts, put teams with 0 matches at the bottom
    if (sortBy !== "number" && sortBy !== "matches") {
      if (a.matchesPlayed === 0 && b.matchesPlayed > 0) return 1;
      if (b.matchesPlayed === 0 && a.matchesPlayed > 0) return -1;
      // If both have 0 matches, sort by team number
      if (a.matchesPlayed === 0 && b.matchesPlayed === 0) {
        return Number(a.teamNumber) - Number(b.teamNumber);
      }
    }
    
    switch (sortBy) {
      case "totalCoral":
        return b.avgTotalCoralTotal - a.avgTotalCoralTotal;
      case "totalAlgae":
        return b.avgTotalAlgaeTotal - a.avgTotalAlgaeTotal;
      case "autoCorals":
        return b.avgAutoCoralTotal - a.avgAutoCoralTotal;
      case "teleopCorals":
        return b.avgTeleopCoralTotal - a.avgTeleopCoralTotal;
      case "coralL1":
        return b.avgTotalCoralL1 - a.avgTotalCoralL1;
      case "coralL2":
        return b.avgTotalCoralL2 - a.avgTotalCoralL2;
      case "coralL3":
        return b.avgTotalCoralL3 - a.avgTotalCoralL3;
      case "coralL4":
        return b.avgTotalCoralL4 - a.avgTotalCoralL4;
      case "climb":
        return b.climbRate - a.climbRate;
      case "matches":
        return b.matchesPlayed - a.matchesPlayed;
      default:
        return Number(a.teamNumber) - Number(b.teamNumber);
    }
  });
};

// Filter teams based on search criteria
export const filterTeams = (teams: TeamStats[], searchFilter: string): TeamStats[] => {
  return teams.filter(team => 
    team.teamNumber.toLowerCase().includes(searchFilter.toLowerCase())
  );
};

// Check if team is already in a pick list
export const isTeamInList = (team: TeamStats, pickList: PickList): boolean => {
  return pickList.teams.some(t => t.text === `Team ${team.teamNumber}`);
};

// Create a new pick list item from team stats
export const createPickListItem = (team: TeamStats): PickListItem => {
  return {
    id: Date.now() + Math.random(),
    text: `Team ${team.teamNumber}`,
    checked: false,
    description: team.teamNumber // Store team number for lookup
  };
};

// Calculate team statistics from scouting data
export const calculateTeamStats = (
  teamNumber: string, 
  teamEntries: Record<string, unknown>[]
): TeamStats => {
  const matchCount = teamEntries.length;
  
  // Calculate coral totals using object properties
  const autoCoralTotals = teamEntries.map((entry) => 
    (Number(entry.autoCoralPlaceL1Count) || 0) + 
    (Number(entry.autoCoralPlaceL2Count) || 0) + 
    (Number(entry.autoCoralPlaceL3Count) || 0) + 
    (Number(entry.autoCoralPlaceL4Count) || 0)
  );
  const teleopCoralTotals = teamEntries.map((entry) => 
    (Number(entry.teleopCoralPlaceL1Count) || 0) + 
    (Number(entry.teleopCoralPlaceL2Count) || 0) + 
    (Number(entry.teleopCoralPlaceL3Count) || 0) + 
    (Number(entry.teleopCoralPlaceL4Count) || 0)
  );
  
  // Calculate algae totals using object properties
  const autoAlgaeTotals = teamEntries.map((entry) => 
    (Number(entry.autoAlgaePlaceNetShot) || 0) + 
    (Number(entry.autoAlgaePlaceProcessor) || 0)
  );
  const teleopAlgaeTotals = teamEntries.map((entry) => 
    (Number(entry.teleopAlgaePlaceNetShot) || 0) + 
    (Number(entry.teleopAlgaePlaceProcessor) || 0)
  );
  
  // Calculate averages for each coral level using object properties
  const avgAutoCoralL1 = teamEntries.reduce((sum, entry) => sum + (Number(entry.autoCoralPlaceL1Count) || 0), 0) / matchCount;
  const avgAutoCoralL2 = teamEntries.reduce((sum, entry) => sum + (Number(entry.autoCoralPlaceL2Count) || 0), 0) / matchCount;
  const avgAutoCoralL3 = teamEntries.reduce((sum, entry) => sum + (Number(entry.autoCoralPlaceL3Count) || 0), 0) / matchCount;
  const avgAutoCoralL4 = teamEntries.reduce((sum, entry) => sum + (Number(entry.autoCoralPlaceL4Count) || 0), 0) / matchCount;
  
  const avgTeleopCoralL1 = teamEntries.reduce((sum, entry) => sum + (Number(entry.teleopCoralPlaceL1Count) || 0), 0) / matchCount;
  const avgTeleopCoralL2 = teamEntries.reduce((sum, entry) => sum + (Number(entry.teleopCoralPlaceL2Count) || 0), 0) / matchCount;
  const avgTeleopCoralL3 = teamEntries.reduce((sum, entry) => sum + (Number(entry.teleopCoralPlaceL3Count) || 0), 0) / matchCount;
  const avgTeleopCoralL4 = teamEntries.reduce((sum, entry) => sum + (Number(entry.teleopCoralPlaceL4Count) || 0), 0) / matchCount;
  
  // Calculate averages for algae locations using object properties
  const avgAutoAlgaeNet = teamEntries.reduce((sum, entry) => sum + (Number(entry.autoAlgaePlaceNetShot) || 0), 0) / matchCount;
  const avgAutoAlgaeProcessor = teamEntries.reduce((sum, entry) => sum + (Number(entry.autoAlgaePlaceProcessor) || 0), 0) / matchCount;
  const avgTeleopAlgaeNet = teamEntries.reduce((sum, entry) => sum + (Number(entry.teleopAlgaePlaceNetShot) || 0), 0) / matchCount;
  const avgTeleopAlgaeProcessor = teamEntries.reduce((sum, entry) => sum + (Number(entry.teleopAlgaePlaceProcessor) || 0), 0) / matchCount;
  
  // Calculate combined totals
  const avgAutoCoralTotal = autoCoralTotals.reduce((a, b) => a + b, 0) / matchCount;
  const avgTeleopCoralTotal = teleopCoralTotals.reduce((a, b) => a + b, 0) / matchCount;
  const avgAutoAlgaeTotal = autoAlgaeTotals.reduce((a, b) => a + b, 0) / matchCount;
  const avgTeleopAlgaeTotal = teleopAlgaeTotals.reduce((a, b) => a + b, 0) / matchCount;

  // Calculate rates using object properties
  const climbAttempts = teamEntries.filter((entry) => entry.shallowClimbAttempted || entry.deepClimbAttempted);
  const climbSuccesses = teamEntries.filter((entry) => (entry.shallowClimbAttempted || entry.deepClimbAttempted) && !entry.climbFailed);
  const breakdowns = teamEntries.filter((entry) => entry.brokeDown);
  const playedDefense = teamEntries.filter((entry) => entry.playedDefense);
  const mobility = teamEntries.filter((entry) => entry.autoPassedStartLine);
  
  // Calculate starting positions using object properties
  let pos0 = 0, pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  teamEntries.forEach((entry) => {
    if (entry.startPoses0) pos0++;
    if (entry.startPoses1) pos1++;
    if (entry.startPoses2) pos2++;
    if (entry.startPoses3) pos3++;
    if (entry.startPoses4) pos4++;
  });
  const startPositions = {
    position0: Math.round((pos0 / matchCount) * 100),
    position1: Math.round((pos1 / matchCount) * 100),
    position2: Math.round((pos2 / matchCount) * 100),
    position3: Math.round((pos3 / matchCount) * 100),
    position4: Math.round((pos4 / matchCount) * 100),
  };
  
  return {
    teamNumber,
    matchesPlayed: matchCount,
    avgAutoCoralTotal: Math.round(avgAutoCoralTotal * 10) / 10,
    avgTeleopCoralTotal: Math.round(avgTeleopCoralTotal * 10) / 10,
    avgTotalCoralTotal: Math.round((avgAutoCoralTotal + avgTeleopCoralTotal) * 10) / 10,
    avgAutoCoralL1: Math.round(avgAutoCoralL1 * 10) / 10,
    avgAutoCoralL2: Math.round(avgAutoCoralL2 * 10) / 10,
    avgAutoCoralL3: Math.round(avgAutoCoralL3 * 10) / 10,
    avgAutoCoralL4: Math.round(avgAutoCoralL4 * 10) / 10,
    avgTeleopCoralL1: Math.round(avgTeleopCoralL1 * 10) / 10,
    avgTeleopCoralL2: Math.round(avgTeleopCoralL2 * 10) / 10,
    avgTeleopCoralL3: Math.round(avgTeleopCoralL3 * 10) / 10,
    avgTeleopCoralL4: Math.round(avgTeleopCoralL4 * 10) / 10,
    avgTotalCoralL1: Math.round((avgAutoCoralL1 + avgTeleopCoralL1) * 10) / 10,
    avgTotalCoralL2: Math.round((avgAutoCoralL2 + avgTeleopCoralL2) * 10) / 10,
    avgTotalCoralL3: Math.round((avgAutoCoralL3 + avgTeleopCoralL3) * 10) / 10,
    avgTotalCoralL4: Math.round((avgAutoCoralL4 + avgTeleopCoralL4) * 10) / 10,
    avgAutoAlgaeTotal: Math.round(avgAutoAlgaeTotal * 10) / 10,
    avgTeleopAlgaeTotal: Math.round(avgTeleopAlgaeTotal * 10) / 10,
    avgTotalAlgaeTotal: Math.round((avgAutoAlgaeTotal + avgTeleopAlgaeTotal) * 10) / 10,
    avgAutoAlgaeNet: Math.round(avgAutoAlgaeNet * 10) / 10,
    avgAutoAlgaeProcessor: Math.round(avgAutoAlgaeProcessor * 10) / 10,
    avgTeleopAlgaeNet: Math.round(avgTeleopAlgaeNet * 10) / 10,
    avgTeleopAlgaeProcessor: Math.round(avgTeleopAlgaeProcessor * 10) / 10,
    climbRate: climbAttempts.length > 0 ? Math.round((climbSuccesses.length / climbAttempts.length) * 100) : 0,
    breakdownRate: Math.round((breakdowns.length / matchCount) * 100),
    defenseRate: Math.round((playedDefense.length / matchCount) * 100),
    mobilityRate: Math.round((mobility.length / matchCount) * 100),
    startPositions
  };
};

// Create a default team stats object for teams without scouting data
export const createDefaultTeamStats = (teamNumber: string): TeamStats => {
  return {
    teamNumber,
    matchesPlayed: 0,
    avgAutoCoralTotal: 0,
    avgTeleopCoralTotal: 0,
    avgTotalCoralTotal: 0,
    avgAutoCoralL1: 0,
    avgAutoCoralL2: 0,
    avgAutoCoralL3: 0,
    avgAutoCoralL4: 0,
    avgTeleopCoralL1: 0,
    avgTeleopCoralL2: 0,
    avgTeleopCoralL3: 0,
    avgTeleopCoralL4: 0,
    avgTotalCoralL1: 0,
    avgTotalCoralL2: 0,
    avgTotalCoralL3: 0,
    avgTotalCoralL4: 0,
    avgAutoAlgaeTotal: 0,
    avgTeleopAlgaeTotal: 0,
    avgTotalAlgaeTotal: 0,
    avgAutoAlgaeNet: 0,
    avgAutoAlgaeProcessor: 0,
    avgTeleopAlgaeNet: 0,
    avgTeleopAlgaeProcessor: 0,
    climbRate: 0,
    breakdownRate: 0,
    defenseRate: 0,
    mobilityRate: 0,
    startPositions: {
      position0: 0,
      position1: 0,
      position2: 0,
      position3: 0,
      position4: 0,
    }
  };
};
