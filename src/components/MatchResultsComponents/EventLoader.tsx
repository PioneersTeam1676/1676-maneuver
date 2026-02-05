import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { getMatchResult, type TBAMatch } from '@/lib/tbaUtils';
import { setCurrentEvent } from '@/lib/eventDataUtils';

interface EventLoaderProps {
  apiKey: string;
  eventKey: string;
  setEventKey: (key: string) => void;
  onMatchesLoaded: (matches: TBAMatch[]) => void;
  rememberForSession: boolean;
  setApiKey: (key: string) => void;
}

export const EventLoader: React.FC<EventLoaderProps> = ({
  apiKey,
  eventKey,
  setEventKey,
  onMatchesLoaded,
  rememberForSession,
  setApiKey
}) => {
  const [loading, setLoading] = useState(false);

  const loadMatches = async () => {
    if (!eventKey.trim()) {
      toast.error('Please enter an event key');
      return;
    }

    if (!apiKey.trim()) {
      toast.error('Please enter your TBA API key');
      return;
    }

    setLoading(true);
    try {
      // Use the same fetch logic as MatchDataPage
      const headers = {
        "X-TBA-Auth-Key": apiKey,
      };
      const response = await fetch(
        `https://www.thebluealliance.com/api/v3/event/${eventKey.trim()}/matches/simple`,
        { headers }
      );
      
      if (!response.ok) {
        throw new Error(`API request failed with status ${response.status}`);
      }
      
      const fullData = await response.json();
      
      // Filter for qualification matches
      const qualMatches = fullData.filter((match: TBAMatch) => match.comp_level === "qm");
      qualMatches.sort((a: TBAMatch, b: TBAMatch) => a.match_number - b.match_number);
      
      onMatchesLoaded(qualMatches);
      toast.success(`Loaded ${qualMatches.length} qualification matches`);

      // Keep the shared current event in sync for other pages.
      setCurrentEvent(eventKey.trim());

      // Store match results in localStorage for Pis calculation
      const matchResults = qualMatches.map((match: TBAMatch) => ({
        eventKey: eventKey.trim(),
        matchNumber: match.match_number,
        winner: getMatchResult(match).winner,
        redScore: getMatchResult(match).redScore,
        blueScore: getMatchResult(match).blueScore
      }));
      
      localStorage.setItem('matchResults', JSON.stringify(matchResults));
      localStorage.setItem('currentEventKey', eventKey.trim());
      
      // Clear API key from memory if not remembering for session
      if (!rememberForSession) {
        setApiKey("");
        sessionStorage.removeItem("tbaApiKey");
      }
    } catch (error) {
      console.error('Error loading matches:', error);
      toast.error('Failed to load matches. Check the event key and API key.');
      onMatchesLoaded([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Load Event Matches</CardTitle>
        <p className="text-sm text-muted-foreground">
          Enter event code to fetch match results for prediction verification
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="event-key">Event Key</Label>
          <Input
            id="event-key"
            placeholder="e.g., 2024necmp, 2024cafr"
            value={eventKey}
            onChange={(e) => setEventKey(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && loadMatches()}
            disabled={loading}
          />
        </div>

        <Button 
          onClick={loadMatches} 
          disabled={loading || !eventKey.trim() || !apiKey.trim()}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Loading Matches
            </>
          ) : (
            'Load Matches'
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
