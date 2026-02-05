import { useMemo } from "react";
import type { ScoutingDataWithId } from "@/lib/scoutingDataUtils";

type AggregationType = "average" | "median" | "max" | "75th";
type FilterOperator = ">" | ">=" | "<" | "<=" | "=" | "!=";

interface ColumnFilter {
  operator: FilterOperator;
  value: number;
}

interface ColumnConfig {
  key: string;
  label: string;
  category: string;
  visible: boolean;
  numeric: boolean;
  percentage?: boolean;
}

interface TeamData {
  teamNumber: number;
  eventName: string;
  matchCount: number;
  [key: string]: string | number;
}

export const useTeamStatistics = (
  filteredData: ScoutingDataWithId[],
  columnConfig: ColumnConfig[],
  aggregationType: AggregationType,
  columnFilters: Record<string, ColumnFilter>
) => {
  // Helper function for aggregation calculations
  const calculateAggregation = (values: number[], aggregationType: AggregationType): number => {
    if (values.length === 0) return 0;
    
    switch (aggregationType) {
      case "average":
        return values.reduce((sum, val) => sum + val, 0) / values.length;
      case "median": {
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0 
          ? (sorted[mid - 1] + sorted[mid]) / 2 
          : sorted[mid];
      }
      case "max":
        return Math.max(...values);
      case "75th": {
        const sorted75 = [...values].sort((a, b) => a - b);
        const index75 = Math.ceil(sorted75.length * 0.75) - 1;
        return sorted75[Math.max(0, index75)];
      }
    }
  };

  // Helper function to safely get numeric value
  const getNumericValue = (value: unknown): number => {
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    return 0;
  };

  // Calculate aggregated team statistics
  const teamStats = useMemo(() => {
    const teamMap = new Map<string, Record<string, unknown>[]>();
    
    // Group data by team AND event (not just team)
    filteredData.forEach(entry => {
      const teamNumber = entry.data.selectTeam as string;
      const eventName = entry.data.eventName as string;
      if (!teamNumber || !eventName) return;
      
      const teamEventKey = `${teamNumber}_${eventName}`;
      if (!teamMap.has(teamEventKey)) {
        teamMap.set(teamEventKey, []);
      }
      teamMap.get(teamEventKey)!.push(entry.data);
    });

    // Calculate statistics for each team-event combination
    const stats: TeamData[] = [];
    
    teamMap.forEach((matches, teamEventKey) => {
      const [teamNumber, eventName] = teamEventKey.split('_');
      const teamData: TeamData = {
        teamNumber: Number(teamNumber),
        eventName,
        matchCount: matches.length,
      };

      // Calculate stats for each numeric column
      columnConfig.forEach(col => {
        // Skip teamNumber and eventName as they're handled separately
        if (col.key === "teamNumber" || col.key === "eventName" || col.key === "matchCount") {
          return;
        }
        
        // Handle aggregate columns specially
        if (col.key === "totalPieces") {
          const values = matches.map(match => {
            const autoCoralTotal = getNumericValue(match.autoCoralPlaceL1Count) + getNumericValue(match.autoCoralPlaceL2Count) + 
                                  getNumericValue(match.autoCoralPlaceL3Count) + getNumericValue(match.autoCoralPlaceL4Count);
            const teleopCoralTotal = getNumericValue(match.teleopCoralPlaceL1Count) + getNumericValue(match.teleopCoralPlaceL2Count) + 
                                   getNumericValue(match.teleopCoralPlaceL3Count) + getNumericValue(match.teleopCoralPlaceL4Count);
            const autoAlgaeTotal = getNumericValue(match.autoAlgaePlaceNetShot) + getNumericValue(match.autoAlgaePlaceProcessor);
            const teleopAlgaeTotal = getNumericValue(match.teleopAlgaePlaceNetShot) + getNumericValue(match.teleopAlgaePlaceProcessor);
            return autoCoralTotal + teleopCoralTotal + autoAlgaeTotal + teleopAlgaeTotal;
          });
          teamData[col.key] = calculateAggregation(values, aggregationType);
        }
        else if (col.key === "totalCoral") {
          const values = matches.map(match => {
            const autoCoralTotal = getNumericValue(match.autoCoralPlaceL1Count) + getNumericValue(match.autoCoralPlaceL2Count) + 
                                  getNumericValue(match.autoCoralPlaceL3Count) + getNumericValue(match.autoCoralPlaceL4Count);
            const teleopCoralTotal = getNumericValue(match.teleopCoralPlaceL1Count) + getNumericValue(match.teleopCoralPlaceL2Count) + 
                                   getNumericValue(match.teleopCoralPlaceL3Count) + getNumericValue(match.teleopCoralPlaceL4Count);
            return autoCoralTotal + teleopCoralTotal;
          });
          teamData[col.key] = calculateAggregation(values, aggregationType);
        }
        else if (col.key === "totalAlgae") {
          const values = matches.map(match => {
            const autoAlgaeTotal = getNumericValue(match.autoAlgaePlaceNetShot) + getNumericValue(match.autoAlgaePlaceProcessor);
            const teleopAlgaeTotal = getNumericValue(match.teleopAlgaePlaceNetShot) + getNumericValue(match.teleopAlgaePlaceProcessor);
            return autoAlgaeTotal + teleopAlgaeTotal;
          });
          teamData[col.key] = calculateAggregation(values, aggregationType);
        }
        else if (col.key === "totalPoints") {
          const values = matches.map(match => {
            // Auto points
            const autoCoralPoints = (getNumericValue(match.autoCoralPlaceL1Count) * 3) + (getNumericValue(match.autoCoralPlaceL2Count) * 4) + 
                                   (getNumericValue(match.autoCoralPlaceL3Count) * 6) + (getNumericValue(match.autoCoralPlaceL4Count) * 7);
            const autoAlgaePoints = (getNumericValue(match.autoAlgaePlaceNetShot) * 4) + (getNumericValue(match.autoAlgaePlaceProcessor) * 2);
            const autoMobilityPoints = getNumericValue(match.autoPassedStartLine) ? 3 : 0;
            const autoPoints = autoCoralPoints + autoAlgaePoints + autoMobilityPoints;
            
            // Teleop points
            const teleopCoralPoints = (getNumericValue(match.teleopCoralPlaceL1Count) * 2) + (getNumericValue(match.teleopCoralPlaceL2Count) * 3) + 
                                     (getNumericValue(match.teleopCoralPlaceL3Count) * 4) + (getNumericValue(match.teleopCoralPlaceL4Count) * 5);
            const teleopAlgaePoints = (getNumericValue(match.teleopAlgaePlaceNetShot) * 4) + (getNumericValue(match.teleopAlgaePlaceProcessor) * 2);
            const teleopPoints = teleopCoralPoints + teleopAlgaePoints;
            
            // Endgame points
            let endgamePoints = 0;
            if ((getNumericValue(match.parkAttempted) && !getNumericValue(match.climbFailed)) || (getNumericValue(match.shallowClimbAttempted) && getNumericValue(match.climbFailed)) || (getNumericValue(match.deepClimbAttempted) && getNumericValue(match.climbFailed))) endgamePoints += 2;
            if (getNumericValue(match.shallowClimbAttempted) && !getNumericValue(match.climbFailed)) endgamePoints += 6;
            if (getNumericValue(match.deepClimbAttempted) && !getNumericValue(match.climbFailed)) endgamePoints += 12;
            
            return autoPoints + teleopPoints + endgamePoints;
          });
          teamData[col.key] = calculateAggregation(values, aggregationType);
        }
        else if (col.key === "autoPoints") {
          const values = matches.map(match => {
            const autoCoralPoints = (getNumericValue(match.autoCoralPlaceL1Count) * 3) + (getNumericValue(match.autoCoralPlaceL2Count) * 4) + 
                                   (getNumericValue(match.autoCoralPlaceL3Count) * 6) + (getNumericValue(match.autoCoralPlaceL4Count) * 7);
            const autoAlgaePoints = (getNumericValue(match.autoAlgaePlaceNetShot) * 4) + (getNumericValue(match.autoAlgaePlaceProcessor) * 2);
            const autoMobilityPoints = getNumericValue(match.autoPassedStartLine) ? 3 : 0;
            return autoCoralPoints + autoAlgaePoints + autoMobilityPoints;
          });
          teamData[col.key] = calculateAggregation(values, aggregationType);
        }
        else if (col.key === "teleopPoints") {
          const values = matches.map(match => {
            const teleopCoralPoints = (getNumericValue(match.teleopCoralPlaceL1Count) * 2) + (getNumericValue(match.teleopCoralPlaceL2Count) * 3) + 
                                     (getNumericValue(match.teleopCoralPlaceL3Count) * 4) + (getNumericValue(match.teleopCoralPlaceL4Count) * 5);
            const teleopAlgaePoints = (getNumericValue(match.teleopAlgaePlaceNetShot) * 4) + (getNumericValue(match.teleopAlgaePlaceProcessor) * 2);
            return teleopCoralPoints + teleopAlgaePoints;
          });
          teamData[col.key] = calculateAggregation(values, aggregationType);
        }
        else if (col.key === "endgamePoints") {
          const values = matches.map(match => {
            let endgamePoints = 0;
            if ((getNumericValue(match.parkAttempted) && !getNumericValue(match.climbFailed)) || (getNumericValue(match.shallowClimbAttempted) && getNumericValue(match.climbFailed)) || (getNumericValue(match.deepClimbAttempted) && getNumericValue(match.climbFailed))) endgamePoints += 2;
            if (getNumericValue(match.shallowClimbAttempted) && !getNumericValue(match.climbFailed)) endgamePoints += 6;
            if (getNumericValue(match.deepClimbAttempted) && !getNumericValue(match.climbFailed)) endgamePoints += 12;
            return endgamePoints;
          });
          teamData[col.key] = calculateAggregation(values, aggregationType);
        }
        else if (col.numeric) {
          const values = matches
            .map(match => {
              const value = match[col.key];
              return getNumericValue(value);
            })
            .filter(v => !isNaN(v));

          teamData[col.key] = calculateAggregation(values, aggregationType);
        } else {
          // For boolean columns, calculate percentage
          const trueCount = matches.filter(match => match[col.key] === true).length;
          teamData[col.key] = matches.length > 0 ? (trueCount / matches.length) * 100 : 0;
        }
      });

      stats.push(teamData);
    });

    return stats.sort((a, b) => a.teamNumber - b.teamNumber);
  }, [filteredData, columnConfig, aggregationType]);

  // Apply column filters to team stats
  const filteredTeamStats = useMemo(() => {
    if (Object.keys(columnFilters).length === 0) return teamStats;
    
    return teamStats.filter(team => {
      return Object.entries(columnFilters).every(([columnKey, filter]) => {
        const value = team[columnKey];
        if (typeof value !== 'number') return true;
        
        switch (filter.operator) {
          case ">":
            return value > filter.value;
          case ">=":
            return value >= filter.value;
          case "<":
            return value < filter.value;
          case "<=":
            return value <= filter.value;
          case "=":
            return Math.abs(value - filter.value) < 0.01; // Handle floating point comparison
          case "!=":
            return Math.abs(value - filter.value) >= 0.01;
          default:
            return true;
        }
      });
    });
  }, [teamStats, columnFilters]);

  return {
    teamStats,
    filteredTeamStats,
  };
};
