import { useState, useEffect, useCallback } from "react";
import { loadLegacyScoutingData } from "@/lib/scoutingDataUtils";
import { loadScoutingEntriesByMatch } from "@/lib/dexieDB";
import { createTeamStatsCalculator } from "@/lib/matchStrategyUtils";
import type { Alliance } from "@/lib/allianceTypes";

export const useMatchStrategy = () => {
  const [scoutingData, setScoutingData] = useState<unknown[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>(Array(6).fill(""));
  const [availableTeams, setAvailableTeams] = useState<string[]>([]);
  const [matchNumber, setMatchNumber] = useState<string>("");
  const [isLookingUpMatch, setIsLookingUpMatch] = useState(false);
  const [confirmedAlliances, setConfirmedAlliances] = useState<Alliance[]>([]);
  const [selectedBlueAlliance, setSelectedBlueAlliance] = useState<string>("");
  const [selectedRedAlliance, setSelectedRedAlliance] = useState<string>("");

  // Create the team stats calculator function
  const getTeamStats = createTeamStatsCalculator(scoutingData);

  // Debounced match number lookup
  const lookupMatchTeams = useCallback(async (matchNum: string) => {
    if (!matchNum.trim()) return;
    
    setIsLookingUpMatch(true);
    try {
      const matchNumber = parseInt(matchNum.trim());
      
      // First check localStorage match data (from TBA API)
      const matchDataStr = localStorage.getItem("matchData");
      if (matchDataStr) {
        try {
          const matchData = JSON.parse(matchDataStr);
          const match = matchData.find((m: unknown) => {
            const matchObj = m as { matchNum?: number; redAlliance?: string[]; blueAlliance?: string[] };
            return matchObj.matchNum === matchNumber;
          });
          
          if (match && match.redAlliance && match.blueAlliance) {
            const redTeams = match.redAlliance.slice(0, 3);
            const blueTeams = match.blueAlliance.slice(0, 3);
            
            const newSelectedTeams = Array(6).fill("");
            
            for (let i = 0; i < redTeams.length && i < 3; i++) {
              newSelectedTeams[i] = redTeams[i];
            }
            
            for (let i = 0; i < blueTeams.length && i < 3; i++) {
              newSelectedTeams[i + 3] = blueTeams[i];
            }
            
            setSelectedTeams(newSelectedTeams);
            setIsLookingUpMatch(false);
            return;
          }
        } catch (error) {
          console.error("Error parsing match data:", error);
        }
      }
      
      // Fallback: Try scouting database and legacy data
      const matchEntries = await loadScoutingEntriesByMatch(matchNum.trim());
      
      const legacyMatches = scoutingData.filter((entry: unknown) => {
        const entryObj = entry as { matchNumber?: string | number };
        return entryObj.matchNumber?.toString() === matchNum.trim();
      });
      
      const redTeams: string[] = [];
      const blueTeams: string[] = [];
      
      matchEntries.forEach(entry => {
        if (entry.teamNumber) {
          if (entry.alliance === "red" || entry.alliance === "redAlliance") {
            if (!redTeams.includes(entry.teamNumber)) {
              redTeams.push(entry.teamNumber);
            }
          } else if (entry.alliance === "blue" || entry.alliance === "blueAlliance") {
            if (!blueTeams.includes(entry.teamNumber)) {
              blueTeams.push(entry.teamNumber);
            }
          }
        }
      });
      
      if (matchEntries.length === 0 && legacyMatches.length > 0) {
        legacyMatches.forEach((entry: unknown) => {
          const entryObj = entry as { selectTeam?: string | number; alliance?: string };
          const teamNumber = entryObj.selectTeam?.toString();
          if (teamNumber) {
            if (entryObj.alliance === "red" || entryObj.alliance === "redAlliance") {
              if (!redTeams.includes(teamNumber)) {
                redTeams.push(teamNumber);
              }
            } else if (entryObj.alliance === "blue" || entryObj.alliance === "blueAlliance") {
              if (!blueTeams.includes(teamNumber)) {
                blueTeams.push(teamNumber);
              }
            }
          }
        });
      }
      
      if (redTeams.length > 0 || blueTeams.length > 0) {
        redTeams.sort((a, b) => Number(a) - Number(b));
        blueTeams.sort((a, b) => Number(a) - Number(b));
        
        const newSelectedTeams = Array(6).fill("");
        
        for (let i = 0; i < 3; i++) {
          newSelectedTeams[i] = redTeams[i] || "";
        }
        
        for (let i = 0; i < 3; i++) {
          newSelectedTeams[i + 3] = blueTeams[i] || "";
        }
        
        setSelectedTeams(newSelectedTeams);
      } else {
        console.log("No match entries found for match number:", matchNum);
      }
    } catch (error) {
      console.error("Error looking up match teams:", error);
    } finally {
      setIsLookingUpMatch(false);
    }
  }, [scoutingData]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const data = await loadLegacyScoutingData();
        setScoutingData(data);
        
        const teams = [...new Set(data.map((entry: Record<string, unknown>) => entry.selectTeam?.toString()).filter(Boolean))];
        teams.sort((a, b) => Number(a) - Number(b));
        setAvailableTeams(teams as string[]);
      } catch (error) {
        console.error("Error loading scouting data:", error);
      }
    };

    const loadConfirmedAlliances = () => {
      try {
        const savedAlliances = localStorage.getItem("confirmedAlliances");
        if (savedAlliances) {
          setConfirmedAlliances(JSON.parse(savedAlliances));
        }
      } catch (error) {
        console.error("Error loading confirmed alliances:", error);
      }
    };

    loadData();
    loadConfirmedAlliances();
  }, []);

  // Debounced match lookup
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (matchNumber.trim()) {
        lookupMatchTeams(matchNumber);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [matchNumber, lookupMatchTeams]);

  const handleTeamChange = (index: number, teamNumber: string) => {
    const newSelectedTeams = [...selectedTeams];
    newSelectedTeams[index] = teamNumber === "none" ? "" : teamNumber;
    setSelectedTeams(newSelectedTeams);
  };

  const applyAllianceToRed = (allianceId: string) => {
    setSelectedRedAlliance(allianceId === "none" ? "" : allianceId);
    if (allianceId === "none") return;
    
    const alliance = confirmedAlliances.find(a => a.id.toString() === allianceId);
    if (!alliance) return;
    
    const newSelectedTeams = [...selectedTeams];
    newSelectedTeams[0] = alliance.captain || "";
    newSelectedTeams[1] = alliance.pick1 || "";
    newSelectedTeams[2] = alliance.pick2 || "";
    setSelectedTeams(newSelectedTeams);
  };

  const applyAllianceToBlue = (allianceId: string) => {
    setSelectedBlueAlliance(allianceId === "none" ? "" : allianceId);
    if (allianceId === "none") return;
    
    const alliance = confirmedAlliances.find(a => a.id.toString() === allianceId);
    if (!alliance) return;
    
    const newSelectedTeams = [...selectedTeams];
    newSelectedTeams[3] = alliance.captain || "";
    newSelectedTeams[4] = alliance.pick1 || "";
    newSelectedTeams[5] = alliance.pick2 || "";
    setSelectedTeams(newSelectedTeams);
  };

  return {
    // State
    selectedTeams,
    availableTeams,
    matchNumber,
    isLookingUpMatch,
    confirmedAlliances,
    selectedBlueAlliance,
    selectedRedAlliance,
    
    // Functions
    getTeamStats,
    handleTeamChange,
    applyAllianceToRed,
    applyAllianceToBlue,
    setMatchNumber
  };
};
