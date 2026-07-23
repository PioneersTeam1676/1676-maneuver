// The Blue Alliance API utilities
const TBA_BASE_URL = 'https://www.thebluealliance.com/api/v3';

export const MATCH_DATA_UPDATED_EVENT = 'matchDataUpdated';
export const ALLIANCE_DATA_UPDATED_EVENT = 'allianceDataUpdated';

const RAW_ENV_TBA_KEY = (import.meta.env.VITE_TBA_API_KEY ?? '').trim();

const envTbaKeyFromBuild = (() => {
  const value = RAW_ENV_TBA_KEY;
  if (value && typeof globalThis !== 'undefined') {
    try {
      (globalThis as typeof globalThis & { __APP_DEFAULT_TBA_API_KEY?: string }).__APP_DEFAULT_TBA_API_KEY = value;
    } catch {
      // Ignore persistence failures in environments without writable globals
    }
  }
  return value;
})();

const getEnvTbaKey = (): string => envTbaKeyFromBuild;

const getSessionTbaKey = (): string => {
  if (typeof window === 'undefined') return '';
  try {
    const candidate =
      sessionStorage.getItem('tbaApiKey') ||
      localStorage.getItem('tbaApiKey') ||
      (window as typeof window & { __APP_DEFAULT_TBA_API_KEY?: string }).__APP_DEFAULT_TBA_API_KEY ||
      '';
    return typeof candidate === 'string' ? candidate.trim() : '';
  } catch {
    return '';
  }
};

const persistDefaultTbaKey = (apiKey: string): void => {
  if (!apiKey || typeof window === 'undefined') return;
  try {
    const existing = sessionStorage.getItem('tbaApiKey');
    if (!existing) {
      sessionStorage.setItem('tbaApiKey', apiKey);
    }
  } catch {
    // Session storage might be unavailable (Safari private mode, etc.)
  }
};

export const resolveTbaApiKey = (override?: string): string => {
  const direct = override?.trim();
  if (direct) return direct;

  const sessionKey = getSessionTbaKey();
  if (sessionKey) return sessionKey;

  const envKey = getEnvTbaKey();
  if (envKey) {
    persistDefaultTbaKey(envKey);
    return envKey;
  }

  return '';
};

export interface TBAMatch {
  key: string;
  comp_level: string;
  set_number: number;
  match_number: number;
  alliances: {
    red: {
      score: number;
      team_keys: string[];
      surrogate_team_keys?: string[];
      dq_team_keys?: string[];
    };
    blue: {
      score: number;
      team_keys: string[];
      surrogate_team_keys?: string[];
      dq_team_keys?: string[];
    };
  };
  score_breakdown: Record<string, unknown> | null;
  winning_alliance: 'red' | 'blue' | '';
  event_key: string;
  time: number;
  actual_time: number;
  predicted_time: number;
  post_result_time: number;
  videos?: Array<{ type: string; key: string }>;
}

export interface TBAEvent {
  key: string;
  name: string;
  event_code: string;
  event_type: number;
  district?: {
    abbreviation: string;
    display_name: string;
    key: string;
    year: number;
  };
  city: string;
  state_prov: string;
  country: string;
  start_date: string;
  end_date: string;
  year: number;
  short_name: string;
  event_type_string: string;
  week?: number;
  address?: string;
  postal_code?: string;
  gmaps_place_id?: string;
  gmaps_url?: string;
  lat?: number;
  lng?: number;
  location_name?: string;
  timezone?: string;
  website?: string;
  first_event_id?: string;
  first_event_code?: string;
  webcasts?: Array<{
    type: string;
    channel: string;
    date?: string;
    file?: string;
  }>;
  division_keys?: string[];
  parent_event_key?: string;
  playoff_type?: number;
  playoff_type_string?: string;
}

export interface TBATeam {
  key: string;
  team_number: number;
  nickname: string;
  name: string;
  school_name?: string;
  city?: string;
  state_prov?: string;
  country?: string;
  address?: string;
  postal_code?: string;
  gmaps_place_id?: string;
  gmaps_url?: string;
  lat?: number;
  lng?: number;
  location_name?: string;
  website?: string;
  rookie_year?: number;
  motto?: string;
  home_championship?: {
    [year: string]: string;
  };
}

