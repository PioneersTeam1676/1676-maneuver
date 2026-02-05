import { loadPitScoutingData } from "@/lib/pitScoutingUtils";
import UniversalFountainGenerator from "./UniversalFountainGenerator";

interface PitScoutingFountainGeneratorProps {
  onBack: () => void;
  onSwitchToScanner: () => void;
}

const PitScoutingFountainGenerator = ({ onBack, onSwitchToScanner }: PitScoutingFountainGeneratorProps) => {
  const loadPitScoutingDataForFountain = async () => {
    const pitScoutingData = await loadPitScoutingData();
    
    if (pitScoutingData.entries.length > 0) {
      // Strip out images for fountain codes to reduce size
      const entriesWithoutImages = pitScoutingData.entries.map(entry => ({
        ...entry,
        robotPhoto: undefined
      }));
      
      return {
        ...pitScoutingData,
        entries: entriesWithoutImages
      };
    } else {
      console.log("No pit scouting data found");
      return null;
    }
  };

  return (
    <UniversalFountainGenerator
      onBack={onBack}
      onSwitchToScanner={onSwitchToScanner}
      dataType="pit-scouting"
      loadData={loadPitScoutingDataForFountain}
      title="Generate Pit Scouting Codes"
      description="Generate fountain codes from your pit scouting data (text only - images excluded for transfer efficiency). QR codes will automatically cycle for easy scanning."
      noDataMessage="No pit scouting data found in storage"
    />
  );
};

export default PitScoutingFountainGenerator;
