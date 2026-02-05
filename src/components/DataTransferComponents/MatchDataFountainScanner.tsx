import UniversalFountainScanner from "./UniversalFountainScanner";

interface MatchDataFountainScannerProps {
  onBack: () => void;
  onSwitchToGenerator: () => void;
}

const MatchDataFountainScanner = ({ onBack, onSwitchToGenerator }: MatchDataFountainScannerProps) => {
  const saveMatchData = (data: unknown) => {
    
    // Save to localStorage under multiple keys for compatibility
    const dataStr = JSON.stringify(data);
    localStorage.setItem('matchData', dataStr);
    localStorage.setItem('tbaMatchData', dataStr);
    localStorage.setItem('scoutingApp_matchData', dataStr);
    
  };

  const validateMatchData = (data: unknown): boolean => {
    // Basic validation for match data
    if (!data || typeof data !== 'object') return false;
    
    // Accept any object structure for match data
    return true;
  };

  const getMatchDataSummary = (data: unknown): string => {
    if (!data || typeof data !== 'object') return 'No data';
    
    // Count properties or entries
    const keys = Object.keys(data);
    
    // Check if it's an array of matches
    if (Array.isArray(data)) {
      return `${data.length} matches`;
    }
    
    // Check if it contains match arrays
    if (typeof data === 'object' && data !== null) {
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          return `${value.length} ${key}`;
        }
      }
    }
    
    return `${keys.length} properties`;
  };

  return (
    <UniversalFountainScanner
      onBack={onBack}
      onSwitchToGenerator={onSwitchToGenerator}
      dataType="match"
      expectedPacketType="match_fountain_packet"
      saveData={saveMatchData}
      validateData={validateMatchData}
      getDataSummary={getMatchDataSummary}
      title="Scan Match Data Fountain Codes"
      description="Point your camera at the QR codes to receive match data"
      completionMessage="Match data has been successfully reconstructed and saved"
    />
  );
};

export default MatchDataFountainScanner;
