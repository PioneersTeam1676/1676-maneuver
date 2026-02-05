import { clearStoredEventTeams } from './tbaUtils';
import { clearStoredNexusData } from './nexusUtils';
import { toast } from 'sonner';

/**
 * Event history management
 */

const EVENT_HISTORY_KEY = 'eventsList';
const CURRENT_EVENT_KEY = 'eventName';

/**
 * Get the list of previously used events
 */
export const getEventHistory = (): string[] => {
  try {
    const stored = localStorage.getItem(EVENT_HISTORY_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.warn('Failed to load event history:', error);
    return [];
  }
};

/**
 * Add an event to the history (only when data is successfully loaded)
 */
export const addEventToHistory = (eventKey: string): void => {
  if (!eventKey.trim()) return;
  
  try {
    const history = getEventHistory();
    // Remove if already exists (to move to front)
    const filtered = history.filter(key => key !== eventKey);
    // Add to beginning
    const updated = [eventKey, ...filtered];
    // Keep only last 10 events
    const trimmed = updated.slice(0, 10);
    
    localStorage.setItem(EVENT_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.warn('Failed to update event history:', error);
  }
};

/**
 * Get the current/last used event
 */
export const getCurrentEvent = (): string => {
  try {
    return localStorage.getItem(CURRENT_EVENT_KEY) || '';
  } catch (error) {
    console.warn('Failed to get current event:', error);
    return '';
  }
};

/**
 * Set the current event (should be called when successfully loading data)
 */
export const setCurrentEvent = (eventKey: string): void => {
  if (!eventKey.trim()) return;
  
  try {
    localStorage.setItem(CURRENT_EVENT_KEY, eventKey);
    // Also add to history
    addEventToHistory(eventKey);
  } catch (error) {
    console.warn('Failed to set current event:', error);
  }
};

/**
 * Check if switching to a different event than the current one
 */
export const isDifferentEvent = (newEventKey: string): boolean => {
  const currentEvent = getCurrentEvent();
  return !!(currentEvent && currentEvent !== newEventKey && newEventKey.trim() !== '');
};

/**
 * Clear all stored data for a specific event
 */
export const clearEventData = (eventKey: string): void => {
  if (!eventKey.trim()) {
    toast.error('Event key is required to clear data');
    return;
  }

  try {
    // Clear TBA event teams
    clearStoredEventTeams(eventKey);
    
    // Clear Nexus data (pit addresses, map, and extracted teams)
    clearStoredNexusData(eventKey);
    
    // Clear any other event-specific localStorage items
    const eventSpecificKeys = [
      `matches_${eventKey}`,
      `match_results_${eventKey}`,
      `event_info_${eventKey}`,
      `pit_assignments_${eventKey}`,
    ];
    
    eventSpecificKeys.forEach(key => {
      if (localStorage.getItem(key)) {
        localStorage.removeItem(key);
      }
    });
    
    console.log(`Cleared all data for event: ${eventKey}`);
    toast.success(`Cleared all stored data for event ${eventKey}`);
  } catch (error) {
    console.error('Error clearing event data:', error);
    toast.error('Failed to clear some event data');
  }
};

/**
 * Check if there is any stored data for a specific event
 */
export const hasStoredEventData = (eventKey: string): boolean => {
  if (!eventKey.trim()) return false;

  // Check for TBA event teams
  const teamStorageKey = `tba_event_teams_${eventKey}`;
  if (localStorage.getItem(teamStorageKey)) return true;

  // Check for Nexus data
  const nexusKeys = [
    `nexus_pit_addresses_${eventKey}`,
    `nexus_pit_map_${eventKey}`,
    `nexus_event_teams_${eventKey}`,
  ];
  
  for (const key of nexusKeys) {
    if (localStorage.getItem(key)) return true;
  }

  // Check for other event-specific data
  const eventSpecificKeys = [
    `matches_${eventKey}`,
    `match_results_${eventKey}`,
    `event_info_${eventKey}`,
    `pit_assignments_${eventKey}`,
  ];
  
  for (const key of eventSpecificKeys) {
    if (localStorage.getItem(key)) return true;
  }

  return false;
};

/**
 * Get a summary of what data is stored for an event
 */
export const getEventDataSummary = (eventKey: string): {
  hasTeams: boolean;
  hasPitData: boolean;
  hasMatches: boolean;
  hasAssignments: boolean;
  totalItems: number;
} => {
  if (!eventKey.trim()) {
    return {
      hasTeams: false,
      hasPitData: false,
      hasMatches: false,
      hasAssignments: false,
      totalItems: 0,
    };
  }

  const teamStorageKey = `tba_event_teams_${eventKey}`;
  const hasTeams = !!localStorage.getItem(teamStorageKey);

  const nexusKeys = [
    `nexus_pit_addresses_${eventKey}`,
    `nexus_pit_map_${eventKey}`,
    `nexus_event_teams_${eventKey}`,
  ];
  const hasPitData = nexusKeys.some(key => !!localStorage.getItem(key));

  const matchKeys = [
    `matches_${eventKey}`,
    `match_results_${eventKey}`,
  ];
  const hasMatches = matchKeys.some(key => !!localStorage.getItem(key));

  const assignmentKey = `pit_assignments_${eventKey}`;
  const hasAssignments = !!localStorage.getItem(assignmentKey);

  // Count total stored items for this event
  const allKeys = [
    teamStorageKey,
    ...nexusKeys,
    ...matchKeys,
    assignmentKey,
    `event_info_${eventKey}`,
  ];
  const totalItems = allKeys.filter(key => !!localStorage.getItem(key)).length;

  return {
    hasTeams,
    hasPitData,
    hasMatches,
    hasAssignments,
    totalItems,
  };
};