// Venue WiFi often reports navigator.onLine === true while having no real
// internet uplink (captive portals, LAN-only networks). Without a timeout a
// TBA fetch can hang for minutes and stall the periodic sync loop in App.tsx.
const TBA_FETCH_TIMEOUT_MS = 10_000;

// Helper function to make TBA API requests
const makeTBARequest = async (endpoint: string, options: { apiKey?: string } = {}): Promise<unknown> => {
  const apiKey = resolveTbaApiKey(options.apiKey);
  if (!apiKey) {
    throw new Error('TBA API key is not configured');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TBA_FETCH_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${TBA_BASE_URL}${endpoint}`, {
      headers: {
        'X-TBA-Auth-Key': apiKey,
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`TBA API Error: ${response.status} ${response.statusText}`);
  }

  return response.json();
};

// Get all events for a year
export const getEventsForYear = async (year: number): Promise<TBAEvent[]> => {
  return makeTBARequest(`/events/${year}`) as Promise<TBAEvent[]>;
};

// Search events by name/code
export const searchEvents = async (year: number, query: string): Promise<TBAEvent[]> => {
  const events = await getEventsForYear(year);
  const searchTerm = query.toLowerCase();
  
  return events.filter(event => 
    event.name.toLowerCase().includes(searchTerm) ||
    event.event_code.toLowerCase().includes(searchTerm) ||
    event.short_name.toLowerCase().includes(searchTerm)
  );
};

// Get matches for an event
export const getEventMatches = async (eventKey: string, apiKey?: string): Promise<TBAMatch[]> => {
  return makeTBARequest(`/event/${eventKey}/matches`, { apiKey }) as Promise<TBAMatch[]>;
};

// Get a specific match
export const getMatch = async (matchKey: string, apiKey?: string): Promise<TBAMatch> => {
  return makeTBARequest(`/match/${matchKey}`, { apiKey }) as Promise<TBAMatch>;
};

// Get matches for a specific event and filter by qualification matches
export const getQualificationMatches = async (eventKey: string, apiKey?: string): Promise<TBAMatch[]> => {
  const matches = await getEventMatches(eventKey, apiKey);
  return matches
    .filter(match => match.comp_level === 'qm')
    .sort((a, b) => a.match_number - b.match_number);
};

// Get playoff matches for an event
export const getPlayoffMatches = async (eventKey: string, apiKey?: string): Promise<TBAMatch[]> => {
  const matches = await getEventMatches(eventKey, apiKey);
  return matches.filter(match => match.comp_level !== 'qm');
};

// Get match results with winner determination
export const getMatchResult = (match: TBAMatch): {
  redScore: number;
  blueScore: number;
  winner: 'red' | 'blue' | 'tie';
  winningAlliance: 'red' | 'blue' | '';
} => {
  const redScore = match.alliances.red.score;
  const blueScore = match.alliances.blue.score;
  
  let winner: 'red' | 'blue' | 'tie';
  if (redScore > blueScore) {
    winner = 'red';
  } else if (blueScore > redScore) {
    winner = 'blue';
  } else {
    winner = 'tie';
  }

  return {
    redScore,
    blueScore,
    winner,
    winningAlliance: match.winning_alliance || (winner === 'tie' ? '' : winner)
  };
};

// Build match key from event key and match number
export const buildMatchKey = (eventKey: string, matchNumber: number, compLevel: string = 'qm'): string => {
  return `${eventKey}_${compLevel}${matchNumber}`;
};

// Parse match number from match key
export const parseMatchKey = (matchKey: string): {
  eventKey: string;
  compLevel: string;
  matchNumber: number;
} => {
  const parts = matchKey.split('_');
  if (parts.length !== 2) {
    throw new Error('Invalid match key format');
  }

  const eventKey = parts[0];
  const matchPart = parts[1];
  
  // Extract comp level (qm, sf, f, etc.) and match number
  const compLevelMatch = matchPart.match(/^([a-z]+)(\d+)$/);
  if (!compLevelMatch) {
    throw new Error('Invalid match key format');
  }

  const compLevel = compLevelMatch[1];
  const matchNumber = parseInt(compLevelMatch[2]);

  return { eventKey, compLevel, matchNumber };
};

// Validate TBA API key (simple test)
export const validateAPIKey = async (override?: string): Promise<boolean> => {
  try {
    // Try to get current year events as a test
    const currentYear = new Date().getFullYear();
    await makeTBARequest(`/events/${currentYear}/simple`, { apiKey: override });
    return true;
  } catch (error) {
    console.error('TBA API key validation failed:', error);
    return false;
  }
};

// Get event info by key
export const getEvent = async (eventKey: string, apiKey?: string): Promise<TBAEvent> => {
  return makeTBARequest(`/event/${eventKey}`, { apiKey }) as Promise<TBAEvent>;
};

// Get teams for an event
export const getEventTeams = async (eventKey: string, apiKey?: string): Promise<TBATeam[]> => {
  const endpoint = `/event/${eventKey}/teams/keys`;
  
  const teamKeys = await makeTBARequest(endpoint, { apiKey }) as string[];
  return teamKeys
    .map(key => {
      const teamNumber = parseInt(key.replace('frc', ''));
      return {
        key,
        team_number: teamNumber,
        nickname: `Team ${teamNumber}`,
        name: `Team ${teamNumber}`,
      };
    })
    .sort((a, b) => a.team_number - b.team_number);
};

export interface TBAMatchScheduleEntry {
  matchNum: number;
  redAlliance: string[];
  blueAlliance: string[];
}

export const fetchQualificationSchedule = async (eventKey: string, apiKey?: string): Promise<TBAMatchScheduleEntry[]> => {
  const matches = (await makeTBARequest(`/event/${eventKey}/matches/simple`, { apiKey })) as Array<{
    comp_level: string;
    match_number: number;
    alliances: {
      red: { team_keys: string[] };
      blue: { team_keys: string[] };
    };
  }>;

  return matches
    .filter(match => match.comp_level === 'qm')
    .map(match => ({
      matchNum: match.match_number,
      redAlliance: match.alliances.red.team_keys.map(team => team.replace('frc', '')),
      blueAlliance: match.alliances.blue.team_keys.map(team => team.replace('frc', '')),
    }))
    .sort((a, b) => a.matchNum - b.matchNum);
};

const isCompletedQualificationMatch = (match: TBAMatch): boolean => {
  if (match.comp_level !== 'qm') {
    return false;
  }

  if (Number(match.post_result_time) > 0) {
    return true;
  }

  if (typeof match.winning_alliance === 'string' && match.winning_alliance.trim()) {
    return true;
  }

  const redScore = Number(match.alliances?.red?.score);
  const blueScore = Number(match.alliances?.blue?.score);
  return Number.isFinite(redScore) && Number.isFinite(blueScore) && redScore >= 0 && blueScore >= 0;
};

const isInProgressQualificationMatch = (match: TBAMatch): boolean => (
  match.comp_level === 'qm' &&
  Number(match.actual_time) > 0 &&
  !isCompletedQualificationMatch(match)
);

export const resolveCurrentQualificationMatchNumber = (matches: TBAMatch[]): number | null => {
  const qualificationMatches = matches
    .filter((match) => match.comp_level === 'qm')
    .sort((a, b) => a.match_number - b.match_number);

  if (qualificationMatches.length === 0) {
    return null;
  }

  const inProgressMatch = qualificationMatches.find(isInProgressQualificationMatch);
  if (inProgressMatch) {
    return inProgressMatch.match_number;
  }

  const lastCompletedMatchNumber = qualificationMatches.reduce((max, match) => (
    isCompletedQualificationMatch(match) ? Math.max(max, match.match_number) : max
  ), 0);

  if (lastCompletedMatchNumber <= 0) {
    return qualificationMatches[0]?.match_number ?? null;
  }

  const nextScheduledMatch = qualificationMatches.find((match) => match.match_number > lastCompletedMatchNumber);
  return nextScheduledMatch?.match_number ?? lastCompletedMatchNumber;
};

export const fetchCurrentQualificationMatchNumber = async (
  eventKey: string,
  apiKey?: string
): Promise<number | null> => {
  const matches = await getEventMatches(eventKey, apiKey);
  return resolveCurrentQualificationMatchNumber(matches);
};

const matchScheduleSyncMap: Record<string, Promise<void>> = {};

const ALLIANCE_STORAGE_KEY = 'allianceCaptains';

export interface StoredAllianceCache {
  alliances: Array<{
    allianceNumber: number;
    captain: string | null;
    picks: string[];
    backup?: string | null;
  }>;
  updatedAt: string | null;
}

export const normalizeTbaTeamKey = (team: string | null | undefined): string => {
  if (typeof team !== 'string') return '';
  const trimmed = team.trim();
  if (!trimmed) return '';
  if (/^frc/i.test(trimmed)) {
    return trimmed.slice(3).trim();
  }
  return trimmed;
};

const hasUsableCachedSchedule = (eventKey: string): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    const storedEvent = localStorage.getItem('matchDataEventKey');
    if (storedEvent !== eventKey) return false;
    const raw = localStorage.getItem('matchData');
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
};

const writeCachedSchedule = (eventKey: string, schedule: TBAMatchScheduleEntry[]): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('matchData', JSON.stringify(schedule));
    localStorage.setItem('matchDataEventKey', eventKey);
    localStorage.setItem('matchDataUpdatedAt', new Date().toISOString());
    window.dispatchEvent(new Event(MATCH_DATA_UPDATED_EVENT));
  } catch (error) {
    console.warn('Failed to cache match schedule', error);
  }
};

export const ensureMatchScheduleCached = async (eventKey: string, options: { force?: boolean; apiKey?: string } = {}): Promise<void> => {
  if (!eventKey || typeof window === 'undefined') return;
  const trimmedKey = eventKey.trim();
  if (!trimmedKey) return;

  if (!options.force && hasUsableCachedSchedule(trimmedKey)) {
    return;
  }

  if (!matchScheduleSyncMap[trimmedKey]) {
    matchScheduleSyncMap[trimmedKey] = (async () => {
      const resolvedKey = resolveTbaApiKey(options.apiKey);
      if (!resolvedKey) {
        console.warn('TBA API key unavailable; skipping match schedule sync');
        return;
      }

      try {
        const schedule = await fetchQualificationSchedule(trimmedKey, resolvedKey);
        if (Array.isArray(schedule) && schedule.length > 0) {
          writeCachedSchedule(trimmedKey, schedule);
        }
      } catch (error) {
        console.error(`Failed to sync match schedule for ${trimmedKey}`, error);
        throw error;
      } finally {
        delete matchScheduleSyncMap[trimmedKey];
      }
    })();
  }

  try {
    await matchScheduleSyncMap[trimmedKey];
  } catch {
    // swallow errors here; logging handled above
  }
};

export const fetchEventAlliances = async (eventKey: string, apiKey?: string): Promise<Array<{
  allianceNumber: number;
  captain: string | null;
  picks: string[];
  backup?: string | null;
}>> => {
  const alliances = (await makeTBARequest(`/event/${eventKey}/alliances`, { apiKey })) as Array<{
    number: number;
    captain?: string;
    picks?: string[];
    backup?: { team?: string } | null;
  }>;

  return alliances.map((alliance) => ({
    allianceNumber: alliance.number,
    captain: alliance.captain ?? null,
    picks: Array.isArray(alliance.picks) ? alliance.picks : [],
    backup: alliance.backup?.team ?? null,
  }));
};

export const ensureAllianceDataCached = async (
  eventKey: string,
  options: { force?: boolean; apiKey?: string } = {},
): Promise<void> => {
  if (!eventKey || typeof window === 'undefined') return;
  const trimmedKey = eventKey.trim();
  if (!trimmedKey) return;

  const storageKey = `${ALLIANCE_STORAGE_KEY}:${trimmedKey}`;

  if (!options.force) {
    const existing = localStorage.getItem(storageKey);
    if (existing) {
      return;
    }
  }

  const resolvedKey = resolveTbaApiKey(options.apiKey);
  if (!resolvedKey) {
    console.warn('TBA API key unavailable; skipping alliance data sync');
    return;
  }

  try {
    const alliances = await fetchEventAlliances(trimmedKey, resolvedKey);
    localStorage.setItem(storageKey, JSON.stringify({
      alliances,
      updatedAt: new Date().toISOString(),
    }));
    window.dispatchEvent(new Event(ALLIANCE_DATA_UPDATED_EVENT));
  } catch (error) {
    console.error(`Failed to sync alliance data for ${trimmedKey}`, error);
    throw error;
  }
};

export const getStoredAllianceData = (eventKey: string): StoredAllianceCache | null => {
  if (typeof window === 'undefined') return null;
  const trimmed = eventKey.trim();
  if (!trimmed) return null;

  const storageKey = `${ALLIANCE_STORAGE_KEY}:${trimmed}`;
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const alliances = Array.isArray(parsed.alliances) ? parsed.alliances : [];
    const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null;
    if (alliances.length === 0) {
      return null;
    }
    return {
      alliances,
      updatedAt,
    };
  } catch (error) {
    console.warn('Failed to read stored alliance data', error);
    return null;
  }
};

export const clearStoredAllianceData = (eventKey: string): void => {
  if (typeof window === 'undefined') return;
  const trimmed = eventKey.trim();
  if (!trimmed) return;
  const storageKey = `${ALLIANCE_STORAGE_KEY}:${trimmed}`;
  localStorage.removeItem(storageKey);
};

// Local storage utilities for event teams
const TEAMS_STORAGE_PREFIX = 'tba_event_teams_';

export const storeEventTeams = (eventKey: string, teams: TBATeam[]): void => {
  const storageKey = `${TEAMS_STORAGE_PREFIX}${eventKey}`;
  // Extract just the team numbers for more efficient storage
  const teamNumbers = teams.map(team => team.team_number).sort((a, b) => a - b);
  const data = {
    teamNumbers,
    timestamp: Date.now(),
    eventKey
  };
  
  try {
    localStorage.setItem(storageKey, JSON.stringify(data));
    console.log(`Stored ${teamNumbers.length} team numbers for event ${eventKey}`);
  } catch (error) {
    console.error('Failed to store teams in localStorage:', error);
    throw new Error('Failed to store teams data');
  }
};

export const getStoredEventTeams = (eventKey: string): number[] | null => {
  const storageKey = `${TEAMS_STORAGE_PREFIX}${eventKey}`;
  
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return null;
    
    const data = JSON.parse(stored);
    // Check for both old format (teams) and new format (teamNumbers) for backward compatibility
    if (data.teamNumbers) {
      return data.teamNumbers;
    } else if (data.teams) {
      // Legacy format - extract team numbers from full team objects
      return data.teams.map((team: TBATeam) => team.team_number).sort((a: number, b: number) => a - b);
    }
    return null;
  } catch (error) {
    console.error('Failed to retrieve teams from localStorage:', error);
    return null;
  }
};

export const clearStoredEventTeams = (eventKey: string): void => {
  const storageKey = `${TEAMS_STORAGE_PREFIX}${eventKey}`;
  localStorage.removeItem(storageKey);
};

export const getAllStoredEventTeams = (): { [eventKey: string]: number[] } => {
  const result: { [eventKey: string]: number[] } = {};
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(TEAMS_STORAGE_PREFIX)) {
      try {
        const stored = localStorage.getItem(key);
        if (stored) {
          const data = JSON.parse(stored);
          const eventKey = key.replace(TEAMS_STORAGE_PREFIX, '');
          
          // Handle both new format (teamNumbers) and legacy format (teams)
          if (data.teamNumbers) {
            result[eventKey] = data.teamNumbers;
          } else if (data.teams) {
            // Legacy format - extract team numbers
            result[eventKey] = data.teams.map((team: TBATeam) => team.team_number).sort((a: number, b: number) => a - b);
          }
        }
      } catch (error) {
        console.error(`Failed to parse stored teams for key ${key}:`, error);
      }
    }
  }
  
  return result;
};
