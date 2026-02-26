import { toast } from "sonner";

export interface DriveTeamEntry {
  id: string;
  teamNumber: string;
  matchNumber?: number;
  scoutName: string;
  formId: string;
  formName: string;
  timestamp: number;
  [key: string]: unknown;
}

type DriveTeamEntryInput = {
  teamNumber: string;
  scoutName: string;
  formId: string;
  formName: string;
  [key: string]: unknown;
};

const STORAGE_KEY = "drive_team_data";

export const getDriveTeamData = (): DriveTeamEntry[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Failed to load drive team data", error);
    return [];
  }
};

export const saveDriveTeamEntry = async (entry: DriveTeamEntryInput) => {
  const current = getDriveTeamData();
  const newEntry: DriveTeamEntry = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    ...entry,
  };

  const next = [...current, newEntry];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return newEntry;
};

export const clearDriveTeamData = () => {
  localStorage.removeItem(STORAGE_KEY);
  toast.success("Drive team data cleared.");
};
