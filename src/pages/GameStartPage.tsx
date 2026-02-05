import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import GameStartSelectTeam from "@/components/GameStartComponents/GameStartSelectTeam";
import { EventNameSelector } from "@/components/GameStartComponents/EventNameSelector";
import { createMatchPrediction, getPredictionForMatch } from "@/lib/scoutGameUtils";
import { AlertTriangle } from "lucide-react";
import { fetchQualificationSchedule, resolveTbaApiKey, MATCH_DATA_UPDATED_EVENT } from "@/lib/tbaUtils";
import { ACTIVE_FORM_UPDATED_EVENT, getActiveFormId, syncActiveFormConfig } from "@/lib/activeForm";

const GameStartPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const states = location.state;

  const parsePlayerStation = () => {
    const playerStation = localStorage.getItem("playerStation");
    if (!playerStation) return { alliance: "", teamPosition: 0 };
    
    if (playerStation === "lead") {
      return { alliance: "", teamPosition: 0 };
    }
    
    const parts = playerStation.split("-");
    if (parts.length === 2) {
      const alliance = parts[0];
      const position = parseInt(parts[1]);
      return { alliance, teamPosition: position };
    }
    
    return { alliance: "", teamPosition: 0 };
  };

  const stationInfo = parsePlayerStation();

  const getInitialMatchNumber = () => {
    if (states?.inputs?.matchNumber) {
      return states.inputs.matchNumber;
    }
    
    const storedMatchNumber = localStorage.getItem("currentMatchNumber");
    return storedMatchNumber || "1";
  };

  const [alliance, setAlliance] = useState(
    states?.inputs?.alliance || stationInfo.alliance || ""
  );
  const [matchNumber, setMatchNumber] = useState(getInitialMatchNumber());
  const [debouncedMatchNumber, setDebouncedMatchNumber] = useState(matchNumber);
  const [selectTeam, setSelectTeam] = useState(states?.inputs?.selectTeam || "");
  const [eventName, setEventName] = useState(
    states?.inputs?.eventName || localStorage.getItem("eventName") || ""
  );
  const [predictedWinner, setPredictedWinner] = useState<"red" | "blue" | "none">("none");
  const [autoSyncingMatchData, setAutoSyncingMatchData] = useState(false);
  const lastAutoFetchRef = useRef<{ event: string; timestamp: number } | null>(null);
  const [matchDataVersion, setMatchDataVersion] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem("matchDataUpdatedAt") || "";
    } catch {
      return "";
    }
  });
  const [activeFormId, setActiveFormIdState] = useState(() => getActiveFormId("match"));

  useEffect(() => {
    let cancelled = false;
    syncActiveFormConfig()
      .then((config) => {
        if (!cancelled) {
          setActiveFormIdState(config.match || "");
        }
      })
      .catch((error) => {
        console.warn("Failed to sync active form config", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounce matchNumber for team selection
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedMatchNumber(matchNumber);
    }, 500);
    return () => clearTimeout(timeout);
  }, [matchNumber]);

  // Effect to save match number to localStorage when it changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || !event.storageArea) return;
      if (event.key === "matchData" || event.key === "matchDataUpdatedAt" || event.key === "matchDataEventKey") {
        try {
          const nextVersion = localStorage.getItem("matchDataUpdatedAt") || Date.now().toString();
          setMatchDataVersion(nextVersion);
        } catch {
          setMatchDataVersion(Date.now().toString());
        }
      }
    };

    const handleMatchDataUpdate = () => {
      try {
        const nextVersion = localStorage.getItem("matchDataUpdatedAt") || Date.now().toString();
        setMatchDataVersion(nextVersion);
      } catch {
        setMatchDataVersion(Date.now().toString());
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(MATCH_DATA_UPDATED_EVENT, handleMatchDataUpdate);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(MATCH_DATA_UPDATED_EVENT, handleMatchDataUpdate);
    };
  }, []);

  useEffect(() => {
    if (matchNumber) {
      localStorage.setItem("currentMatchNumber", matchNumber);
    }
  }, [matchNumber]);

  useEffect(() => {
    const trimmedEvent = eventName.trim();
    const parsedMatch = parseInt(debouncedMatchNumber, 10);

    if (!trimmedEvent || Number.isNaN(parsedMatch) || parsedMatch <= 0) {
      return;
    }

    const storedEventKey = localStorage.getItem("matchDataEventKey") || localStorage.getItem("eventName") || "";
    let storedMatches: Array<{ matchNum: number }> = [];
    try {
      const raw = localStorage.getItem("matchData");
      storedMatches = raw ? JSON.parse(raw) : [];
    } catch {
      storedMatches = [];
    }

    const hasMatchForSelection =
      storedEventKey === trimmedEvent &&
      Array.isArray(storedMatches) &&
      storedMatches.some((entry) => typeof entry?.matchNum === "number" && entry.matchNum === parsedMatch);

    if (hasMatchForSelection || autoSyncingMatchData) {
      return;
    }

    const resolvedKey = resolveTbaApiKey();
    if (!resolvedKey) {
      console.warn("TBA API key is not configured; skipping automatic match sync");
      return;
    }

    const now = Date.now();
    if (
      lastAutoFetchRef.current &&
      lastAutoFetchRef.current.event === trimmedEvent &&
      now - lastAutoFetchRef.current.timestamp < 30000
    ) {
      return;
    }
    lastAutoFetchRef.current = { event: trimmedEvent, timestamp: now };

    let cancelled = false;
    setAutoSyncingMatchData(true);

    fetchQualificationSchedule(trimmedEvent, resolvedKey)
      .then((schedule) => {
        if (cancelled || !Array.isArray(schedule) || schedule.length === 0) {
          return;
        }
        try {
          const timestamp = new Date().toISOString();
          localStorage.setItem("matchData", JSON.stringify(schedule));
          localStorage.setItem("matchDataEventKey", trimmedEvent);
          localStorage.setItem("matchDataUpdatedAt", timestamp);
          window.dispatchEvent(new Event(MATCH_DATA_UPDATED_EVENT));
          setMatchDataVersion(timestamp);
        } catch (error) {
          console.error("Failed to cache match data", error);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Failed to auto-sync match data", error);
        toast.error("Couldn't load match schedule from TBA automatically.");
      })
      .finally(() => {
        if (!cancelled) {
          setAutoSyncingMatchData(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [eventName, debouncedMatchNumber, autoSyncingMatchData]);

  // Effect to load existing prediction when match/event changes
  useEffect(() => {
    const loadExistingPrediction = async () => {
      const currentScout = getCurrentScout();
      if (currentScout && eventName && matchNumber) {
        try {
          const existingPrediction = await getPredictionForMatch(currentScout, eventName, matchNumber);
          if (existingPrediction) {
            setPredictedWinner(existingPrediction.predictedWinner);
          } else {
            setPredictedWinner("none");
          }
        } catch (error) {
          console.error("Error loading existing prediction:", error);
          setPredictedWinner("none");
        }
      }
    };

    loadExistingPrediction();
  }, [matchNumber, eventName]);

  const [wager, setWager] = useState<number>(() => {
    const saved = localStorage.getItem('predictionWager')
    const num = saved ? parseInt(saved, 10) : 1
    return Number.isFinite(num) && num > 0 ? num : 1
  })

  useEffect(() => {
    localStorage.setItem('predictionWager', String(wager))
  }, [wager])

  // Function to handle prediction changes and save them immediately
  const handlePredictionChange = async (newPrediction: "red" | "blue" | "none") => {
    setPredictedWinner(newPrediction);
    
    const currentScout = getCurrentScout();
    if (newPrediction !== "none" && currentScout && eventName && matchNumber) {
      try {
  await createMatchPrediction(currentScout, eventName, matchNumber, newPrediction, wager);
        toast.success(`Prediction updated: ${newPrediction} alliance to win`);
      } catch (error) {
        console.error("Error saving prediction:", error);
        toast.error("Failed to save prediction");
      }
    }
  };

  const getCurrentScout = () => {
    return (
      localStorage.getItem("currentScout") ||
      localStorage.getItem("scoutName") ||
      ""
    );
  };

  const validateInputs = () => {
    const currentScout = getCurrentScout();
    const inputs = {
      matchNumber,
      alliance,
      selectTeam,
      scoutName: currentScout,
      eventName,
    };
    const hasNull = Object.values(inputs).some((val) => !val || val === "");

    if (!currentScout) {
      toast.error("Please select a scout from the sidebar first");
      return false;
    }

    if (!eventName) {
      toast.error("Please set an event name/code first");
      return false;
    }

    if (hasNull) {
      toast.error("Fill In All Fields To Proceed");
      return false;
    }
    return true;
  };

  const handleStartScouting = async () => {
    if (!validateInputs()) return;

    const currentScout = getCurrentScout();

    // Save prediction if one was made
    if (predictedWinner !== "none" && currentScout && eventName && matchNumber) {
      try {
  await createMatchPrediction(currentScout, eventName, matchNumber, predictedWinner, wager);
        toast.success(`Prediction saved: ${predictedWinner} alliance to win`);
      } catch (error) {
        console.error("Error saving prediction:", error);
        toast.error("Failed to save prediction");
      }
    }

    // Save inputs to localStorage (similar to ProceedBackButton logic)
    localStorage.setItem("matchNumber", matchNumber);
    localStorage.setItem("selectTeam", selectTeam);
    localStorage.setItem("alliance", alliance);

    localStorage.setItem("autoStateStack", JSON.stringify([]));
    localStorage.setItem("teleopStateStack", JSON.stringify([]));

    const nextRoute = activeFormId ? "/scout-form" : "/auto-start";
    navigate(nextRoute, {
      state: {
        inputs: {
          matchNumber,
          alliance,
          scoutName: currentScout,
          selectTeam,
          eventName,
        },
      },
    });
  };

  const handleGoBack = () => {
    navigate("/");
  };


  const handleMatchNumberChange = (value: string) => {
    setMatchNumber(value);
  };

  useEffect(() => {
    if (!matchNumber) return;
    const timeout = setTimeout(() => {
      localStorage.setItem("currentMatchNumber", matchNumber);
    }, 500);
    return () => clearTimeout(timeout);
  }, [matchNumber]);

  useEffect(() => {
    const handleActiveFormUpdate = () => {
      setActiveFormIdState(getActiveFormId("match"));
    };
    window.addEventListener(ACTIVE_FORM_UPDATED_EVENT, handleActiveFormUpdate);
    return () => {
      window.removeEventListener(ACTIVE_FORM_UPDATED_EVENT, handleActiveFormUpdate);
    };
  }, []);

  const currentScout = getCurrentScout();

  return (
    <div className="min-h-screen w-full flex flex-col items-center px-3 pt-6 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-4 md:pb-10">
      <div className="w-full max-w-2xl px-1">
        <h1 className="text-2xl font-bold pb-4">Game Start</h1>
      </div>
      <div className="flex flex-col items-center gap-6 max-w-2xl w-full flex-1 pb-4">
        
        {!currentScout && (
          <Card className="w-full border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/20">
            <CardContent>
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <span className="text-sm text-amber-700">
                  Please select a scout from the sidebar before starting
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Form Card */}
        <Card className="w-full">
          <CardHeader>
            <CardTitle className="text-xl">Match Information</CardTitle>
            {currentScout && (
              <p className="text-sm text-muted-foreground">
                Scouting as:{" "}
                <span className="font-medium">{currentScout}</span>
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="space-y-2">
              <Label>Event Name/Code</Label>
              <EventNameSelector
                currentEventName={eventName}
                onEventNameChange={setEventName}
              />
              <p className="text-xs text-muted-foreground">
                Event name will be included in all scouting data for this session
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="match-number">Match Number</Label>
                <span className="text-xs text-muted-foreground">
                  Auto-increments after each match
                </span>
              </div>
              <Input
                id="match-number"
                type="number"
                inputMode="numeric"
                placeholder="Enter match number"
                value={matchNumber}
                onChange={(e) => handleMatchNumberChange(e.target.value)}
                className="text-lg"
              />
            </div>

            {/* Alliance Selection with Buttons */}
            <div className="space-y-2">
              <Label>Alliance</Label>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={alliance === "red" ? "default" : "outline"}
                  onClick={() => setAlliance("red")}
                  className={`h-12 text-lg font-semibold ${
                    alliance === "red" 
                      ? "bg-red-500 hover:bg-red-600 text-white" 
                      : "hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                  }`}
                >
                  <Badge 
                    variant={alliance === "red" ? "secondary" : "destructive"} 
                    className={`w-3 h-3 p-0 mr-2 ${alliance === "red" ? "bg-white" : "bg-red-500"}`}
                  />
                  Red Alliance
                </Button>
                <Button
                  variant={alliance === "blue" ? "default" : "outline"}
                  onClick={() => setAlliance("blue")}
                  className={`h-12 text-lg font-semibold ${
                    alliance === "blue" 
                      ? "bg-blue-500 hover:bg-blue-600 text-white" 
                      : "hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300"
                  }`}
                >
                  <Badge 
                    variant={alliance === "blue" ? "secondary" : "default"} 
                    className={`w-3 h-3 p-0 mr-2 ${alliance === "blue" ? "bg-white" : "bg-blue-500"}`}
                  />
                  Blue Alliance
                </Button>
              </div>
            </div>

            {/* Alliance Prediction Selection */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Alliance Prediction (Optional)</Label>
                <span className="text-xs text-muted-foreground">
                  Earn points for correct predictions
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  variant={predictedWinner === "red" ? "default" : "outline"}
                  onClick={() => handlePredictionChange("red")}
                  className={`h-10 text-sm font-medium ${
                    predictedWinner === "red" 
                      ? "bg-red-500 hover:bg-red-600 text-white" 
                      : "hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                  }`}
                >
                  Red Wins
                </Button>
                <Button
                  variant={predictedWinner === "blue" ? "default" : "outline"}
                  onClick={() => handlePredictionChange("blue")}
                  className={`h-10 text-sm font-medium ${
                    predictedWinner === "blue" 
                      ? "bg-blue-500 hover:bg-blue-600 text-white" 
                      : "hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300"
                  }`}
                >
                  Blue Wins
                </Button>
                <Button
                  variant={predictedWinner === "none" ? "default" : "outline"}
                  onClick={() => handlePredictionChange("none")}
                  className="h-10 text-sm font-medium"
                >
                  No Prediction
                </Button>
              </div>
              {predictedWinner !== "none" && (
                <p className="text-xs text-muted-foreground">
                  Predicting <span className="font-medium capitalize">{predictedWinner} Alliance</span> will win this match
                </p>
              )}
              {predictedWinner !== "none" && (
                <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="prediction-wager">Wager (Pis)</Label>
                    <Input
                      id="prediction-wager"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={wager}
                      onChange={(e) => {
                        const next = parseInt(e.target.value || "0", 10);
                        if (!Number.isFinite(next)) return;
                        setWager(Math.max(1, Math.floor(next)));
                      }}
                      className="max-w-[10rem]"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Correct: earn wager Pis (plus streak bonus). Wrong: lose wager Pis.
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary" className="whitespace-nowrap">Wager: {wager} Pi{wager === 1 ? "" : "s"}</Badge>
                  </div>
                </div>
              )}
            </div>

            {/* Team Selection */}
            <div className="space-y-2">
              <Label>Team Selection</Label>
              <GameStartSelectTeam
                defaultSelectTeam={selectTeam}
                setSelectTeam={setSelectTeam}
                selectedMatch={debouncedMatchNumber}
                selectedAlliance={alliance}
                eventKey={eventName}
                matchDataVersion={matchDataVersion}
                preferredTeamPosition={stationInfo.teamPosition}
              />
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4 w-full">
          <Button
            variant="outline"
            onClick={handleGoBack}
            className="flex-1 h-12 text-lg"
          >
            Back
          </Button>
          <Button
            onClick={handleStartScouting}
            className="flex-2 h-12 text-lg font-semibold"
            disabled={!matchNumber || !alliance || !selectTeam || !currentScout || !eventName}
          >
            {activeFormId ? "Start Scouting (Dynamic)" : "Start Scouting"}
          </Button>
        </div>

        {/* Status Indicator */}
        {matchNumber && alliance && selectTeam && currentScout && eventName && (
          <Card className="w-full border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/20">
            <CardContent>
              <div className="flex items-center gap-2">
                <Badge className="bg-green-600">Ready</Badge>
                <span className="text-sm text-green-700 dark:text-green-300">
                  {eventName} • Match {matchNumber} •{" "}
                  {alliance.charAt(0).toUpperCase() + alliance.slice(1)} Alliance
                  • Team {selectTeam} • {currentScout}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bottom spacing for mobile */}
        <div className="h-8 md:h-6" />
      </div>
    </div>
  );
};

export default GameStartPage;
