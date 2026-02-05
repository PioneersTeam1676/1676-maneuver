// Pit map data extraction and position utilities
import type { NexusPitMap } from '@/lib/nexusUtils';
import type { TeamPosition } from './spatialClustering';

export interface PitMapExtractorResult {
  teamPositions: TeamPosition[];
  totalTeamsFound: number;
  missingTeams: number[];
}

// Extract team positions from pit map data using addresses
export function extractTeamPositionsFromAddresses(
  teamNumbers: number[],
  pitAddresses: { [teamNumber: string]: string },
  pitMapData: NexusPitMap
): PitMapExtractorResult {
  const teamPositions: TeamPosition[] = [];
  const missingTeams: number[] = [];

  teamNumbers.forEach(teamNumber => {
    const address = pitAddresses[teamNumber.toString()];
    if (address && pitMapData.pits) {
      const pit = pitMapData.pits[address];
      if (pit && typeof pit === 'object' && 'x' in pit && 'y' in pit) {
        teamPositions.push({
          teamNumber,
          x: Number(pit.x),
          y: Number(pit.y)
        });
      } else {
        missingTeams.push(teamNumber);
      }
    } else {
      missingTeams.push(teamNumber);
    }
  });

  return {
    teamPositions,
    totalTeamsFound: teamPositions.length,
    missingTeams
  };
}

// Extract team positions directly from pit map data
export function extractTeamPositionsFromPitMap(
  teamNumbers: number[],
  pitMapData: NexusPitMap
): PitMapExtractorResult {
  const teamPositions: TeamPosition[] = [];
  const missingTeams: number[] = [];

  if (!pitMapData.pits) {
    return {
      teamPositions: [],
      totalTeamsFound: 0,
      missingTeams: teamNumbers
    };
  }

  // Create a map of team numbers to pit IDs
  const teamToPitMap: { [teamNumber: number]: string } = {};
  
  Object.entries(pitMapData.pits).forEach(([pitId, pitData]) => {
    if (typeof pitData === 'object' && pitData && 'team' in pitData) {
      const teamNumber = Number(pitData.team);
      if (!isNaN(teamNumber)) {
        teamToPitMap[teamNumber] = pitId;
      }
    }
  });

  teamNumbers.forEach(teamNumber => {
    const pitId = teamToPitMap[teamNumber];
    if (pitId && pitMapData.pits) {
      const pit = pitMapData.pits[pitId];
      if (pit && typeof pit === 'object' && 'x' in pit && 'y' in pit) {
        teamPositions.push({
          teamNumber,
          x: Number(pit.x),
          y: Number(pit.y)
        });
      } else {
        missingTeams.push(teamNumber);
      }
    } else {
      missingTeams.push(teamNumber);
    }
  });

  return {
    teamPositions,
    totalTeamsFound: teamPositions.length,
    missingTeams
  };
}

// Main extraction function that tries both methods
export function extractTeamPositions(
  teamNumbers: number[],
  pitAddresses: { [teamNumber: string]: string } | null,
  pitMapData: NexusPitMap | null
): PitMapExtractorResult {
  if (!pitMapData?.pits) {
    return {
      teamPositions: [],
      totalTeamsFound: 0,
      missingTeams: teamNumbers
    };
  }

  // Try addresses method first if available
  if (pitAddresses) {
    const addressResult = extractTeamPositionsFromAddresses(teamNumbers, pitAddresses, pitMapData);
    if (addressResult.totalTeamsFound > 0) {
      return addressResult;
    }
  }

  // Fallback to direct pit map extraction
  return extractTeamPositionsFromPitMap(teamNumbers, pitMapData);
}
