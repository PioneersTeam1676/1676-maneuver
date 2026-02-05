import React, { useState } from 'react';
import { type TBAMatch } from '@/lib/tbaUtils';
import {
  ApiKeyForm,
  EventLoader,
  MatchSelector,
  ProcessingResults
} from '@/components/MatchResultsComponents';

interface ProcessingResult {
  matchNumber: number;
  winner: string;
  predictionsCount: number;
  correctPredictions: number;
  pisAwarded: number;
}

const MatchResultsPage: React.FC = () => {
  const [apiKey, setApiKey] = useState('');
  const [eventKey, setEventKey] = useState('');
  const [rememberForSession, setRememberForSession] = useState(false);
  const [matches, setMatches] = useState<TBAMatch[]>([]);
  const [processedResults, setProcessedResults] = useState<ProcessingResult[]>([]);

  const handleMatchesLoaded = (loadedMatches: TBAMatch[]) => {
    setMatches(loadedMatches);
  };

  const handleProcessingComplete = (results: ProcessingResult[]) => {
    setProcessedResults(results);
  };

  return (
    <div className="min-h-screen container mx-auto p-4 space-y-8 max-w-7xl">
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold">Match Results</h1>
        <p className="text-gray-600 dark:text-gray-400 text-sm sm:text-base">
          Load match results from The Blue Alliance to verify predictions
        </p>
      </div>

      <div className="space-y-6">
        <ApiKeyForm 
          apiKey={apiKey}
          setApiKey={setApiKey}
          rememberForSession={rememberForSession}
          setRememberForSession={setRememberForSession}
        />

        <EventLoader 
          apiKey={apiKey}
          eventKey={eventKey}
          setEventKey={setEventKey}
          onMatchesLoaded={handleMatchesLoaded}
          rememberForSession={rememberForSession}
          setApiKey={setApiKey}
        />
      </div>

      {matches.length > 0 && (
        <div className="mt-8">
          <MatchSelector 
            matches={matches}
            onProcessingComplete={handleProcessingComplete}
          />
        </div>
      )}

      {processedResults.length > 0 && (
        <div className="mt-8">
          <ProcessingResults results={processedResults} />
        </div>
      )}
    </div>
  );
};

export default MatchResultsPage;
