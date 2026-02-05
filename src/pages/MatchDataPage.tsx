import { useState, useEffect, useRef } from "react";
import { toast } from "sonner"
import Button from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/animate-ui/radix/checkbox";
import { Eye, EyeOff, Shield } from "lucide-react";
import { MATCH_DATA_UPDATED_EVENT } from "@/lib/tbaUtils";

const MatchDataPage = () => {
  const presetApiKey = (import.meta.env.VITE_TBA_API_KEY ?? "").trim();
  const getSessionApiKey = () => {
    if (typeof window === "undefined") return "";
    try {
      return sessionStorage.getItem("tbaApiKey") ?? "";
    } catch {
      return "";
    }
  };

  const [apiKey, setApiKey] = useState(() => {
    const sessionApiKey = getSessionApiKey();
    return sessionApiKey || presetApiKey;
  });
  const [eventKey, setEventKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [rememberForSession, setRememberForSession] = useState(() => {
    const sessionApiKey = getSessionApiKey();
    return Boolean(sessionApiKey || presetApiKey);
  });
  const apiInputRef = useRef<HTMLInputElement | null>(null);

  // Save/remove API key from sessionStorage when remember preference changes
  useEffect(() => {
    if (rememberForSession && apiKey) {
      sessionStorage.setItem("tbaApiKey", apiKey);
    } else if (rememberForSession && !apiKey) {
      toast.error("API key cannot be empty if you want to remember it for this session.");
    } else {
      sessionStorage.removeItem("tbaApiKey");
    }
  }, [rememberForSession, apiKey]);

    useEffect(() => {
      // Check for autofilled value after a short delay
      const timeout = setTimeout(() => {
        if (apiInputRef.current) {
          const val = apiInputRef.current.value;
          if (val && val !== apiKey) {
            setApiKey(val);
          }
        }
      }, 300);

      return () => clearTimeout(timeout);
    }, [apiKey]);
    

  const fetchMatchDataFromTBA = async (tbaApiKey: string, tbaEventKey: string) => {
    try {
      const headers = {
        "X-TBA-Auth-Key": tbaApiKey,
      };
      const res = await fetch(
        `https://www.thebluealliance.com/api/v3/event/${tbaEventKey}/matches/simple`,
        { headers }
      );
      
      if (!res.ok) {
        throw new Error(`API request failed with status ${res.status}`);
      }
      
      const fullData = await res.json();

      const qualMatchesCleaned = [];

      for (const match of fullData) {
        if (match.comp_level == "qm") {
          qualMatchesCleaned.push({
            matchNum: match["match_number"],
            redAlliance: match.alliances.red.team_keys.map((team: string) =>
              team.replace("frc", "")
            ),
            blueAlliance: match.alliances.blue.team_keys.map((team: string) =>
              team.replace("frc", "")
            ),
          });
        }
      }
      
      qualMatchesCleaned.sort((a, b) => a.matchNum - b.matchNum);

      const timestamp = new Date().toISOString();
      localStorage.setItem("matchData", JSON.stringify(qualMatchesCleaned));

      localStorage.setItem("eventName", tbaEventKey);
      localStorage.setItem("matchDataEventKey", tbaEventKey.trim());
      localStorage.setItem("matchDataUpdatedAt", timestamp);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event(MATCH_DATA_UPDATED_EVENT));
      }
      
      const savedEvents = localStorage.getItem("eventsList");
      let eventsList: string[] = [];
      
      if (savedEvents) {
        try {
          eventsList = JSON.parse(savedEvents);
        } catch {
          eventsList = [];
        }
      }
      
      if (!eventsList.includes(tbaEventKey)) {
        eventsList.push(tbaEventKey);
        eventsList.sort();
        localStorage.setItem("eventsList", JSON.stringify(eventsList));
      }

      const matchDataStr = localStorage.getItem("matchData");
      let fetchedMsg = "Match Data Fetched";
      if (matchDataStr) {
        const matchData = JSON.parse(matchDataStr);
        if (Array.isArray(matchData) && matchData.length > 0 && matchData[0].redAlliance && matchData[0].redAlliance.length > 0) {
          fetchedMsg += `: ${qualMatchesCleaned.length} matches for ${tbaEventKey}`;
        }
      }
      toast.success(fetchedMsg);
      
      // Clear API key from memory and session storage after successful fetch
      if (!rememberForSession) {
        setApiKey("");
        sessionStorage.removeItem("tbaApiKey");
      }
    } catch (err) {
      toast.error("Failed to fetch match data from TBA");
      console.error(err);
    }
  };

  const doneClick = async () => {
    if (apiKey && eventKey) {
      await fetchMatchDataFromTBA(apiKey, eventKey);
    } else {
      toast.error("Please provide match data via API input");
    }
  };
  
  return (
    <main className="h-screen w-full flex flex-col items-center px-4 pt-6 pb-6">
      <div className="flex flex-col items-start gap-4 max-w-md w-full">
        <h1 className="text-2xl font-bold">Load Match Data</h1>
        <div className="w-full max-w-md space-y-3">
          <div className="space-y-1">
            <label htmlFor="apiKey" className="text-sm font-medium">
              TBA API Key
            </label>
            <div className="relative pb-1">
              <Input
                ref={apiInputRef}
                id="apiKey"
                name="tba-api-key"
                type={showApiKey ? "text" : "password"}
                placeholder="Enter your Blue Alliance API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                aria-label={showApiKey ? "Hide API key" : "Show API key"}
              >
                {showApiKey ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            
            {/* Session storage option */}
            <div className="flex items-center space-x-3 mt-2 pb-2 p-3 -ml-1 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <Checkbox
                id="rememberSession"
                checked={rememberForSession}
                onCheckedChange={(checked) => setRememberForSession(checked === true)}
                className="shrink-0"
              />
              <label htmlFor="rememberSession" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                Remember for this session only
              </label>
            </div>
            
            {/* Security notice */}
            <div className="flex items-start space-x-2 mt-2 p-2 bg-amber-50 border border-amber-200 rounded-md">
              <Shield className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800">
                API keys are never stored permanently for security. Use your browser's password manager for convenient access.
              </p>
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="eventKey" className="text-sm font-medium">
              Event Key
            </label>
            <Input
              id="eventKey"
              type="text"
              placeholder="e.g., 2024chcmp"
              value={eventKey}
              onChange={(e) => setEventKey(e.target.value)}
              className="w-full"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Get your API key from <a href="https://www.thebluealliance.com/account" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">The Blue Alliance</a>
          </p>
        </div>
        
        <Button
          className="flex w-full max-w-md h-16 items-center justify-center text-xl text-center"
          onClick={() => doneClick()}
        >
          Submit
        </Button>
      </div>
    </main>
  );
};

export default MatchDataPage;
