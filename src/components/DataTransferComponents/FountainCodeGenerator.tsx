import { loadScoutingData } from "@/lib/scoutingDataUtils";
import UniversalFountainGenerator from "./UniversalFountainGenerator";

interface FountainCodeGeneratorProps {
  onBack: () => void;
  onSwitchToScanner: () => void;
}

const FountainCodeGenerator = ({ onBack, onSwitchToScanner }: FountainCodeGeneratorProps) => {
  const loadScoutingDataForFountain = async () => {
    const scoutingDataWithIds = await loadScoutingData();
    
    if (scoutingDataWithIds.entries.length > 0) {
      // Send the full entries with IDs preserved for proper deduplication
      const formattedData = { entries: scoutingDataWithIds.entries };
      
      return formattedData;
    } else {
      console.log("No scouting data found");
      return null;
    }
  };

  return (
    <UniversalFountainGenerator
      onBack={onBack}
      onSwitchToScanner={onSwitchToScanner}
      dataType="scouting"
      loadData={loadScoutingDataForFountain}
      title="Generate Fountain Codes"
      description="Generate Luby Transform fountain codes from your scouting data. QR codes will automatically cycle for easy scanning."
      noDataMessage="No scouting data found in storage"
    />
  );
};

export default FountainCodeGenerator;