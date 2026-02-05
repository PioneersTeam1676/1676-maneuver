/* eslint-disable @typescript-eslint/no-explicit-any */
import { 
  loadScoutingData, 
  saveScoutingData, 
  mergeScoutingData, 
  addIdsToScoutingData
} from "@/lib/scoutingDataUtils";
import type { ScoutingDataWithId } from "@/lib/scoutingDataUtils";
import UniversalFountainScanner from "./UniversalFountainScanner";

interface FountainCodeScannerProps {
  onBack: () => void;
  onSwitchToGenerator: () => void;
}

const FountainCodeScanner = ({ onBack, onSwitchToGenerator }: FountainCodeScannerProps) => {
  const saveScoutingDataFromFountain = async (data: unknown) => {
    
    // Load existing data
    const existingScoutingData = await loadScoutingData();
    
    // Handle new format with preserved IDs
    let newDataWithIds: ScoutingDataWithId[] = [];
    if (data && typeof data === 'object' && 'entries' in data && Array.isArray((data as any).entries)) {
      // New format: entries with preserved IDs
      newDataWithIds = (data as any).entries;
    } else if (data && typeof data === 'object' && 'data' in data && Array.isArray((data as any).data)) {
      // Fallback: old format without IDs (regenerate them)
      const newDataObjects = (data as any).data;
      newDataWithIds = addIdsToScoutingData(newDataObjects);
    }
    
    // Merge data with deduplication (smart merge by default)
    const mergeResult = mergeScoutingData(
      existingScoutingData.entries,
      newDataWithIds,
      'smart-merge'
    );
    
    // Save merged data
    await saveScoutingData({ entries: mergeResult.merged });
    
    // Show merge info
    const { stats } = mergeResult;
    if (stats.duplicates > 0) {
      console.log(`Merged: ${stats.new} new + ${stats.existing} existing (${stats.duplicates} duplicates skipped)`);
    }
  };

  const validateScoutingData = (data: unknown): boolean => {
    // Validate that it's scouting data in the expected format
    if (!data || typeof data !== 'object') return false;
    
    const dataObj = data as any;
    
    // Check for new format with preserved IDs
    if (dataObj.entries && Array.isArray(dataObj.entries)) {
      if (dataObj.entries.length === 0) return false;
      const firstEntry = dataObj.entries[0];
      return firstEntry && 
             typeof firstEntry === 'object' && 
             'id' in firstEntry && 
             'data' in firstEntry;
    }
    
    // Check for old format (fallback)
    if (dataObj.data && Array.isArray(dataObj.data)) {
      if (dataObj.data.length === 0) return false;
      const firstEntry = dataObj.data[0];
      if (!firstEntry || typeof firstEntry !== 'object') return false;
      
      // Check for expected scouting data fields (object format)
      const requiredFields = ['matchNumber', 'selectTeam', 'alliance'];
      const hasRequiredFields = requiredFields.some(field => field in firstEntry);
      return hasRequiredFields;
    }
    
    return false;
  };

  const getScoutingDataSummary = (data: unknown): string => {
    if (!data || typeof data !== 'object') return '0 entries';
    
    const dataObj = data as any;
    
    // Check for new format with preserved IDs
    if (dataObj.entries && Array.isArray(dataObj.entries)) {
      return `${dataObj.entries.length} entries (with IDs)`;
    }
    
    // Check for old format (fallback)
    if (dataObj.data && Array.isArray(dataObj.data)) {
      return `${dataObj.data.length} entries (legacy)`;
    }
    
    return '0 entries';
  };

  return (
    <UniversalFountainScanner
      onBack={onBack}
      onSwitchToGenerator={onSwitchToGenerator}
      dataType="scouting"
      expectedPacketType="scouting_fountain_packet"
      saveData={saveScoutingDataFromFountain}
      validateData={validateScoutingData}
      getDataSummary={getScoutingDataSummary}
      title="Scan Fountain Codes"
      description="Point your camera at the QR codes to receive scouting data"
      completionMessage="Scouting data has been successfully reconstructed and merged"
    />
  );
};

export default FountainCodeScanner;
