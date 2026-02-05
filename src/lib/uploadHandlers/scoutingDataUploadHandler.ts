import { toast } from "sonner";
import { 
  loadScoutingData, 
  saveScoutingData, 
  mergeScoutingData, 
  addIdsToScoutingData
} from "@/lib/scoutingDataUtils";

export type UploadMode = "append" | "overwrite" | "smart-merge";

interface RawScoutingData {
  data: unknown[];
}

type ProcessedScoutingData = unknown[][];

export const handleScoutingDataUpload = async (jsonData: unknown, mode: UploadMode): Promise<void> => {
  // Validate scouting data structure
  let newData: unknown[] = [];
  
  if (
    typeof jsonData === "object" &&
    jsonData !== null &&
    "entries" in jsonData &&
    Array.isArray((jsonData as { entries: unknown[] }).entries)
  ) {
    // Modern format with entries and IDs
    const modernData = jsonData as { entries: { id: string; data: Record<string, unknown> }[] };
    const existingScoutingData = await loadScoutingData();
    
    // Merge data based on mode
    const mergeResult = mergeScoutingData(
      existingScoutingData.entries,
      modernData.entries,
      mode
    );
    
    // Save merged data
    await saveScoutingData({ entries: mergeResult.merged });
    
    // Create success message based on mode and results
    const { stats } = mergeResult;
    let message = '';
    
    if (mode === "overwrite") {
      message = `Overwritten with ${stats.final} scouting entries`;
    } else if (mode === "append") {
      message = `Appended ${stats.new} entries to existing ${stats.existing} entries (Total: ${stats.final})`;
    } else if (mode === "smart-merge") {
      if (stats.duplicates > 0) {
        message = `Smart merge: ${stats.new} new entries added, ${stats.duplicates} duplicates skipped (Total: ${stats.final})`;
      } else {
        message = `Smart merge: ${stats.new} new entries added (Total: ${stats.final})`;
      }
    }
    
    toast.success(message);
    return;
  }
  
  // Legacy format handling
  if (
    typeof jsonData === "object" &&
    jsonData !== null &&
    "data" in jsonData &&
    Array.isArray((jsonData as RawScoutingData).data)
  ) {
    // Raw scouting data format
    newData = (jsonData as RawScoutingData).data;
  } else if (Array.isArray(jsonData)) {
    // Processed scouting data format - skip header row if it exists
    const hasHeaderRow =
      jsonData.length > 0 &&
      Array.isArray(jsonData[0]) &&
      typeof jsonData[0][0] === "string" &&
      jsonData[0].some(
        (cell: unknown) =>
          typeof cell === "string" &&
          (cell.includes("match") || cell.includes("team"))
      );

    newData = hasHeaderRow ? (jsonData as ProcessedScoutingData).slice(1) : (jsonData as ProcessedScoutingData);
  } else {
    toast.error("Invalid scouting data format");
    return;
  }

  // Load existing data using new utility
  const existingScoutingData = await loadScoutingData();
  
  // Convert new data to ID structure
  const newDataArrays = newData as unknown[][];
  const newDataWithIds = addIdsToScoutingData(newDataArrays);
  
  // Merge data based on mode
  const mergeResult = mergeScoutingData(
    existingScoutingData.entries,
    newDataWithIds,
    mode
  );
  
  // Save merged data
  await saveScoutingData({ entries: mergeResult.merged });
  
  // Create success message based on mode and results
  const { stats } = mergeResult;
  let message = '';
  
  if (mode === "overwrite") {
    message = `Overwritten with ${stats.final} scouting entries`;
  } else if (mode === "append") {
    message = `Appended ${stats.new} entries to existing ${stats.existing} entries (Total: ${stats.final})`;
  } else if (mode === "smart-merge") {
    if (stats.duplicates > 0) {
      message = `Smart merge: ${stats.new} new entries added, ${stats.duplicates} duplicates skipped (Total: ${stats.final})`;
    } else {
      message = `Smart merge: ${stats.new} new entries added (Total: ${stats.final})`;
    }
  }
  
  toast.success(message);
};
