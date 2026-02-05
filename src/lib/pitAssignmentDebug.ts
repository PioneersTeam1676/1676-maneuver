// Debug utilities for pit assignment development
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { getAllStoredEventTeams } from '@/lib/tbaUtils';
import { getStoredNexusTeams, getStoredPitData } from '@/lib/nexusUtils';

// Manual extraction helper for debugging
export function setupDebugFunctions(): void {
  // Manual extraction helper
  (window as unknown as { manuallyExtractNexusTeams: (eventKey: string) => void }).manuallyExtractNexusTeams = (eventKey: string) => {
    console.log(`Attempting to manually extract teams for event: ${eventKey}`);
    
    // Check if pit data exists  
    const pitData = getStoredPitData(eventKey);
    console.log('Found pit data:', pitData);
    
    // Try to extract teams directly from pit map data
    if (pitData.map && pitData.map.pits) {
      console.log('Extracting teams from pit map...');
      const extractedTeams: number[] = [];
      
      Object.values(pitData.map.pits).forEach((pit: unknown) => {
        const typedPit = pit as { team?: number; x?: number; y?: number };
        if (typedPit.team && typeof typedPit.team === 'number') {
          extractedTeams.push(typedPit.team);
        }
      });
      
      console.log(`Extracted ${extractedTeams.length} teams:`, extractedTeams.sort((a, b) => a - b));
      
      if (extractedTeams.length > 0) {
        localStorage.setItem(`nexus_event_teams_${eventKey}`, JSON.stringify(extractedTeams));
        console.log('Teams saved to localStorage');
      }
    } else if (pitData.addresses && Object.keys(pitData.addresses).length > 0) {
      console.log('Found pit addresses but no teams in pit map');
      const teamNumbers = Object.keys(pitData.addresses).map(Number).filter(n => !isNaN(n));
      console.log('Teams from addresses:', teamNumbers.sort((a, b) => a - b));
      
      if (teamNumbers.length > 0) {
        localStorage.setItem(`nexus_event_teams_${eventKey}`, JSON.stringify(teamNumbers));
        console.log('Teams from addresses saved to localStorage');
      }
    } else {
      console.log('No usable team data found in pit data');
      
      // Try to extract from different pit data structure
      if (pitData.map && pitData.map.pits) {
        console.log('Trying alternative extraction...');
        Object.entries(pitData.map.pits).forEach(([pitId, pit]: [string, any]) => {
          console.log(`Pit ${pitId}:`, pit);
        });
      }
    }
  };
  
  // List available pit data
  (window as any).listAvailablePitData = () => {
    console.log('=== Available Pit Data ===');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('nexus_') || key.startsWith('tba_'))) {
        const data = localStorage.getItem(key);
        try {
          const parsed = JSON.parse(data || '{}');
          console.log(key, ':', parsed);
        } catch (e) {
          console.log(key, ':', data);
        }
      }
    }
  };
  
  // Debug localStorage
  (window as any).debugPitAssignments = () => {
    console.log('=== Manual Debug localStorage ===');
    const allKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.includes('nexus') || key.includes('tba'))) {
        allKeys.push(key);
      }
    }
    console.log('All nexus/tba keys:', allKeys);
    
    allKeys.forEach(key => {
      const data = localStorage.getItem(key);
      console.log(`\n${key}:`, JSON.parse(data || '{}'));
    });
  };
}

// Debug team data loading
export function debugTeamDataLoading(): void {
  const tbaTeams = getAllStoredEventTeams();
  console.log('=== Debug Team Data Loading ===');
  
  // Get all possible event keys from both TBA and Nexus sources
  const allEventKeys = new Set<string>();
  
  // Add TBA event keys
  Object.keys(tbaTeams).forEach(eventKey => allEventKeys.add(eventKey));
  
  // Add Nexus event keys by scanning localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('nexus_event_teams_')) {
      const eventKey = key.replace('nexus_event_teams_', '');
      allEventKeys.add(eventKey);
    }
  }
  
  console.log('Found event keys:', Array.from(allEventKeys));
  
  // Check each event
  allEventKeys.forEach(eventKey => {
    const nexusTeams = getStoredNexusTeams(eventKey);
    const tbaTeamsForEvent = tbaTeams[eventKey];
    
    console.log(`\nEvent ${eventKey}:`);
    console.log('  Nexus teams:', nexusTeams);
    console.log('  TBA teams:', tbaTeamsForEvent);
  });
  
  // Check specific nexus team keys
  console.log('\n=== Nexus Storage Keys ===');
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('nexus_event_teams_')) {
      const data = localStorage.getItem(key);
      console.log(`${key}:`, JSON.parse(data || '{}'));
    }
  }
}

// Log spatial assignment details
export function logSpatialAssignmentDetails(data: {
  currentTeams: number[];
  pitAddresses: { [teamNumber: string]: string } | null;
  pitMapData: any;
  teamPositions: any[];
}): void {
  console.log('Spatial assignment debug:', {
    currentTeams: data.currentTeams.length,
    pitAddresses: data.pitAddresses ? Object.keys(data.pitAddresses).length : 0,
    pitMapPits: data.pitMapData?.pits ? Object.keys(data.pitMapData.pits).length : 0,
    teamPositions: data.teamPositions.length,
    samplePit: data.pitMapData?.pits ? Object.values(data.pitMapData.pits)[0] : null
  });
}

// Clear all debug data
export function clearDebugData(): void {
  const keysToRemove: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.startsWith('nexus_') || key.startsWith('tba_'))) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
    console.log(`Removed: ${key}`);
  });
  
  console.log(`Cleared ${keysToRemove.length} debug data items`);
}
