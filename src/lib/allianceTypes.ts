export interface AllianceTeam {
  teamNumber: string;
  position: 1 | 2 | 3 | 4; // Captain, Pick 1, Pick 2, Pick 3 (backup)
  isBackup?: boolean; // For the 4th slot
}

export interface Alliance {
  id: number;
  allianceNumber: number;
  captain: string; // Team number
  pick1: string;
  pick2: string;
  pick3: string; // Backup
}

export interface BackupTeam {
  teamNumber: string;
  rank: number; // Order in backup pool
}

export interface AllianceSelection {
  alliances: Alliance[];
  backups: BackupTeam[];
}