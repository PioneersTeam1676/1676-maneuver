import UniversalFountainGenerator from "./UniversalFountainGenerator";

interface MatchDataFountainGeneratorProps {
  onBack: () => void;
  onSwitchToScanner: () => void;
}

const MatchDataFountainGenerator = ({ onBack, onSwitchToScanner }: MatchDataFountainGeneratorProps) => {
  const loadMatchData = () => {
    // Load from localStorage with multiple possible keys
    const localStorageKeys = ['matchData', 'tbaMatchData', 'scoutingApp_matchData'];
    let matchData = null;
    
    for (const key of localStorageKeys) {
      const stored = localStorage.getItem(key);
      if (stored && stored.trim() !== '') {
        try {
          const parsed = JSON.parse(stored);
          // Validate that we have meaningful match data
          if (parsed && typeof parsed === 'object') {
            // Check if it's an array with matches or an object with match data
            if (Array.isArray(parsed) && parsed.length > 0) {
              matchData = parsed;
              break;
            } else if (typeof parsed === 'object' && Object.keys(parsed).length > 1) {
              matchData = parsed;
              break;
            }
          }
        } catch (e) {
          console.warn(`Failed to parse ${key}:`, e);
        }
      }
    }
    
    console.log('Match data loaded:', matchData ? 'Found data' : 'No valid data');
    return matchData; // Returns null if no valid data found
  };

  return (
    <UniversalFountainGenerator
      onBack={onBack}
      onSwitchToScanner={onSwitchToScanner}
      dataType="match"
      loadData={loadMatchData}
      title="Generate Match Data Fountain Codes"
      description="Create multiple QR codes for reliable match data transfer"
      noDataMessage="No match data found in localStorage"
    />
  );
};

export default MatchDataFountainGenerator;
