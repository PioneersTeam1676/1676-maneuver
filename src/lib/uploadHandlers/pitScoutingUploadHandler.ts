import { toast } from "sonner";
import { importPitScoutingData } from "@/lib/pitScoutingUtils";
import type { PitScoutingEntry } from "@/lib/pitScoutingTypes";
import type { UploadMode } from "./scoutingDataUploadHandler";

export const handlePitScoutingUpload = async (jsonData: unknown, mode: UploadMode): Promise<void> => {
  if (!jsonData || typeof jsonData !== 'object' || !('entries' in jsonData)) {
    toast.error("Invalid pit scouting data format");
    return;
  }

  const data = jsonData as { entries: unknown[]; lastUpdated?: number };
  
  try {
    const result = await importPitScoutingData(
      { 
        entries: data.entries as PitScoutingEntry[], // Runtime validation happens in importPitScoutingData
        lastUpdated: data.lastUpdated || Date.now()
      },
      mode === 'overwrite' ? 'overwrite' : 'append'
    );
    
    const message = mode === 'overwrite' 
      ? `Overwritten with ${result.imported} pit scouting entries`
      : `Imported ${result.imported} pit scouting entries${result.duplicatesSkipped > 0 ? `, ${result.duplicatesSkipped} duplicates skipped` : ''}`;
    
    toast.success(message);
  } catch (error) {
    console.error('Error importing pit scouting data:', error);
    toast.error("Failed to import pit scouting data");
  }
};
